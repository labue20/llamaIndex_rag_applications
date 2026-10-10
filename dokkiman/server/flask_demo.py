import io
import os
from multiprocessing.managers import BaseManager
from flask import Flask, g, request, jsonify, make_response, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import fitz  # PyMuPDF for PDF to Word conversion
from pdf_to_word_service import convert_pdf_to_word_document, validate_pdf_file
from word_to_pdf_service import ConversionError, converter
from split_pdf_service import SPLIT_MODES, SplitError, split_pdf, zip_parts
from compress_pdf_service import CompressError, compress_pdf
from sign_pdf_service import SignError, sign_pdf
from edit_pdf_service import IMAGE_TYPES, EditError, edit_pdf, images_to_pdf, text_lines
from signature_log import save_signature_record
from pathlib import Path
import shutil
import tempfile
import uuid
import zipfile
from auth import init_auth, current_user_id
from billing import billing_bp
from signature_requests import requests_bp
from folders import document_folder_map, file_document, folders_bp, forget_document
from account import account_bp
from admin import admin_bp
from support import support_bp
from werkzeug.middleware.proxy_fix import ProxyFix
import config
from config import MAX_UPLOAD_MB, MAX_UPLOAD_BYTES, TRUSTED_PROXY_COUNT
from plans import (
    document_limit_error,
    limit_conversions,
    record_document,
    public_plan_info,
    question_limit_error,
    record_question,
)

app = Flask(__name__)

# Behind a reverse proxy (Caddy in production), use the visitor's address from
# X-Forwarded-For so rate limits apply per visitor, not to the proxy
if TRUSTED_PROXY_COUNT > 0:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=TRUSTED_PROXY_COUNT, x_proto=TRUSTED_PROXY_COUNT)

# Reject request bodies over this size (uploads included) with a 413
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

# Only the React app may call this API from a browser
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]
# Credentials are needed so the browser sends the session cookie; the frontend
# reads download file names from Content-Disposition
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True,
     expose_headers=["Content-Disposition", "X-Document-SHA256", "X-Audit-Record-Id"])

# Interface the API listens on; 127.0.0.1 keeps it off the local network
API_HOST = os.environ.get("API_HOST", "127.0.0.1")
API_PORT = int(os.environ.get("API_PORT", "5601"))

# The index server speaks pickle, so it must stay on localhost and use a secret key
INDEX_SERVER_ADDRESS = ("127.0.0.1", int(os.environ.get("INDEX_PORT", "5602")))
INDEX_SERVER_FUNCTIONS = [
    'query_index',
    'chat_with_document',
    'insert_into_index',
    'get_documents_list',
    'get_full_document_content',
    'delete_document',
    'background_index_document',
    'claim_unowned_documents',
    'get_document_file',
    'ping',
    'claim_guest_documents',
    'document_counts',
    'rename_document',
]


def _connect_index_server():
    authkey = os.environ.get("INDEX_SERVER_AUTHKEY")
    if not authkey:
        raise SystemExit("INDEX_SERVER_AUTHKEY is not set. Start the backend with start_services.sh.")
    index_manager = BaseManager(INDEX_SERVER_ADDRESS, authkey.encode())
    for name in INDEX_SERVER_FUNCTIONS:
        index_manager.register(name)
    index_manager.connect()
    return index_manager


class _IndexServerConnection:
    """Connects to the index server on first use, so importing this module
    (e.g. in tests, which substitute a fake) doesn't need a running index server."""

    def __init__(self):
        self._manager = None

    def connect(self):
        if self._manager is None:
            self._manager = _connect_index_server()

    def __getattr__(self, name):
        self.connect()
        return getattr(self._manager, name)


manager = _IndexServerConnection()

# Login is required for every route except the auth endpoints
app.config["ON_FIRST_USER"] = lambda user_id: manager.claim_unowned_documents(user_id)._getvalue()
# A guest who signs up or logs in keeps the document they were trying
app.config["ON_GUEST_CLAIM"] = lambda guest_id, user_id: manager.claim_guest_documents(guest_id, user_id)._getvalue()
init_auth(app)
app.register_blueprint(billing_bp)
app.register_blueprint(requests_bp)
app.register_blueprint(folders_bp)
app.register_blueprint(account_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(support_bp)
# Blueprints reach the index server through this (tests swap `manager`)
app.config["INDEX_MANAGER"] = lambda: manager
if config.STRIPE_CONFIG_ERROR:
    app.logger.error("Stripe: %s", config.STRIPE_CONFIG_ERROR)
elif config.STRIPE_SECRET_KEY:
    app.logger.info("Stripe payments on (%s mode)", config.STRIPE_MODE)


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({"error": f"File is too large. The maximum size is {MAX_UPLOAD_MB} MB."}), 413


@app.route("/queryFile", methods=["GET"])
def query_index_route():
    global manager
    query_text = request.args.get("text", None)
    if query_text is None:
        return "No text found, please include a ?text=blah parameter in the URL", 400

    limit_error = question_limit_error(current_user_id())
    if limit_error:
        return limit_error

    response = manager.query_index(query_text, current_user_id())._getvalue()
    record_question(current_user_id())
    response_json = {
        "text": str(response)
    }
    return make_response(jsonify(response_json)), 200


@app.route("/uploadFile", methods=["POST"])
def upload_file():
    global manager
    if 'file' not in request.files:
        return "Please send a POST request with a file", 400
    
    limit_error = document_limit_error(
        current_user_id(), len(manager.get_documents_list(current_user_id())._getvalue())
    )
    if limit_error:
        return limit_error

    filepath = None
    try:
        uploaded_file = request.files["file"]
        filename = secure_filename(uploaded_file.filename) or "document"
        # A random ID keeps documents with the same name (or from different users) apart
        doc_id = uuid.uuid4().hex
        os.makedirs('documents', exist_ok=True)
        filepath = os.path.join('documents', f"{doc_id}_{filename}")
        uploaded_file.save(filepath)

        # Get processing mode from form data (default to "ultra-fast")
        processing_mode = request.form.get("processing_mode", "ultra-fast")
        
        # Validate processing mode
        if processing_mode not in ["ultra-fast", "fast", "enhanced"]:
            processing_mode = "ultra-fast"

        result = manager.insert_into_index(
            filepath, doc_id, processing_mode, current_user_id(), filename
        )._getvalue()
        
        # Keep the original so it can be reused from My Documents (and indexed
        # later by /backgroundIndex); it's deleted with the document
        if result and result.get("success"):
            filepath = None
            record_document(current_user_id())

        # Return detailed result
        if result and result.get("success"):
            return jsonify({
                "message": "File processed successfully!",
                "doc_id": result.get("doc_id"),
                "nodes_created": result.get("nodes_created"),
                "processing_time": result.get("processing_time", 0),
                "processing_mode": result.get("processing_mode"),
                "chunking_strategy": result.get("chunking_strategy")
            }), 200
        else:
            return jsonify({
                "error": result.get("error", "Unknown error occurred")
            }), 500
            
    except Exception:
        # Details go to the log, not to the browser (they can reveal internals)
        app.logger.exception("Upload failed")
        return jsonify({
            "error": "The file couldn't be processed. Please try again, or try another file."
        }), 500

    finally:
        # Remove the saved file if the upload didn't succeed
        if filepath is not None and os.path.exists(filepath):
            os.remove(filepath)


@app.route("/chat", methods=["POST"])
def chat_with_document():
    """Chat with a specific document."""
    global manager
    
    try:
        data = request.get_json()
        if not data:
            return make_response(jsonify({
                "error": "Request body must be JSON"
            })), 400
        
        message = data.get('message')
        document_id = data.get('documentId')
        
        if not message:
            return make_response(jsonify({
                "error": "Message is required"
            })), 400
            
        if not document_id:
            return make_response(jsonify({
                "error": "Document ID is required"
            })), 400
        
        limit_error = question_limit_error(current_user_id())
        if limit_error:
            return limit_error

        result = manager.chat_with_document(message, document_id, current_user_id())._getvalue()
        
        if result.get("error"):
            return make_response(jsonify({
                "error": result["error"]
            })), 400

        record_question(current_user_id())
            
        return make_response(jsonify({
            "response": result.get("response", "No response generated"),
            "document_id": result.get("document_id"),
            "document_name": result.get("document_name"),
            "note": result.get("note")
        })), 200
        
    except Exception:
        app.logger.exception("Chat failed")
        return make_response(jsonify({
            "error": "Something went wrong answering that. Please try again."
        })), 500


@app.route("/getDocuments", methods=["GET"])
def get_documents():
    document_list = manager.get_documents_list(current_user_id())._getvalue()
    # Which folder each document is in (None: not in a folder)
    folder_of = {} if g.user.get("guest") else document_folder_map(current_user_id())
    for document in document_list:
        document["folder_id"] = folder_of.get(document.get("id"))

    return make_response(jsonify(document_list)), 200


@app.route("/getFullDocument/<doc_id>", methods=["GET"])
def get_full_document(doc_id):
    """Get the complete content and analysis of a specific document."""
    global manager
    
    try:
        result = manager.get_full_document_content(doc_id, current_user_id())._getvalue()
        
        if result.get("error"):
            return make_response(jsonify(result)), 404
            
        return make_response(jsonify(result)), 200
        
    except Exception:
        app.logger.exception("Couldn't load a document")
        return make_response(jsonify({
            "error": "The document couldn't be loaded. Please try again."
        })), 500


# Word documents converted to PDF for viewing, made once and kept until the document is deleted
PREVIEW_DIR = "previews"


def _stored_file(doc_id):
    """(path, file name, None) for one of the user's stored originals, or
    (None, None, error response) when there isn't one."""
    result = manager.get_document_file(doc_id, current_user_id())._getvalue()
    if result.get("error"):
        return None, None, (jsonify({"error": result["error"]}), 404)

    # Only ever serve files from the uploads folder
    documents_dir = os.path.realpath("documents")
    path = os.path.realpath(result["path"])
    if os.path.commonpath([documents_dir, path]) != documents_dir:
        return None, None, (jsonify({"error": "File not found"}), 404)
    return path, result["file_name"], None


def _preview_path(doc_id):
    return os.path.abspath(os.path.join(PREVIEW_DIR, f"{secure_filename(doc_id) or 'document'}.pdf"))


@app.route("/documents/<doc_id>/file", methods=["GET"])
def get_document_file(doc_id):
    """Download the original file of one of the user's documents."""
    path, file_name, problem = _stored_file(doc_id)
    if problem:
        return problem
    return send_file(path, as_attachment=True, download_name=file_name)


@app.route("/documents/<doc_id>/preview", methods=["GET"])
def preview_document(doc_id):
    """One of the user's documents as a PDF to look at in the browser: a PDF as
    it is, a Word document converted (once). Other files are shown as text by
    the browser, from /file."""
    path, _, problem = _stored_file(doc_id)
    if problem:
        return problem
    extension = Path(path).suffix.lower()
    if extension == ".pdf":
        return send_file(path, mimetype="application/pdf", max_age=0)
    if extension != ".docx":
        return jsonify({"error": "This kind of file can't be shown here. Download it to open it."}), 415

    preview = _preview_path(doc_id)
    if not os.path.exists(preview) or os.path.getmtime(preview) < os.path.getmtime(path):
        if not zipfile.is_zipfile(path):
            return jsonify({"error": "This Word document can't be shown. Download it to open it."}), 415
        os.makedirs(PREVIEW_DIR, exist_ok=True)
        # Written next to its final place, then swapped in, so a half-made preview is never served
        partial = f"{preview}.{uuid.uuid4().hex}.part.pdf"
        try:
            converter.convert_docx_to_pdf(path, partial)
            os.replace(partial, preview)
        except ConversionError as e:
            app.logger.error(f"Word preview conversion error: {e}")
            return jsonify({"error": "This Word document can't be shown right now. Download it to open it."}), 500
        except Exception:
            app.logger.exception("Word preview conversion failed")
            return jsonify({"error": "This Word document can't be shown right now. Download it to open it."}), 500
        finally:
            if os.path.exists(partial):
                os.remove(partial)
    return send_file(preview, mimetype="application/pdf", max_age=0)


MAX_DOCUMENT_NAME = 200


@app.route("/documents/<doc_id>", methods=["PATCH"])
def rename_document(doc_id):
    """Rename one of the user's documents. Its file type stays: "Lease" for
    "lease.pdf" becomes "Lease.pdf"."""
    _, file_name, problem = _stored_file(doc_id)
    if problem:
        return problem
    data = request.get_json(silent=True) or {}
    # One line of printable text; slashes would read like folders
    name = "".join(ch for ch in " ".join(str(data.get("name", "")).split()) if ch.isprintable())
    name = name.replace("/", "-").replace("\\", "-").strip(" .")
    if not name:
        return jsonify({"error": "Type a name for the document."}), 400
    extension = Path(file_name).suffix
    if extension and not name.lower().endswith(extension.lower()):
        name += extension
    if len(name) > MAX_DOCUMENT_NAME:
        return jsonify({"error": f"Names can be up to {MAX_DOCUMENT_NAME} characters."}), 400

    result = manager.rename_document(doc_id, current_user_id(), name)._getvalue()
    if result.get("error"):
        return jsonify({"error": "That document wasn't found."}), 404
    return jsonify({"doc_id": doc_id, "filename": name}), 200


@app.route("/documents/<doc_id>/copy", methods=["POST"])
def copy_document(doc_id):
    """Make a copy of one of the user's documents, named "Copy of ...", in the
    same folder. It counts toward the plan's documents like an upload."""
    path, file_name, problem = _stored_file(doc_id)
    if problem:
        return problem
    owner_id = current_user_id()
    limit_error = document_limit_error(owner_id, len(manager.get_documents_list(owner_id)._getvalue()))
    if limit_error:
        return limit_error

    copy_name = f"Copy of {file_name}"
    copy_id = uuid.uuid4().hex
    copy_path = os.path.join("documents", f"{copy_id}_{secure_filename(copy_name) or 'document'}")
    try:
        shutil.copyfile(path, copy_path)
        result = manager.insert_into_index(copy_path, copy_id, "ultra-fast", owner_id, copy_name)._getvalue()
        if not (result and result.get("success")):
            raise RuntimeError(result.get("error") if result else "no result")
    except Exception:
        app.logger.exception("Couldn't copy a document")
        if os.path.exists(copy_path):
            os.remove(copy_path)
        return jsonify({"error": "The copy couldn't be made. Please try again."}), 500

    record_document(owner_id)
    folder_id = document_folder_map(owner_id).get(doc_id)
    if folder_id:
        file_document(owner_id, copy_id, folder_id)
    return jsonify({"doc_id": copy_id, "filename": copy_name, "folder_id": folder_id}), 201


@app.route("/documents/<doc_id>", methods=["DELETE"])
def delete_document(doc_id):
    """Delete a document from the index."""
    global manager
    
    try:
        result = manager.delete_document(doc_id, current_user_id())._getvalue()
        
        if result.get("error"):
            return make_response(jsonify(result)), 400
        if not g.user.get("guest"):
            forget_document(current_user_id(), doc_id)
        if os.path.exists(_preview_path(doc_id)):
            os.remove(_preview_path(doc_id))
            
        return make_response(jsonify(result)), 200
        
    except Exception:
        app.logger.exception("Couldn't delete a document")
        return make_response(jsonify({
            "error": "The document couldn't be deleted. Please try again."
        })), 500


@app.route("/convertPdfToWord", methods=["POST"])
@limit_conversions
def convert_pdf_to_word():
    """Convert PDF to Word document using PyMuPDF."""
    try:
        # Check if file is present
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        uploaded_file = request.files["file"]
        
        # Validate the uploaded file
        is_valid, error_message = validate_pdf_file(uploaded_file)
        if not is_valid:
            return jsonify({"error": error_message}), 400
        
        # Read PDF content directly from memory
        pdf_content = uploaded_file.read()
        
        # Convert PDF to Word using our module
        doc_buffer = convert_pdf_to_word_document(pdf_content, uploaded_file.filename)
        
        # Generate output filename
        output_filename = uploaded_file.filename.replace('.pdf', '_converted.docx')
        
        return send_file(
            doc_buffer,
            as_attachment=True,
            download_name=output_filename,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        
    except fitz.FileDataError:
        return jsonify({"error": "Invalid PDF file or corrupted PDF"}), 400
    except Exception:
        app.logger.exception("PDF to Word conversion failed")
        return jsonify({"error": "The PDF couldn't be converted. It may be damaged or unusual."}), 500


def _docx_to_pdf(file, stem):
    """An uploaded .docx (already checked to be a ZIP) as PDF bytes, made by LibreOffice."""
    # A private folder per conversion, removed (with both files) when done
    with tempfile.TemporaryDirectory(prefix="word-to-pdf-") as work_dir:
        input_path = Path(work_dir) / f"{stem}.docx"
        output_path = Path(work_dir) / f"{stem}.pdf"
        file.save(input_path)
        converter.convert_docx_to_pdf(input_path, output_path)
        return output_path.read_bytes()


@app.route("/convertWordToPdf", methods=["POST"])
@limit_conversions
def convert_word_to_pdf():
    """Convert an uploaded .docx Word document to PDF and return it as a download."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    if not file.filename.lower().endswith('.docx'):
        return jsonify({'error': 'File must be a .docx document'}), 400

    # A .docx is a ZIP archive; reject anything else rather than letting
    # LibreOffice try to interpret arbitrary file formats
    if not zipfile.is_zipfile(file.stream):
        return jsonify({'error': 'File must be a .docx document'}), 400
    file.stream.seek(0)

    # Never use the uploaded name in a path as-is: it could contain ../ or /
    stem = secure_filename(Path(file.filename).stem) or "document"

    try:
        pdf_bytes = _docx_to_pdf(file, stem)
    except ConversionError as e:
        # Written for people ("took too long", "may be damaged"): safe to show
        app.logger.error(f"Word to PDF conversion error: {e}")
        return jsonify({'error': str(e)}), 500
    except Exception:
        app.logger.exception("Word to PDF conversion failed")
        return jsonify({'error': "The document couldn't be converted. Please try again."}), 500

    return send_file(
        io.BytesIO(pdf_bytes),
        as_attachment=True,
        download_name=f"{stem}_converted.pdf",
        mimetype='application/pdf'
    )


@app.route("/splitPdf", methods=["POST"])
@limit_conversions
def split_pdf_route():
    """Split an uploaded PDF. Form fields: file, mode (every | ranges | extract),
    ranges (e.g. "1-3, 5"; not used for mode=every). Returns one PDF, or a ZIP
    when the split produces several files."""
    uploaded_file = request.files.get("file")
    is_valid, error_message = validate_pdf_file(uploaded_file)
    if not is_valid:
        return jsonify({"error": error_message}), 400

    mode = request.form.get("mode", "every")
    if mode not in SPLIT_MODES:
        return jsonify({"error": "Choose how to split the PDF."}), 400

    stem = secure_filename(Path(uploaded_file.filename).stem) or "document"
    try:
        parts = split_pdf(uploaded_file.read(), mode, request.form.get("ranges", ""))
    except SplitError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        app.logger.error(f"Split PDF error: {str(e)}")
        return jsonify({"error": "The PDF could not be split."}), 500

    if len(parts) == 1:
        label, data = parts[0]
        return send_file(io.BytesIO(data), as_attachment=True,
                         download_name=f"{stem}_{label}.pdf", mimetype="application/pdf")

    return send_file(io.BytesIO(zip_parts(parts, stem)), as_attachment=True,
                     download_name=f"{stem}_split.zip", mimetype="application/zip")


@app.route("/compressPdf", methods=["POST"])
@limit_conversions
def compress_pdf_route():
    """Make an uploaded PDF smaller. Form fields: file, level (light |
    recommended | strong). Returns the PDF (the original when it can't be made
    smaller; the browser compares the sizes)."""
    uploaded_file = request.files.get("file")
    is_valid, error_message = validate_pdf_file(uploaded_file)
    if not is_valid:
        return jsonify({"error": error_message}), 400

    stem = secure_filename(Path(uploaded_file.filename).stem) or "document"
    try:
        data = compress_pdf(uploaded_file.read(), request.form.get("level", "recommended"))
    except CompressError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        app.logger.error(f"Compress PDF error: {str(e)}")
        return jsonify({"error": "The PDF could not be compressed."}), 500

    return send_file(io.BytesIO(data), as_attachment=True,
                     download_name=f"{stem}_compressed.pdf", mimetype="application/pdf")


@app.route("/health", methods=["GET"])
def health():
    """For monitoring and deploy checks: is the API up and can it reach the index server?"""
    try:
        index_ok = bool(manager.ping()._getvalue())
    except Exception as e:
        app.logger.error(f"Health check: index server unreachable: {e}")
        index_ok = False
    status = 200 if index_ok else 503
    return jsonify({"status": "ok" if index_ok else "degraded", "index_server": index_ok}), status


@app.route("/signPdf", methods=["POST"])
@limit_conversions
def sign_pdf_route():
    """Stamp signatures, initials and dates onto a PDF.

    Form fields: file (the PDF); placements (JSON list of items with page,
    x, y, width, height as fractions of the page as shown, type "image" with
    an index into the uploaded images, or "text" with text); images (PNG/JPEG
    files, in order); audit ("true"/"false", default true: add an audit page).
    """
    uploaded_file = request.files.get("file")
    is_valid, error_message = validate_pdf_file(uploaded_file)
    if not is_valid:
        return jsonify({"error": error_message}), 400

    stem = secure_filename(Path(uploaded_file.filename).stem) or "document"
    signer = "Guest (not signed in)" if g.user.get("guest") else g.user["email"]
    try:
        signed, record = sign_pdf(
            uploaded_file.read(),
            request.form.get("placements", ""),
            [image.read() for image in request.files.getlist("images")],
            file_name=Path(uploaded_file.filename).name,
            signer=signer,
            ip_address=request.remote_addr,
            add_audit_trail=request.form.get("audit", "true").lower() != "false",
        )
    except SignError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        app.logger.error(f"Sign PDF error: {str(e)}")
        return jsonify({"error": "The PDF could not be signed."}), 500

    save_signature_record(record, None if g.user.get("guest") else g.user["id"])
    response = send_file(io.BytesIO(signed), as_attachment=True,
                         download_name=f"{stem}_signed.pdf", mimetype="application/pdf")
    response.headers["X-Document-SHA256"] = record["final_sha256"]
    response.headers["X-Audit-Record-Id"] = record["id"]
    return response


@app.route("/editPdf", methods=["POST"])
@limit_conversions
def edit_pdf_route():
    """Organize pages and add text, images, highlights, shapes, white-out and
    drawings to a PDF, and fill in its form fields.

    Form fields: file (the PDF); files (PDFs merged in, in order); images
    (PNG/JPEG files, in order); edits (JSON: pages, items, form; see
    edit_pdf_service.py). Returns the edited PDF.
    """
    uploaded_file = request.files.get("file")
    is_valid, error_message = validate_pdf_file(uploaded_file)
    if not is_valid:
        return jsonify({"error": error_message}), 400
    extras = request.files.getlist("files")
    for extra in extras:
        is_valid, error_message = validate_pdf_file(extra)
        if not is_valid:
            return jsonify({"error": f"{extra.filename or 'A PDF to combine'}: {error_message}"}), 400

    stem = secure_filename(Path(uploaded_file.filename).stem) or "document"
    try:
        edited = edit_pdf(
            uploaded_file.read(),
            [extra.read() for extra in extras],
            request.form.get("edits", ""),
            [image.read() for image in request.files.getlist("images")],
        )
    except EditError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        app.logger.exception("Edit PDF error")
        return jsonify({"error": "The PDF could not be edited."}), 500

    return send_file(io.BytesIO(edited), as_attachment=True,
                     download_name=f"{stem}_edited.pdf", mimetype="application/pdf")


@app.route("/toPdf", methods=["POST"])
@limit_conversions
def to_pdf_route():
    """A Word document (.docx) or an image (PNG, JPEG, WebP) as a PDF, so Edit
    PDF can open them (form field: file)."""
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "No file selected"}), 400
    extension = Path(file.filename).suffix.lower().lstrip(".")
    stem = secure_filename(Path(file.filename).stem) or "document"
    try:
        if extension == "docx":
            if not zipfile.is_zipfile(file.stream):
                return jsonify({"error": "That Word file couldn't be read. Save it as .docx and try again."}), 400
            file.stream.seek(0)
            pdf_bytes = _docx_to_pdf(file, stem)
        elif extension in IMAGE_TYPES:
            pdf_bytes = images_to_pdf(file.read(), Path(file.filename).name)
        else:
            return jsonify({"error": "Open a PDF, a Word document (.docx) or an image (PNG or JPEG)."}), 400
    except (ConversionError, EditError) as e:
        return jsonify({"error": str(e)}), 400 if isinstance(e, EditError) else 500
    except Exception:
        app.logger.exception("To PDF failed")
        return jsonify({"error": "The file couldn't be opened. Please try again."}), 500
    return send_file(io.BytesIO(pdf_bytes), as_attachment=True, download_name=f"{stem}.pdf",
                     mimetype="application/pdf")


@app.route("/pdfText", methods=["POST"])
def pdf_text_route():
    """The lines of text on each page of an uploaded PDF, with their position
    and style, so Edit PDF can let people change them (form field: file)."""
    uploaded_file = request.files.get("file")
    is_valid, error_message = validate_pdf_file(uploaded_file)
    if not is_valid:
        return jsonify({"error": error_message}), 400
    try:
        return jsonify({"pages": text_lines(uploaded_file.read())})
    except EditError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        app.logger.exception("PDF text error")
        return jsonify({"error": "The text in this PDF couldn't be read."}), 500


@app.route("/plans", methods=["GET"])
def plans():
    """Free-trial terms (public, shown on the homepage)."""
    return jsonify(public_plan_info()), 200


@app.route("/")
def home():
    return "Dokkiman API"


@app.route("/backgroundIndex/<doc_id>", methods=["POST"])
def background_index(doc_id):
    """Trigger background indexing for a document."""
    global manager
    try:
        # Run background indexing in a separate thread to avoid blocking
        import threading
        owner_id = current_user_id()
        
        def run_background_indexing():
            result = manager.background_index_document(doc_id, owner_id)
            print(f"Background indexing result for {doc_id}: {result}")
        
        thread = threading.Thread(target=run_background_indexing)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "message": f"Background indexing started for document {doc_id}",
            "status": "processing"
        }), 200
        
    except Exception:
        app.logger.exception("Couldn't start background indexing")
        return jsonify({
            "error": "Couldn't start processing the document. Please try again."
        }), 500


if __name__ == "__main__":
    # Fail fast if the index server isn't reachable
    manager.connect()
    app.run(host=API_HOST, port=API_PORT)

