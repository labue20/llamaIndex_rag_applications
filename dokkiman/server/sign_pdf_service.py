"""
Sign PDFs: stamp signatures, initials and dates onto pages, and optionally
append an audit trail page.

Placements come from the browser as fractions of the page as displayed
(0..1 from the top-left), so they work at any zoom level. Everything is drawn
into the page content, so it can't be moved or removed afterwards like an
annotation could.
"""

import hashlib
import io
import json
import textwrap
import uuid
from datetime import datetime, timezone

import fitz  # PyMuPDF
from PIL import Image

MAX_PLACEMENTS = 50
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_TEXT_LENGTH = 100
PLACEMENT_TYPES = ("image", "text")


class SignError(ValueError):
    """The request can't be carried out; the message is safe to show users."""


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def parse_placements(raw, page_count, image_count):
    """Validate the placements JSON sent by the browser."""
    try:
        placements = json.loads(raw or "[]")
    except json.JSONDecodeError:
        raise SignError("The signature positions couldn't be read. Please try again.")
    if not isinstance(placements, list) or not placements:
        raise SignError("Add at least one signature, initials or date before signing.")
    if len(placements) > MAX_PLACEMENTS:
        raise SignError(f"Use at most {MAX_PLACEMENTS} signatures and dates per document.")

    cleaned = []
    for item in placements:
        if not isinstance(item, dict) or item.get("type") not in PLACEMENT_TYPES:
            raise SignError("One of the items to place isn't valid.")
        try:
            page = int(item["page"])
            x, y, width, height = (float(item[key]) for key in ("x", "y", "width", "height"))
        except (KeyError, TypeError, ValueError):
            raise SignError("One of the items to place isn't valid.")
        if not 0 <= page < page_count:
            raise SignError("An item is placed on a page that doesn't exist.")
        if width <= 0 or height <= 0 or x < 0 or y < 0 or x + width > 1.0001 or y + height > 1.0001:
            raise SignError("An item is placed outside the page.")

        entry = {"type": item["type"], "page": page, "x": x, "y": y, "width": width, "height": height,
                 "label": str(item.get("label", ""))[:40]}
        if item["type"] == "image":
            index = item.get("image")
            if not isinstance(index, int) or not 0 <= index < image_count:
                raise SignError("A signature image is missing. Please add it again.")
            entry["image"] = index
        else:
            text = str(item.get("text", "")).strip()
            if not text or len(text) > MAX_TEXT_LENGTH:
                raise SignError(f"Text items must be 1 to {MAX_TEXT_LENGTH} characters.")
            entry["text"] = text
        cleaned.append(entry)
    return cleaned


def load_image(data):
    """Check an uploaded signature image and return it as PNG bytes."""
    if len(data) > MAX_IMAGE_BYTES:
        raise SignError("A signature image is too large (2 MB at most).")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception:
        raise SignError("A signature image couldn't be read. Use a PNG or JPEG.")
    if image.mode not in ("RGBA", "LA"):
        image = image.convert("RGBA")
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _target_rect(page, item):
    """Placement fractions (of the page as shown) -> a rectangle in the page's
    own, unrotated coordinates, which is what PyMuPDF draws in."""
    shown = page.rect  # the page as displayed, rotation applied
    rect = fitz.Rect(
        shown.x0 + item["x"] * shown.width,
        shown.y0 + item["y"] * shown.height,
        shown.x0 + (item["x"] + item["width"]) * shown.width,
        shown.y0 + (item["y"] + item["height"]) * shown.height,
    )
    return rect * page.derotation_matrix


def _insert_text(page, rect, text):
    """Write text filling the box's height (shrinking to fit its width)."""
    rotation = page.rotation
    # Height of the box as shown (width and height swap on 90/270 pages)
    shown_height = rect.width if rotation in (90, 270) else rect.height
    fontsize = max(4.0, shown_height * 0.7)
    while fontsize > 4:
        if page.insert_textbox(rect, text, fontsize=fontsize, fontname="helv", rotate=rotation,
                               align=fitz.TEXT_ALIGN_LEFT) >= 0:
            return
        fontsize *= 0.85
    page.insert_textbox(rect, text, fontsize=4, fontname="helv", rotate=rotation)


def stamp(doc, placements, pngs):
    """Draw validated placements into the open document's pages."""
    for item in placements:
        page = doc[item["page"]]
        rect = _target_rect(page, item)
        if item["type"] == "image":
            page.insert_image(rect, stream=pngs[item["image"]], keep_proportion=True,
                              rotate=page.rotation, overlay=True)
        else:
            _insert_text(page, rect, item["text"])


def open_pdf(pdf_bytes):
    """Open a PDF for signing, with errors people can act on."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        raise SignError("This file couldn't be read as a PDF. It may be damaged.")
    if doc.needs_pass:
        doc.close()
        raise SignError("Password-protected PDFs can't be signed. Remove the password and try again.")
    return doc


class _PageWriter:
    """Writes wrapped lines down A4 pages, starting a new page when one is full."""

    MARGIN = 56

    def __init__(self, doc):
        self.doc = doc
        self._new_page()

    def _new_page(self):
        self.page = self.doc.new_page(width=595, height=842)  # A4
        self.y = self.MARGIN

    def line(self, text, size=10, bold=False, gap=6, color=(0.1, 0.1, 0.1)):
        for chunk in textwrap.wrap(text, width=int(470 / (size * 0.5))) or [""]:
            if self.y + size > 842 - self.MARGIN:
                self._new_page()
            self.page.insert_text((self.MARGIN, self.y + size), chunk, fontsize=size,
                                  fontname="hebo" if bold else "helv", color=color)
            self.y += size + 3
        self.y += gap


def certificate_of_completion(info):
    """The audit trail of a signature request with several signers, as its own
    PDF (like DocuSign's Certificate of Completion). Returns PDF bytes.

    info: title, sender, request_id, sent_at, completed_at, original_sha256,
    signed_sha256, signed_file_name, and signers: [{name, email, viewed_at,
    signed_at, ip_address}]
    """
    doc = fitz.open()
    try:
        _certificate_pages(doc, info)
        doc.set_metadata({"title": f"Certificate of Completion: {info['title']}",
                          "producer": "Dokkiman - E-Sign"})
        return doc.tobytes(garbage=3, deflate=True)
    finally:
        doc.close()


def _certificate_pages(doc, info):
    out = _PageWriter(doc)
    out.line("Certificate of Completion", size=18, bold=True, gap=4)
    out.line("This certificate records how the document named below was signed.", color=(0.4, 0.4, 0.4), gap=16)
    for label, value in (
        ("Document", info["title"]),
        ("Sent for signature by", info["sender"]),
        ("Sent at (UTC)", info["sent_at"]),
        ("Completed at (UTC)", info["completed_at"]),
        ("Request ID", info["request_id"]),
    ):
        out.line(label, size=9, bold=True, gap=0, color=(0.35, 0.35, 0.35))
        out.line(value, size=10, gap=10)

    out.line("Signers", size=13, bold=True, gap=6)
    for number, signer in enumerate(info["signers"], start=1):
        out.line(f"{number}. {signer['name']} <{signer['email']}>", size=10, bold=True, gap=2)
        out.line(f"Opened the document: {signer.get('viewed_at') or 'not recorded'}", size=9, gap=0)
        out.line(f"Signed: {signer['signed_at']}", size=9, gap=0)
        out.line(f"Network address: {signer.get('ip_address') or 'unknown'}", size=9, gap=10)

    for label, value in (
        ("Original document SHA-256", info["original_sha256"]),
        (f"Signed document SHA-256 ({info['signed_file_name']})", info["signed_sha256"]),
    ):
        out.line(label, size=9, bold=True, gap=0, color=(0.35, 0.35, 0.35))
        out.line(value, size=10, gap=10)
    out.line("Each signer received a private link by email and agreed to sign electronically. "
             "The SHA-256 fingerprints identify the exact file contents: recomputing the signed "
             "document's fingerprint shows whether it was changed after signing. A copy of this record "
             "is kept by the service.",
             size=8, color=(0.45, 0.45, 0.45), gap=0)


def _audit_page(doc, record):
    """Append a page summarising who signed what, when, with document fingerprints."""
    page = doc.new_page(width=595, height=842)  # A4
    margin = 56
    y = margin

    def line(text, size=10, bold=False, gap=6, color=(0.1, 0.1, 0.1)):
        nonlocal y
        for chunk in textwrap.wrap(text, width=int(470 / (size * 0.5))) or [""]:
            page.insert_text((margin, y + size), chunk, fontsize=size,
                             fontname="hebo" if bold else "helv", color=color)
            y += size + 3
        y += gap

    line("Signature audit trail", size=18, bold=True, gap=4)
    line("This page records how this document was signed.", color=(0.4, 0.4, 0.4), gap=16)

    rows = [
        ("Document", record["file_name"]),
        ("Signed by", record["signer"]),
        ("Signed at (UTC)", record["signed_at"]),
        ("Signer's network address", record["ip_address"] or "unknown"),
        ("Items placed", record["summary"]),
        ("Audit record ID", record["id"]),
        ("Original document SHA-256", record["original_sha256"]),
        ("Signed document SHA-256 (before this page was added)", record["signed_sha256"]),
    ]
    for label, value in rows:
        line(label, size=9, bold=True, gap=0, color=(0.35, 0.35, 0.35))
        line(value, size=10, gap=10)

    line("The SHA-256 fingerprints identify the exact file contents. Recomputing them later "
         "shows whether the document was changed. A copy of this record is kept by the service.",
         size=8, color=(0.45, 0.45, 0.45), gap=0)


def _summary(placements):
    counts = {}
    for item in placements:
        name = item["label"] or ("signature" if item["type"] == "image" else "text")
        counts[(name, item["page"] + 1)] = counts.get((name, item["page"] + 1), 0) + 1
    parts = [f"{name} on page {page}" + (f" (x{n})" if n > 1 else "") for (name, page), n in sorted(counts.items(), key=lambda kv: (kv[0][1], kv[0][0]))]
    return "; ".join(parts)


def sign_pdf(pdf_bytes, placements_json, images, file_name, signer, ip_address, add_audit_trail=True):
    """Stamp placements onto the PDF. Returns (signed_pdf_bytes, audit_record)."""
    doc = open_pdf(pdf_bytes)

    try:
        placements = parse_placements(placements_json, doc.page_count, len(images))
        pngs = [load_image(data) for data in images]

        stamp(doc, placements, pngs)
        signed_body = doc.tobytes(garbage=3, deflate=True)
        record = {
            "id": uuid.uuid4().hex,
            "file_name": file_name,
            "signer": signer,
            "ip_address": ip_address,
            "signed_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "summary": _summary(placements),
            "placements": placements,
            "original_sha256": sha256(pdf_bytes),
            "signed_sha256": sha256(signed_body),
        }

        if add_audit_trail:
            final = fitz.open(stream=signed_body, filetype="pdf")
            _audit_page(final, record)
            final.set_metadata({**(final.metadata or {}), "producer": "Dokkiman - Sign PDF"})
            output = final.tobytes(garbage=3, deflate=True)
            final.close()
        else:
            output = signed_body

        record["final_sha256"] = sha256(output)
        record["audit_page"] = add_audit_trail
        return output, record
    finally:
        doc.close()
