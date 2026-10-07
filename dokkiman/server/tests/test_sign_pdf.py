"""Sign PDF: placement validation, stamping, audit trail and the /signPdf route."""

import hashlib
import io
import json
import sqlite3

import fitz
import pytest
from PIL import Image

from sign_pdf_service import SignError, parse_placements, sign_pdf


def _png(color=(200, 0, 0, 255), size=(200, 80)):
    buffer = io.BytesIO()
    Image.new("RGBA", size, color).save(buffer, "PNG")
    return buffer.getvalue()


SIGNATURE = {"type": "image", "page": 0, "x": 0.1, "y": 0.7, "width": 0.3, "height": 0.08, "image": 0, "label": "signature"}
DATE = {"type": "text", "page": 0, "x": 0.5, "y": 0.72, "width": 0.3, "height": 0.04, "text": "10/06/2026", "label": "date"}


def _sign(pdf_bytes, placements, images=None, **kwargs):
    options = {"file_name": "lease.pdf", "signer": "me@example.com", "ip_address": "203.0.113.7", **kwargs}
    return sign_pdf(pdf_bytes, json.dumps(placements), images if images is not None else [_png()], **options)


# --- validation -------------------------------------------------------------------

@pytest.mark.parametrize("raw,message", [
    ("not json", "couldn't be read"),
    ("[]", "Add at least one"),
    (json.dumps([{**SIGNATURE, "type": "video"}]), "isn't valid"),
    (json.dumps([{**SIGNATURE, "page": 5}]), "doesn't exist"),
    (json.dumps([{**SIGNATURE, "x": 0.9}]), "outside the page"),
    (json.dumps([{**SIGNATURE, "width": 0}]), "outside the page"),
    (json.dumps([{**SIGNATURE, "image": 3}]), "image is missing"),
    (json.dumps([{**DATE, "text": ""}]), "1 to 100 characters"),
    (json.dumps([SIGNATURE] * 51), "at most 50"),
])
def test_placement_validation(raw, message):
    with pytest.raises(SignError, match=message):
        parse_placements(raw, page_count=2, image_count=1)


def test_non_image_uploads_are_refused(make_pdf):
    with pytest.raises(SignError, match="couldn't be read"):
        _sign(make_pdf().read_bytes(), [SIGNATURE], images=[b"not an image"])


def test_password_protected_pdfs_are_refused(make_pdf, tmp_path):
    source = fitz.open(make_pdf())
    locked = tmp_path / "locked.pdf"
    source.save(locked, encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="o", user_pw="u")
    with pytest.raises(SignError, match="Password-protected"):
        _sign(locked.read_bytes(), [SIGNATURE])


# --- stamping ------------------------------------------------------------------------

def test_signature_and_date_are_stamped_into_the_page(make_pdf):
    output, _ = _sign(make_pdf(pages=2).read_bytes(), [SIGNATURE, DATE], add_audit_trail=False)
    signed = fitz.open(stream=output, filetype="pdf")

    assert signed.page_count == 2
    page = signed[0]
    assert "10/06/2026" in page.get_text()
    # Red pixels where the signature was placed; none elsewhere
    pixmap = page.get_pixmap()
    r, g, b = pixmap.pixel(int(0.25 * pixmap.width), int(0.74 * pixmap.height))[:3]
    assert r > 150 and g < 80 and b < 80
    assert min(pixmap.pixel(int(0.25 * pixmap.width), int(0.3 * pixmap.height))[:3]) > 240
    # Stamped into the content, not an annotation that could be removed
    assert list(page.annots()) == []


def test_items_land_on_the_right_page(make_pdf):
    output, _ = _sign(make_pdf(pages=3).read_bytes(), [{**DATE, "page": 2}], add_audit_trail=False)
    signed = fitz.open(stream=output, filetype="pdf")
    assert "10/06/2026" not in signed[0].get_text()
    assert "10/06/2026" in signed[2].get_text()


# --- audit trail ------------------------------------------------------------------------

def test_audit_page_and_fingerprints(make_pdf):
    original = make_pdf(pages=2).read_bytes()
    output, record = _sign(original, [SIGNATURE, DATE])
    signed = fitz.open(stream=output, filetype="pdf")

    assert signed.page_count == 3  # 2 pages + audit trail
    audit = signed[-1].get_text()
    for expected in ("Signature audit trail", "lease.pdf", "me@example.com", "203.0.113.7",
                     record["id"], record["original_sha256"], record["signed_sha256"],
                     "signature on page 1", "date on page 1"):
        assert expected in audit, expected

    assert record["original_sha256"] == hashlib.sha256(original).hexdigest()
    assert record["final_sha256"] == hashlib.sha256(output).hexdigest()
    # The signed fingerprint covers the signed pages without the audit page
    assert record["signed_sha256"] != record["original_sha256"]


def test_audit_page_is_optional(make_pdf):
    output, record = _sign(make_pdf(pages=2).read_bytes(), [SIGNATURE], add_audit_trail=False)
    assert fitz.open(stream=output, filetype="pdf").page_count == 2
    assert record["final_sha256"] == record["signed_sha256"]


# --- /signPdf route -------------------------------------------------------------------------

def _post(client, pdf_bytes, placements, images=None, **form):
    data = {
        "file": (io.BytesIO(pdf_bytes), "Lease Agreement.pdf"),
        "placements": json.dumps(placements),
        "images": [(io.BytesIO(png), f"signature{i}.png") for i, png in enumerate(images if images is not None else [_png()])],
        **form,
    }
    return client.post("/signPdf", data=data, content_type="multipart/form-data")


def test_route_signs_and_records_the_audit_trail(signup, make_pdf, fresh_db):
    user_client = signup("signer@example.com")
    response = _post(user_client, make_pdf(pages=2).read_bytes(), [SIGNATURE, DATE])

    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert "Lease_Agreement_signed.pdf" in response.headers["Content-Disposition"]
    assert response.headers["X-Document-SHA256"] == hashlib.sha256(response.data).hexdigest()

    audit = fitz.open(stream=response.data, filetype="pdf")[-1].get_text()
    assert "signer@example.com" in audit

    with sqlite3.connect(fresh_db) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM signature_audit").fetchone()
    assert row["id"] == response.headers["X-Audit-Record-Id"]
    assert row["user_id"] == user_client.user["id"]
    assert row["signer"] == "signer@example.com"
    assert row["final_sha256"] == response.headers["X-Document-SHA256"]
    assert len(json.loads(row["placements"])) == 2


def test_route_can_skip_the_audit_page(signup, make_pdf):
    response = _post(signup(), make_pdf(pages=2).read_bytes(), [SIGNATURE], audit="false")
    assert fitz.open(stream=response.data, filetype="pdf").page_count == 2


def test_guests_can_sign(client, make_pdf):
    response = _post(client, make_pdf().read_bytes(), [SIGNATURE])
    assert response.status_code == 200
    assert "Guest (not signed in)" in fitz.open(stream=response.data, filetype="pdf")[-1].get_text()


def test_route_reports_problems(signup, make_pdf):
    user_client = signup()
    bad = _post(user_client, make_pdf().read_bytes(), [{**SIGNATURE, "page": 9}])
    assert bad.status_code == 400
    assert "doesn't exist" in bad.get_json()["error"]

    not_pdf = user_client.post("/signPdf", data={"file": (io.BytesIO(b"x"), "a.txt")},
                               content_type="multipart/form-data")
    assert not_pdf.status_code == 400


def test_browser_can_read_the_fingerprint_headers(signup, make_pdf):
    response = signup().post(
        "/signPdf",
        data={"file": (io.BytesIO(make_pdf().read_bytes()), "a.pdf"), "placements": json.dumps([DATE])},
        content_type="multipart/form-data",
        headers={"Origin": "http://localhost:3000"},
    )
    exposed = response.headers["Access-Control-Expose-Headers"]
    assert "X-Document-SHA256" in exposed and "X-Audit-Record-Id" in exposed
