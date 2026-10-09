"""
Request signatures: send a PDF to other people to sign, like DocuSign.

The sender uploads a PDF, adds signers (name and email) and places fields for
each one (signature, initials, date, name). Every signer gets an email with a
private link (/sign/<token> in the app) where they sign without an account,
or decline. With "sign in order", each signer is emailed only after the one
before has signed. When everyone has signed, all signatures are stamped into
the original PDF, and the signed PDF and its Certificate of Completion (the
audit trail, as a separate PDF, the way DocuSign does it) are emailed to
everyone.

Owner routes (signed-in accounts):
- POST   /signature-requests             create and send
- GET    /signature-requests             list
- GET    /signature-requests/<id>        details, with the event history
- GET    /signature-requests/<id>/document   the signed PDF (or the original);
         ?part=certificate for the certificate, ?part=combined for both in one PDF
- POST   /signature-requests/<id>/remind     email signers whose turn it is again
- POST   /signature-requests/<id>/cancel
- DELETE /signature-requests/<id>        (once it's no longer in progress)

Public routes (the token in the link is the signer's proof of identity):
- GET  /signing/<token>                  what to sign
- GET  /signing/<token>/document         the PDF
- POST /signing/<token>                  sign (signature/initials images, consent)
- POST /signing/<token>/decline

Only a hash of each token is stored. Sending a reminder gives the signer a
new link (the old one stops working). Links stop working once the request is
completed, declined, cancelled or expired (SIGNATURE_REQUEST_DAYS).
"""

import hashlib
import html
import io
import json
import logging
import os
import re
import secrets
import shutil
import uuid
from urllib.parse import quote
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request, send_file

import config
from db import connect_db
from email_service import EmailError, send_email
from folders import owned_folder
from pdf_to_word_service import validate_pdf_file
from plans import signature_request_limit_error
from sign_pdf_service import SignError, certificate_of_completion, load_image, open_pdf, sha256, stamp

log = logging.getLogger(__name__)

requests_bp = Blueprint("signature_requests", __name__)

FIELD_KINDS = ("signature", "initials", "date", "name")
MAX_FIELDS = 200
MAX_TITLE = 200
MAX_MESSAGE = 2000
MAX_NAME = 100
MAX_REASON = 500
EMAIL_RE = re.compile(r"^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$")
# Reminders for the same signer at most this often
REMIND_EVERY = timedelta(hours=1)

# Request status
SENT = "sent"            # waiting for signatures
COMPLETING = "completing"  # everyone signed; the final PDF is being made
COMPLETED = "completed"
DECLINED = "declined"
CANCELLED = "cancelled"
EXPIRED = "expired"      # reported, not stored: SENT past expires_at

# Signer status
WAITING = "waiting"      # sign in order: not their turn yet
INVITED = "sent"         # emailed
VIEWED = "viewed"
SIGNED = "signed"
SIGNER_DECLINED = "declined"


# --- storage ----------------------------------------------------------------------

def init_signature_requests():
    with connect_db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS signature_requests (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                owner_email TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                file_name TEXT NOT NULL,
                page_count INTEGER NOT NULL,
                sequential INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                completed_at TEXT,
                original_sha256 TEXT NOT NULL,
                signed_sha256 TEXT,
                final_sha256 TEXT
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS signature_requests_owner ON signature_requests (owner_id, created_at)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS signature_request_signers (
                id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                token_hash TEXT UNIQUE,
                status TEXT NOT NULL,
                sent_at TEXT,
                viewed_at TEXT,
                signed_at TEXT,
                declined_at TEXT,
                decline_reason TEXT,
                ip_address TEXT,
                user_agent TEXT,
                last_reminded_at TEXT
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS signature_request_fields (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                signer_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                page INTEGER NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                width REAL NOT NULL,
                height REAL NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS signature_request_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                signer_id TEXT,
                event TEXT NOT NULL,
                at TEXT NOT NULL,
                ip_address TEXT,
                detail TEXT
            )"""
        )


def _now():
    return datetime.now(timezone.utc)


def _stamp_time(when=None):
    return (when or _now()).strftime("%Y-%m-%d %H:%M:%S")


def _hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def _new_token():
    token = secrets.token_urlsafe(32)
    return token, _hash_token(token)


def _folder(request_id):
    # IDs are uuid4 hex we generated, so they're safe in paths. Absolute, because
    # send_file resolves relative paths against the app's folder, not the working one
    return os.path.abspath(os.path.join(config.SIGNATURE_REQUESTS_DIR, request_id))


def _file(request_id, name):
    return os.path.join(_folder(request_id), name)


def _read(path):
    with open(path, "rb") as f:
        return f.read()


def _write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def _event(conn, request_id, event, signer_id=None, detail=None, ip_address=None):
    conn.execute(
        "INSERT INTO signature_request_events (request_id, signer_id, event, at, ip_address, detail)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (request_id, signer_id, event, _stamp_time(), ip_address, detail),
    )


def _load(conn, request_id):
    row = conn.execute("SELECT * FROM signature_requests WHERE id = ?", (request_id,)).fetchone()
    if row is None:
        return None, []
    signers = conn.execute(
        "SELECT * FROM signature_request_signers WHERE request_id = ? ORDER BY position", (request_id,)
    ).fetchall()
    return dict(row), [dict(s) for s in signers]


def _status(req):
    """The request's status as shown: in-progress requests past their date are expired."""
    if req["status"] == SENT and datetime.fromisoformat(req["expires_at"]) < _now():
        return EXPIRED
    return req["status"]


def _error(message, status, code=None):
    body = {"error": message}
    if code:
        body["code"] = code
    return jsonify(body), status


# --- emails -------------------------------------------------------------------------

def _sign_link(token):
    return f"{config.PUBLIC_APP_URL}/sign/{token}"


def _email_html(heading, paragraphs, button=None, footer=None):
    """A simple, mobile-friendly email (inline styles: many email apps ignore <style>)."""
    body = "".join(
        f'<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#334155">{p}</p>' for p in paragraphs
    )
    if button:
        label, url = button
        body += (
            f'<p style="margin:22px 0"><a href="{html.escape(url)}" style="display:inline-block;padding:12px 22px;'
            'border-radius:10px;background:#2563eb;color:#ffffff;font-weight:600;font-size:15px;'
            f'text-decoration:none">{html.escape(label)}</a></p>'
            f'<p style="margin:0 0 14px;font-size:12px;color:#64748b">Or open this link: '
            f'<a href="{html.escape(url)}" style="color:#2563eb;word-break:break-all">{html.escape(url)}</a></p>'
        )
    if footer:
        body += f'<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#94a3b8">{footer}</p>'
    return (
        '<div style="background:#f8fafc;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'
        '\'Segoe UI\',Roboto,sans-serif">'
        '<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;'
        'border-radius:14px;padding:28px">'
        '<p style="margin:0 0 18px;font-weight:700;font-size:16px;color:#0f172a">Dokkiman</p>'
        f'<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a">{heading}</h1>'
        f"{body}</div></div>"
    )


def _send(conn, req, signer_id, to, subject, html_body, text, attachments=None):
    """Send an email; a failure is recorded on the request rather than raised."""
    try:
        send_email(to, subject, html_body, text, attachments=attachments, reply_to=req["owner_email"])
        return True
    except EmailError as e:
        log.error("Signature request %s: email to %s failed: %s", req["id"], to, e)
        _event(conn, req["id"], "email_failed", signer_id, detail=to)
        return False


def _report_link(req):
    """A mailto: for reporting a misused signing email (None without SUPPORT_EMAIL)."""
    if not config.SUPPORT_EMAIL:
        return None
    subject = quote(f"Report abuse: signature request {req['id']}")
    body = quote(f"I received a signing request from {req['owner_email']} that I think is spam or a scam.\n"
                 f"Request ID: {req['id']}\n")
    return f"mailto:{config.SUPPORT_EMAIL}?subject={subject}&body={body}"


def _invite(conn, req, signer, reminder=False):
    """Give the signer a (new) link and email it."""
    token, token_hash = _new_token()
    now = _stamp_time()
    status = signer["status"] if signer["status"] == VIEWED else INVITED
    conn.execute(
        "UPDATE signature_request_signers SET token_hash = ?, status = ?, sent_at = COALESCE(sent_at, ?)"
        + (", last_reminded_at = ?" if reminder else "") + " WHERE id = ?",
        (token_hash, status, now, *( [now] if reminder else [] ), signer["id"]),
    )
    _event(conn, req["id"], "reminded" if reminder else "sent", signer["id"], detail=signer["email"])

    sender, title = req["owner_email"], req["title"]
    expires = datetime.fromisoformat(req["expires_at"]).strftime("%B %d, %Y")
    subject = (f'Reminder: please sign "{title}"' if reminder else f'{sender} sent you "{title}" to sign')
    paragraphs = [
        f"Hi {html.escape(signer['name'])},",
        f"<strong>{html.escape(sender)}</strong> asked you to sign <strong>{html.escape(title)}</strong>.",
    ]
    if req["message"]:
        paragraphs.append(f"Their message: <em>{html.escape(req['message'])}</em>")
    paragraphs.append("Review the document and sign it online. It takes about a minute, and you don't need an account.")
    link = _sign_link(token)
    # Anyone with an account can send these, so say who sent it and how to report misuse
    report = _report_link(req)
    notice = (f"This request was sent by {html.escape(sender)} using Dokkiman. Dokkiman didn't write this "
              "message and doesn't vouch for the sender. Not expecting it? Don't sign it, and "
              + (f'<a href="{html.escape(report)}" style="color:#64748b">report it to us</a>.' if report else "ignore it."))
    html_body = _email_html(
        "You have a document to sign" if not reminder else "Reminder: a document is waiting for your signature",
        paragraphs, button=("Review and sign", link),
        footer=f"This link is just for you; please don't forward it. It works until {expires}.<br><br>{notice}",
    )
    text = (
        f"Hi {signer['name']},\n\n{sender} asked you to sign \"{title}\".\n"
        + (f"\nTheir message: {req['message']}\n" if req["message"] else "")
        + f"\nReview and sign: {link}\n\nThis link is just for you and works until {expires}.\n"
        + f"\nThis request was sent by {sender} using Dokkiman. Dokkiman didn't write this message and doesn't "
          "vouch for the sender. Not expecting it? Don't sign it"
        + (f", and report it to {config.SUPPORT_EMAIL} (request {req['id']}).\n" if config.SUPPORT_EMAIL else ".\n")
    )
    _send(conn, req, signer["id"], signer["email"], subject, html_body, text)
    return token


def _download_names(req):
    """(signed PDF, certificate, combined) file names for a request."""
    stem = re.sub(r"[^\w.\- ]", "_", os.path.splitext(req["file_name"])[0])[:80] or "document"
    return f"{stem}_signed.pdf", f"{stem}_certificate.pdf", f"{stem}_signed_with_certificate.pdf"


def _email_completed(conn, req, signers, signed_pdf, certificate_pdf):
    title = req["title"]
    names = ", ".join(s["name"] for s in signers)
    signed_name, certificate_name, _ = _download_names(req)
    for name, email in [(None, req["owner_email"])] + [(s["name"], s["email"]) for s in signers]:
        greeting = f"Hi {html.escape(name)}," if name else "Hi,"
        html_body = _email_html(
            "Everyone has signed",
            [greeting,
             f"<strong>{html.escape(title)}</strong> has been signed by everyone ({html.escape(names)}).",
             "Two PDFs are attached: the signed document, and its <strong>Certificate of Completion</strong> "
             "(who signed, when, and a fingerprint that shows if the document is changed later)."],
            footer="Keep this email: it's your copy of the signed document and its certificate.",
        )
        text = (f"{'Hi ' + name if name else 'Hi'},\n\n\"{title}\" has been signed by everyone ({names}).\n"
                "Attached: the signed PDF and its Certificate of Completion (the audit trail).\n")
        _send(conn, req, None, email, f'Signed: "{title}"', html_body, text,
              attachments=[(signed_name, signed_pdf), (certificate_name, certificate_pdf)])


# --- finishing ------------------------------------------------------------------------

def _signed_date(signer):
    return datetime.strptime(signer["signed_at"], "%Y-%m-%d %H:%M:%S").strftime("%b %d, %Y")


def finalize(request_id):
    """Everyone has signed: stamp all fields into the original, add the audit
    pages, store and email the final PDF. Safe to call more than once."""
    with connect_db() as conn:
        # Only one caller gets to finish (two last signers can sign at once)
        claimed = conn.execute(
            "UPDATE signature_requests SET status = ? WHERE id = ? AND status = ?"
            " AND NOT EXISTS (SELECT 1 FROM signature_request_signers WHERE request_id = ? AND status != ?)",
            (COMPLETING, request_id, SENT, request_id, SIGNED),
        ).rowcount
    if not claimed:
        return False

    try:
        with connect_db() as conn:
            req, signers = _load(conn, request_id)
            fields = conn.execute(
                "SELECT * FROM signature_request_fields WHERE request_id = ? ORDER BY id", (request_id,)
            ).fetchall()

        pngs, image_index, placements = [], {}, []
        by_id = {s["id"]: s for s in signers}
        for field in fields:
            signer = by_id[field["signer_id"]]
            item = {"page": field["page"], "x": field["x"], "y": field["y"],
                    "width": field["width"], "height": field["height"]}
            if field["kind"] in ("signature", "initials"):
                key = (signer["id"], field["kind"])
                if key not in image_index:
                    image_index[key] = len(pngs)
                    pngs.append(_read(_file(request_id, f"{signer['id']}-{field['kind']}.png")))
                placements.append({**item, "type": "image", "image": image_index[key]})
            else:
                text = _signed_date(signer) if field["kind"] == "date" else signer["name"]
                placements.append({**item, "type": "text", "text": text})

        original = _read(_file(request_id, "original.pdf"))
        doc = open_pdf(original)
        try:
            stamp(doc, placements, pngs)
            signed_body = doc.tobytes(garbage=3, deflate=True)
        finally:
            doc.close()

        completed_at = _stamp_time()
        # The signed PDF stays clean; the audit trail is its own PDF
        certificate = certificate_of_completion({
            "title": req["title"], "sender": req["owner_email"], "request_id": req["id"],
            "sent_at": datetime.fromisoformat(req["created_at"]).strftime("%Y-%m-%d %H:%M:%S"),
            "completed_at": completed_at,
            "original_sha256": req["original_sha256"], "signed_sha256": sha256(signed_body),
            "signed_file_name": _download_names(req)[0],
            "signers": signers,
        })
        _write(_file(request_id, "signed.pdf"), signed_body)
        _write(_file(request_id, "certificate.pdf"), certificate)

        with connect_db() as conn:
            conn.execute(
                "UPDATE signature_requests SET status = ?, completed_at = ?, signed_sha256 = ?, final_sha256 = ?"
                " WHERE id = ?",
                (COMPLETED, completed_at, sha256(signed_body), sha256(signed_body), request_id),
            )
            # Links stop working
            conn.execute("UPDATE signature_request_signers SET token_hash = NULL WHERE request_id = ?", (request_id,))
            _event(conn, request_id, "completed")
            _email_completed(conn, req, signers, signed_body, certificate)
        return True
    except Exception:
        log.exception("Couldn't finish signature request %s", request_id)
        with connect_db() as conn:
            conn.execute("UPDATE signature_requests SET status = ? WHERE id = ? AND status = ?",
                         (SENT, request_id, COMPLETING))
        return False


# --- owner routes ---------------------------------------------------------------------

def _owner_request(request_id):
    """The signed-in owner's request (and signers), or an error response."""
    if g.user.get("guest"):
        return None, None, _error("Create a free account to request signatures.", 401)
    with connect_db() as conn:
        req, signers = _load(conn, request_id)
    if req is None or req["owner_id"] != g.user["id"]:
        return None, None, _error("Signature request not found.", 404)
    return req, signers, None


def _signer_json(signer):
    return {key: signer[key] for key in ("id", "name", "email", "position", "status", "sent_at", "viewed_at",
                                         "signed_at", "declined_at", "decline_reason")}


def _request_json(req, signers, events=None):
    data = {
        "id": req["id"], "title": req["title"], "message": req["message"], "file_name": req["file_name"],
        "page_count": req["page_count"], "sequential": bool(req["sequential"]), "status": _status(req),
        "created_at": req["created_at"], "expires_at": req["expires_at"], "completed_at": req["completed_at"],
        "final_sha256": req["final_sha256"],
        "folder_id": req.get("folder_id"),
        "signers": [_signer_json(s) for s in signers],
    }
    if events is not None:
        names = {s["id"]: s["name"] for s in signers}
        data["events"] = [{"event": e["event"], "at": e["at"], "signer": names.get(e["signer_id"]),
                           "detail": e["detail"] if e["event"] in ("declined", "email_failed") else None}
                          for e in events]
    return data


def _clean_fields(raw_fields, signer_count, page_count):
    if not isinstance(raw_fields, list) or not raw_fields:
        raise SignError("Place at least one field for your signers.")
    if len(raw_fields) > MAX_FIELDS:
        raise SignError(f"Use at most {MAX_FIELDS} fields per document.")
    fields = []
    for item in raw_fields:
        try:
            signer = int(item["signer"])
            kind = item["kind"]
            page = int(item["page"])
            x, y, width, height = (float(item[key]) for key in ("x", "y", "width", "height"))
        except (KeyError, TypeError, ValueError):
            raise SignError("One of the fields isn't valid.")
        if kind not in FIELD_KINDS or not 0 <= signer < signer_count:
            raise SignError("One of the fields isn't valid.")
        if not 0 <= page < page_count:
            raise SignError("A field is placed on a page that doesn't exist.")
        if width <= 0 or height <= 0 or x < 0 or y < 0 or x + width > 1.0001 or y + height > 1.0001:
            raise SignError("A field is placed outside the page.")
        fields.append({"signer": signer, "kind": kind, "page": page, "x": x, "y": y, "width": width, "height": height})
    return fields


def _clean_signers(raw_signers):
    if not isinstance(raw_signers, list) or not raw_signers:
        raise SignError("Add at least one signer.")
    if len(raw_signers) > config.SIGNATURE_REQUEST_MAX_SIGNERS:
        raise SignError(f"Add at most {config.SIGNATURE_REQUEST_MAX_SIGNERS} signers.")
    signers, seen = [], set()
    for item in raw_signers:
        name = str((item or {}).get("name", "")).strip()
        email = str((item or {}).get("email", "")).strip().lower()
        if not name or len(name) > MAX_NAME:
            raise SignError("Every signer needs a name (up to 100 characters).")
        if not EMAIL_RE.match(email) or len(email) > 254:
            raise SignError(f"{email or 'A signer'}'s email address doesn't look right.")
        if email in seen:
            raise SignError(f"{email} is added twice.")
        seen.add(email)
        signers.append({"name": name, "email": email})
    return signers


@requests_bp.route("/signature-requests", methods=["POST"])
def create_request():
    if g.user.get("guest"):
        return _error("Create a free account to request signatures.", 401)
    limit_error = signature_request_limit_error(g.user["id"])
    if limit_error:
        return limit_error
    # On every plan: a cap per day, so signing emails can't be sent in bulk
    since = (_now() - timedelta(days=1)).isoformat()
    with connect_db() as conn:
        sent_today = conn.execute("SELECT COUNT(*) FROM signature_requests WHERE owner_id = ? AND created_at >= ?",
                                  (g.user["id"], since)).fetchone()[0]
    if sent_today >= config.SIGNATURE_REQUESTS_PER_DAY:
        return _error(f"You've sent {config.SIGNATURE_REQUESTS_PER_DAY} signature requests in the last 24 hours, "
                      "the most allowed. Please try again later.", 429, "daily_limit")

    uploaded = request.files.get("file")
    is_valid, message = validate_pdf_file(uploaded)
    if not is_valid:
        return _error(message, 400)
    try:
        data = json.loads(request.form.get("data", "{}"))
    except json.JSONDecodeError:
        return _error("The request couldn't be read. Please try again.", 400)
    if not isinstance(data, dict):
        return _error("The request couldn't be read. Please try again.", 400)

    pdf_bytes = uploaded.read()
    file_name = os.path.basename(uploaded.filename)[:200]
    try:
        doc = open_pdf(pdf_bytes)
        page_count = doc.page_count
        doc.close()
        signers = _clean_signers(data.get("signers"))
        fields = _clean_fields(data.get("fields"), len(signers), page_count)
        for index, signer in enumerate(signers):
            if not any(f["signer"] == index and f["kind"] == "signature" for f in fields):
                raise SignError(f"Place a signature field for {signer['name']}.")
    except SignError as e:
        return _error(str(e), 400)

    title = str(data.get("title") or os.path.splitext(file_name)[0]).strip()[:MAX_TITLE] or "Document"
    message_text = str(data.get("message") or "").strip()[:MAX_MESSAGE]
    sequential = bool(data.get("sequential")) and len(signers) > 1
    folder_id = data.get("folder_id") or None
    if folder_id:
        with connect_db() as conn:
            if owned_folder(conn, g.user["id"], folder_id) is None:
                return _error("That folder doesn't exist.", 400)

    request_id = uuid.uuid4().hex
    created = _now()
    _write(_file(request_id, "original.pdf"), pdf_bytes)
    with connect_db() as conn:
        conn.execute(
            "INSERT INTO signature_requests (id, owner_id, owner_email, title, message, file_name, page_count,"
            " sequential, status, created_at, expires_at, original_sha256, folder_id)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (request_id, g.user["id"], g.user["email"], title, message_text, file_name, page_count,
             int(sequential), SENT, created.isoformat(),
             (created + timedelta(days=config.SIGNATURE_REQUEST_DAYS)).isoformat(), sha256(pdf_bytes), folder_id),
        )
        signer_ids = []
        for position, signer in enumerate(signers):
            signer_id = uuid.uuid4().hex
            signer_ids.append(signer_id)
            conn.execute(
                "INSERT INTO signature_request_signers (id, request_id, position, name, email, status)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (signer_id, request_id, position, signer["name"], signer["email"], WAITING),
            )
        conn.executemany(
            "INSERT INTO signature_request_fields (request_id, signer_id, kind, page, x, y, width, height)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [(request_id, signer_ids[f["signer"]], f["kind"], f["page"], f["x"], f["y"], f["width"], f["height"])
             for f in fields],
        )
        _event(conn, request_id, "created", ip_address=request.remote_addr)
        req, stored_signers = _load(conn, request_id)
        # Everyone at once, or just the first signer when signing in order
        for signer in stored_signers[:1] if sequential else stored_signers:
            _invite(conn, req, signer)
        req, stored_signers = _load(conn, request_id)
    return jsonify({"request": _request_json(req, stored_signers)}), 201


@requests_bp.route("/signature-requests", methods=["GET"])
def list_requests():
    if g.user.get("guest"):
        return _error("Create a free account to request signatures.", 401)
    with connect_db() as conn:
        rows = conn.execute(
            "SELECT * FROM signature_requests WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200", (g.user["id"],)
        ).fetchall()
        signers = conn.execute(
            "SELECT s.* FROM signature_request_signers s JOIN signature_requests r ON r.id = s.request_id"
            " WHERE r.owner_id = ? ORDER BY s.position", (g.user["id"],)
        ).fetchall()
    by_request = {}
    for signer in signers:
        by_request.setdefault(signer["request_id"], []).append(dict(signer))
    return jsonify({"requests": [_request_json(dict(r), by_request.get(r["id"], [])) for r in rows]})


@requests_bp.route("/signature-requests/<request_id>", methods=["GET"])
def get_request(request_id):
    req, signers, error = _owner_request(request_id)
    if error:
        return error
    # Everyone signed but finishing failed earlier: try again
    if req["status"] == SENT and signers and all(s["status"] == SIGNED for s in signers):
        finalize(request_id)
    with connect_db() as conn:
        req, signers = _load(conn, request_id)
        events = conn.execute(
            "SELECT * FROM signature_request_events WHERE request_id = ? ORDER BY id", (request_id,)
        ).fetchall()
    return jsonify({"request": _request_json(req, signers, events)})


@requests_bp.route("/signature-requests/<request_id>/document", methods=["GET"])
def request_document(request_id):
    """?part=signed (default), certificate or combined; before completion, the original."""
    req, _signers, error = _owner_request(request_id)
    if error:
        return error
    part = request.args.get("part", "signed")
    if part not in ("signed", "certificate", "combined"):
        return _error("Choose signed, certificate or combined.", 400)
    if req["status"] != COMPLETED:
        if part != "signed":
            return _error("The certificate is ready once everyone has signed.", 409)
        path = _file(request_id, "original.pdf")
        if not os.path.exists(path):
            return _error("The document is no longer available.", 404)
        return send_file(path, mimetype="application/pdf", as_attachment=True, download_name=req["file_name"])

    signed_name, certificate_name, combined_name = _download_names(req)
    signed_path, certificate_path = _file(request_id, "signed.pdf"), _file(request_id, "certificate.pdf")
    if not (os.path.exists(signed_path) and os.path.exists(certificate_path)):
        return _error("The document is no longer available.", 404)
    if part == "signed":
        return send_file(signed_path, mimetype="application/pdf", as_attachment=True, download_name=signed_name)
    if part == "certificate":
        return send_file(certificate_path, mimetype="application/pdf", as_attachment=True,
                         download_name=certificate_name)
    combined = open_pdf(_read(signed_path))
    try:
        with open_pdf(_read(certificate_path)) as certificate:
            combined.insert_pdf(certificate)
        data = combined.tobytes(garbage=3, deflate=True)
    finally:
        combined.close()
    return send_file(io.BytesIO(data), mimetype="application/pdf", as_attachment=True, download_name=combined_name)


@requests_bp.route("/signature-requests/<request_id>/remind", methods=["POST"])
def remind(request_id):
    req, signers, error = _owner_request(request_id)
    if error:
        return error
    if _status(req) != SENT:
        return _error("Only requests waiting for signatures can be reminded.", 409)
    due = [s for s in signers if s["status"] in (INVITED, VIEWED)]
    recent = _now() - REMIND_EVERY
    due = [s for s in due if not s["last_reminded_at"]
           or datetime.strptime(s["last_reminded_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc) < recent]
    if not due:
        return _error("Everyone waiting was reminded in the last hour. Try again later.", 429)
    with connect_db() as conn:
        for signer in due:
            _invite(conn, req, signer, reminder=True)
    return jsonify({"reminded": [s["email"] for s in due]})


@requests_bp.route("/signature-requests/<request_id>/cancel", methods=["POST"])
def cancel(request_id):
    req, signers, error = _owner_request(request_id)
    if error:
        return error
    if req["status"] != SENT:
        return _error("This request is no longer in progress.", 409)
    with connect_db() as conn:
        if not conn.execute("UPDATE signature_requests SET status = ? WHERE id = ? AND status = ?",
                            (CANCELLED, request_id, SENT)).rowcount:
            return _error("This request is no longer in progress.", 409)
        conn.execute("UPDATE signature_request_signers SET token_hash = NULL WHERE request_id = ?", (request_id,))
        _event(conn, request_id, "cancelled")
        if _status(req) != EXPIRED:
            for signer in signers:
                if signer["status"] in (INVITED, VIEWED):
                    _send(conn, req, signer["id"], signer["email"], f'Cancelled: "{req["title"]}"',
                          _email_html("Signature request cancelled",
                                      [f"Hi {html.escape(signer['name'])},",
                                       f"{html.escape(req['owner_email'])} cancelled the request to sign "
                                       f"<strong>{html.escape(req['title'])}</strong>. You don't need to do anything."]),
                          f"Hi {signer['name']},\n\n{req['owner_email']} cancelled the request to sign "
                          f"\"{req['title']}\". You don't need to do anything.\n")
    return jsonify({"status": CANCELLED})


@requests_bp.route("/signature-requests/<request_id>", methods=["DELETE"])
def delete_request(request_id):
    req, _signers, error = _owner_request(request_id)
    if error:
        return error
    if req["status"] in (SENT, COMPLETING) and _status(req) != EXPIRED:
        return _error("Cancel the request before deleting it.", 409)
    with connect_db() as conn:
        for table in ("signature_request_fields", "signature_request_events", "signature_request_signers"):
            conn.execute(f"DELETE FROM {table} WHERE request_id = ?", (request_id,))
        conn.execute("DELETE FROM signature_requests WHERE id = ?", (request_id,))
    shutil.rmtree(_folder(request_id), ignore_errors=True)
    return jsonify({"deleted": True})


# --- public signing routes -------------------------------------------------------------

def _by_token(token):
    """(request, signer, signers) for a signing link, or None for an unknown/used link."""
    if not token or len(token) > 100:
        return None
    with connect_db() as conn:
        row = conn.execute("SELECT request_id, id FROM signature_request_signers WHERE token_hash = ?",
                           (_hash_token(token),)).fetchone()
        if row is None:
            return None
        req, signers = _load(conn, row["request_id"])
    signer = next(s for s in signers if s["id"] == row["id"])
    return req, signer, signers


LINK_GONE = "This signing link isn't valid anymore. It may have been replaced by a newer email, or the request was cancelled."


def _not_signable(req, signer):
    """Why the signer can't sign now (None if they can)."""
    status = _status(req)
    if status == EXPIRED:
        return "expired"
    if status != SENT:
        return status
    if signer["status"] == SIGNED:
        return "signed"
    if signer["status"] == WAITING:
        return "not_your_turn"
    return None


@requests_bp.route("/signing/<token>", methods=["GET"])
def signing_info(token):
    found = _by_token(token)
    if found is None:
        return _error(LINK_GONE, 404, "invalid_link")
    req, signer, signers = found
    reason = _not_signable(req, signer)
    if reason is None and signer["status"] == INVITED:
        with connect_db() as conn:
            conn.execute("UPDATE signature_request_signers SET status = ?, viewed_at = ? WHERE id = ?",
                         (VIEWED, _stamp_time(), signer["id"]))
            _event(conn, req["id"], "viewed", signer["id"], ip_address=request.remote_addr)
    with connect_db() as conn:
        fields = conn.execute(
            "SELECT id, kind, page, x, y, width, height FROM signature_request_fields"
            " WHERE request_id = ? AND signer_id = ? ORDER BY page, y, x", (req["id"], signer["id"])
        ).fetchall()
    return jsonify({
        "title": req["title"], "message": req["message"], "sender": req["owner_email"],
        "file_name": req["file_name"], "page_count": req["page_count"],
        "signer": {"name": signer["name"], "email": signer["email"]},
        "signer_count": len(signers),
        "fields": [dict(f) for f in fields],
        "can_sign": reason is None,
        "reason": reason,
        "expires_at": req["expires_at"],
    })


@requests_bp.route("/signing/<token>/document", methods=["GET"])
def signing_document(token):
    found = _by_token(token)
    if found is None:
        return _error(LINK_GONE, 404, "invalid_link")
    req, _signer, _signers = found
    if _status(req) != SENT:
        return _error("This document is no longer available here.", 410)
    return send_file(_file(req["id"], "original.pdf"), mimetype="application/pdf")


@requests_bp.route("/signing/<token>", methods=["POST"])
def sign(token):
    found = _by_token(token)
    if found is None:
        return _error(LINK_GONE, 404, "invalid_link")
    req, signer, signers = found
    reason = _not_signable(req, signer)
    if reason:
        return _error({
            "expired": "This request has expired. Ask the sender to send it again.",
            "signed": "You've already signed this document.",
            "not_your_turn": "It isn't your turn to sign yet. You'll get an email when it is.",
        }.get(reason, "This request is no longer open for signing."), 409, reason)
    if request.form.get("consent") != "true":
        return _error("Please agree to sign electronically.", 400)

    with connect_db() as conn:
        kinds = {row["kind"] for row in conn.execute(
            "SELECT DISTINCT kind FROM signature_request_fields WHERE signer_id = ?", (signer["id"],))}
    images = {}
    try:
        for kind in ("signature", "initials"):
            if kind in kinds:
                upload = request.files.get(kind)
                if upload is None:
                    raise SignError(f"Add your {kind} first.")
                images[kind] = load_image(upload.read())
    except SignError as e:
        return _error(str(e), 400)
    for kind, png in images.items():
        _write(_file(req["id"], f"{signer['id']}-{kind}.png"), png)

    user_agent = (request.headers.get("User-Agent") or "")[:300]
    with connect_db() as conn:
        # Only the first of two simultaneous submissions counts
        if not conn.execute(
            "UPDATE signature_request_signers SET status = ?, signed_at = ?, ip_address = ?, user_agent = ?,"
            " viewed_at = COALESCE(viewed_at, ?) WHERE id = ? AND status IN (?, ?)",
            (SIGNED, _stamp_time(), request.remote_addr, user_agent, _stamp_time(), signer["id"], INVITED, VIEWED),
        ).rowcount:
            return _error("You've already signed this document.", 409, "signed")
        _event(conn, req["id"], "signed", signer["id"], ip_address=request.remote_addr)
        if req["sequential"]:
            following = next((s for s in signers if s["position"] > signer["position"] and s["status"] == WAITING), None)
            if following:
                _invite(conn, req, following)

    completed = finalize(req["id"])
    return jsonify({"signed": True, "completed": completed})


@requests_bp.route("/signing/<token>/decline", methods=["POST"])
def decline(token):
    found = _by_token(token)
    if found is None:
        return _error(LINK_GONE, 404, "invalid_link")
    req, signer, _signers = found
    reason = _not_signable(req, signer)
    if reason:
        return _error("This request is no longer open for signing.", 409, reason)
    text = str((request.get_json(silent=True) or {}).get("reason", "")).strip()[:MAX_REASON]
    with connect_db() as conn:
        if not conn.execute("UPDATE signature_requests SET status = ? WHERE id = ? AND status = ?",
                            (DECLINED, req["id"], SENT)).rowcount:
            return _error("This request is no longer open for signing.", 409)
        conn.execute(
            "UPDATE signature_request_signers SET status = ?, declined_at = ?, decline_reason = ?, ip_address = ?"
            " WHERE id = ?", (SIGNER_DECLINED, _stamp_time(), text, request.remote_addr, signer["id"]),
        )
        conn.execute("UPDATE signature_request_signers SET token_hash = NULL WHERE request_id = ?", (req["id"],))
        _event(conn, req["id"], "declined", signer["id"], detail=text, ip_address=request.remote_addr)
        why = f"Their reason: <em>{html.escape(text)}</em>" if text else "They didn't give a reason."
        _send(conn, req, signer["id"], req["owner_email"], f'{signer["name"]} declined to sign "{req["title"]}"',
              _email_html("A signer declined",
                          [f"<strong>{html.escape(signer['name'])}</strong> ({html.escape(signer['email'])}) declined "
                           f"to sign <strong>{html.escape(req['title'])}</strong>.", why,
                           "The request has stopped. You can send a new one from E-Sign in Dokkiman."]),
              f"{signer['name']} ({signer['email']}) declined to sign \"{req['title']}\".\n"
              + (f"Their reason: {text}\n" if text else "They didn't give a reason.\n"))
    return jsonify({"declined": True})
