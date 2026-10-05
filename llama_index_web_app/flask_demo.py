import os
from multiprocessing.managers import BaseManager
from flask import Flask, request, jsonify, make_response, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import fitz  # PyMuPDF for PDF to Word conversion
from pdf_to_word_service import convert_pdf_to_word_document, validate_pdf_file
from word_to_pdf_service import converter
from pathlib import Path
import tempfile
import uuid

app = Flask(__name__)
CORS(app)

# initialize manager connection
# NOTE: you might want to handle the password in a less hardcoded way
manager = BaseManager(('', 5602), b'password')
manager.register('query_index')
manager.register('chat_with_document')
manager.register('insert_into_index')
manager.register('get_documents_list')
manager.register('get_full_document_content')
manager.register('delete_document')
manager.connect()


@app.route("/queryFile", methods=["GET"])
def query_index_route():
    global manager
    query_text = request.args.get("text", None)
    if query_text is None:
        return "No text found, please include a ?text=blah parameter in the URL", 400

    response = manager.query_index(query_text)._getvalue()
    response_json = {
        "text": str(response)
    }
    return make_response(jsonify(response_json)), 200


@app.route("/uploadFile", methods=["POST"])
def upload_file():
    global manager
    if 'file' not in request.files:
        return "Please send a POST request with a file", 400
    
    filepath = None
    try:
        uploaded_file = request.files["file"]
        filename = secure_filename(uploaded_file.filename)
        os.makedirs('documents', exist_ok=True)
        filepath = os.path.join('documents', os.path.basename(filename))
        uploaded_file.save(filepath)

        # Get processing mode from form data (default to "ultra-fast")
        processing_mode = request.form.get("processing_mode", "ultra-fast")
        
        # Validate processing mode
        if processing_mode not in ["ultra-fast", "fast", "enhanced"]:
            processing_mode = "ultra-fast"

        if request.form.get("filename_as_doc_id", None) is not None:
            result = manager.insert_into_index(filepath, doc_id=filename, processing_mode=processing_mode)
        else:
            result = manager.insert_into_index(filepath, processing_mode=processing_mode)
        
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
            
    except Exception as e:
        # cleanup temp file
        if filepath is not None and os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({
            "error": f"Processing failed: {str(e)}"
        }), 500

    finally:
        # cleanup temp file
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
        
        result = manager.chat_with_document(message, document_id)._getvalue()
        
        if result.get("error"):
            return make_response(jsonify({
                "error": result["error"]
            })), 400
            
        return make_response(jsonify({
            "response": result.get("response", "No response generated"),
            "document_id": result.get("document_id"),
            "document_name": result.get("document_name")
        })), 200
        
    except Exception as e:
        return make_response(jsonify({
            "error": f"Chat request failed: {str(e)}"
        })), 500


@app.route("/getDocuments", methods=["GET"])
def get_documents():
    document_list = manager.get_documents_list()._getvalue()

    return make_response(jsonify(document_list)), 200


@app.route("/getFullDocument/<doc_id>", methods=["GET"])
def get_full_document(doc_id):
    """Get the complete content and analysis of a specific document."""
    global manager
    
    try:
        result = manager.get_full_document_content(doc_id)._getvalue()
        
        if result.get("error"):
            return make_response(jsonify(result)), 404
            
        return make_response(jsonify(result)), 200
        
    except Exception as e:
        return make_response(jsonify({
            "error": f"Failed to retrieve document: {str(e)}"
        })), 500


@app.route("/documents/<doc_id>", methods=["DELETE"])
def delete_document(doc_id):
    """Delete a document from the index."""
    global manager
    
    try:
        result = manager.delete_document(doc_id)._getvalue()
        
        if result.get("error"):
            return make_response(jsonify(result)), 400
            
        return make_response(jsonify(result)), 200
        
    except Exception as e:
        return make_response(jsonify({
            "error": f"Failed to delete document: {str(e)}"
        })), 500


@app.route("/convertPdfToWord", methods=["POST"])
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
    except Exception as e:
        app.logger.error(f"PDF to Word conversion failed: {str(e)}")
        return jsonify({"error": f"Conversion failed: {str(e)}"}), 500


@app.route("/convertWordToPdf", methods=["POST"])
def convert_word_to_pdf():
    """
    Convert Word document to PDF
    
    Expects:
        - File upload with key 'file'
        - Optional: 'output_filename' parameter
    
    Returns:
        - PDF file download on success
        - JSON error response on failure
    """
    try:
        # Check if file is present in request
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.docx'):
            return jsonify({'error': 'File must be a .docx document'}), 400
        
        # Generate unique filename to avoid conflicts
        unique_id = str(uuid.uuid4())
        input_filename = f"{unique_id}_{file.filename}"
        output_filename = f"{unique_id}_{Path(file.filename).stem}.pdf"
        
        # Save uploaded file temporarily
        temp_input_path = Path(tempfile.gettempdir()) / input_filename
        file.save(temp_input_path)
        
        try:
            # Convert to PDF
            output_path = converter.convert_docx_to_pdf(
                temp_input_path, 
                Path(tempfile.gettempdir()) / output_filename
            )
            
            # Generate download filename
            download_filename = file.filename.replace('.docx', '_converted.pdf')
            
            # Return the PDF file directly
            return send_file(
                output_path,
                as_attachment=True,
                download_name=download_filename,
                mimetype='application/pdf'
            )
            
        finally:
            # Clean up input file
            if temp_input_path.exists():
                temp_input_path.unlink()
            # Clean up output file after sending (Flask handles this automatically)
    
    except Exception as e:
        app.logger.error(f"Word to PDF conversion error: {str(e)}")
        return jsonify({'error': f'Conversion failed: {str(e)}'}), 500


@app.route("/convertWordToPdfInfo", methods=["POST"])
def convert_word_to_pdf_info():
    """
    Convert Word document to PDF and return conversion information
    
    Expects:
        - File upload with key 'file'
    
    Returns:
        - JSON response with conversion status and download URL
    """
    try:
        # Check if file is present in request
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.docx'):
            return jsonify({'error': 'File must be a .docx document'}), 400
        
        # Generate unique filename to avoid conflicts
        unique_id = str(uuid.uuid4())
        input_filename = f"{unique_id}_{file.filename}"
        output_filename = f"{unique_id}_{Path(file.filename).stem}.pdf"
        
        # Save uploaded file temporarily
        temp_input_path = Path(tempfile.gettempdir()) / input_filename
        file.save(temp_input_path)
        
        try:
            # Convert to PDF
            output_path = converter.convert_docx_to_pdf(
                temp_input_path, 
                Path(tempfile.gettempdir()) / output_filename
            )
            
            # Get file information
            input_info = converter.get_file_info(temp_input_path)
            output_info = converter.get_file_info(output_path)
            
            response_data = {
                'status': 'success',
                'message': 'Document converted successfully',
                'input_file': input_info,
                'output_file': output_info,
                'download_url': f'/downloadPdf/{Path(output_path).name}'
            }
            
            return jsonify(response_data), 200
            
        finally:
            # Clean up input file
            if temp_input_path.exists():
                temp_input_path.unlink()
    
    except Exception as e:
        app.logger.error(f"Word to PDF conversion error: {str(e)}")
        return jsonify({'error': f'Conversion failed: {str(e)}'}), 500


@app.route('/downloadPdf/<filename>')
def download_pdf_file(filename):
    """
    Download converted PDF file
    
    Args:
        filename (str): Name of the file to download
        
    Returns:
        File download response
    """
    try:
        file_path = Path(tempfile.gettempdir()) / filename
        
        if not file_path.exists():
            return jsonify({'error': 'File not found'}), 404
        
        return send_file(file_path, as_attachment=True, download_name=filename)
    
    except Exception as e:
        app.logger.error(f"Download error: {str(e)}")
        return jsonify({'error': f'Download failed: {str(e)}'}), 500
    

@app.route("/")
def home():
    return "Hello, World! Welcome to the llama_index docker image!"


@app.route("/backgroundIndex/<doc_id>", methods=["POST"])
def background_index(doc_id):
    """Trigger background indexing for a document."""
    global manager
    try:
        # Run background indexing in a separate thread to avoid blocking
        import threading
        
        def run_background_indexing():
            result = manager.background_index_document(doc_id)
            print(f"Background indexing result for {doc_id}: {result}")
        
        thread = threading.Thread(target=run_background_indexing)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "message": f"Background indexing started for document {doc_id}",
            "status": "processing"
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to start background indexing: {str(e)}"
        }), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5601)

