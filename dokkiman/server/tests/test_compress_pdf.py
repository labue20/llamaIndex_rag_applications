"""Compress PDF: the three levels, files that can't shrink, and the /compressPdf route."""

import io

import fitz
import pytest
from PIL import Image, ImageFilter

from compress_pdf_service import CompressError, compress_pdf


def _photo_pdf(pages=2):
    """A PDF of full-page 300 dpi photos (like a phone scan) with a line of text each."""
    document = fitz.open()
    for number in range(1, pages + 1):
        image = Image.effect_noise((1275, 1650), 40).convert("RGB").filter(ImageFilter.GaussianBlur(2))
        buffer = io.BytesIO()
        image.save(buffer, "JPEG", quality=95)
        page = document.new_page(width=306, height=396)
        page.insert_image(page.rect, stream=buffer.getvalue())
        page.insert_text((36, 36), f"This is page {number}.")
    data = document.tobytes()
    document.close()
    return data


def _texts(pdf_bytes):
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    texts = [page.get_text().strip() for page in document]
    document.close()
    return texts


def test_each_level_is_smaller_than_the_last_and_keeps_the_text():
    original = _photo_pdf()
    sizes = []
    for level in ("light", "recommended", "strong"):
        data = compress_pdf(original, level)
        assert _texts(data) == ["This is page 1.", "This is page 2."]
        sizes.append(len(data))
    assert len(original) > sizes[0] > sizes[1] > sizes[2]
    assert sizes[2] < len(original) / 4


def test_a_file_that_cant_shrink_comes_back_unchanged(make_pdf):
    # Re-compressing an already compressed file
    once = compress_pdf(_photo_pdf(pages=1), "strong")
    assert compress_pdf(once, "strong") == once


def test_unknown_level():
    with pytest.raises(CompressError, match="Choose how much"):
        compress_pdf(_photo_pdf(pages=1), "extreme")


def test_password_protected_and_damaged_files():
    document = fitz.open()
    document.new_page()
    locked = document.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="secret", owner_pw="secret")
    with pytest.raises(CompressError, match="Password-protected"):
        compress_pdf(locked)
    with pytest.raises(CompressError, match="couldn't be read"):
        compress_pdf(b"%PDF-1.7 not really")


# --- /compressPdf route -----------------------------------------------------------

def _compress(client, pdf_bytes, filename="scan.pdf", **form):
    return client.post(
        "/compressPdf",
        data={"file": (io.BytesIO(pdf_bytes), filename), **form},
        content_type="multipart/form-data",
    )


def test_route_returns_the_smaller_pdf(signup):
    original = _photo_pdf()
    response = _compress(signup(), original, level="strong")

    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert "scan_compressed.pdf" in response.headers["Content-Disposition"]
    assert len(response.data) < len(original) / 4
    assert _texts(response.data)[0] == "This is page 1."


def test_route_works_for_guests(client):
    response = _compress(client, _photo_pdf(pages=1))
    assert response.status_code == 200


def test_route_rejects_bad_requests(signup):
    user = signup()
    assert _compress(user, _photo_pdf(pages=1), level="extreme").status_code == 400
    response = _compress(user, b"hello", filename="notes.txt")
    assert response.status_code == 400
