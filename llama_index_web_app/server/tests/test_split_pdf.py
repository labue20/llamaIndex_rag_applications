"""Split PDF: range parsing, the three split modes, and the /splitPdf route."""

import io
import zipfile

import fitz
import pytest

from split_pdf_service import SplitError, parse_ranges, split_pdf


def _page_texts(pdf_bytes):
    """The 'This is page N.' marker of each page in a PDF."""
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    texts = [page.get_text().split(".")[0].strip() for page in document]
    document.close()
    return texts


# --- page ranges ---------------------------------------------------------------

@pytest.mark.parametrize("spec,expected", [
    ("1-3", [(1, 3)]),
    ("1-3, 5, 7-9", [(1, 3), (5, 5), (7, 9)]),
    (" 2 - 4 ,6 ", [(2, 4), (6, 6)]),
    ("10", [(10, 10)]),
    ("1-3,,5", [(1, 3), (5, 5)]),
])
def test_parse_ranges(spec, expected):
    assert parse_ranges(spec, 10) == expected


@pytest.mark.parametrize("spec,message", [
    ("", "Enter the pages to use"),
    ("   ", "Enter the pages to use"),
    ("abc", '"abc" isn\'t a page or page range'),
    ("1-", '"1-" isn\'t a page or page range'),
    ("1-3-5", '"1-3-5" isn\'t a page or page range'),
    ("0", "Page numbers start at 1"),
    ("5-2", '"5-2" is backwards'),
    ("8-12", '"8-12" goes past the last page. This PDF has 10 pages.'),
])
def test_parse_ranges_errors(spec, message):
    with pytest.raises(SplitError, match=message.replace("(", r"\(").replace(".", r"\.")):
        parse_ranges(spec, 10)


def test_parse_ranges_limits_the_number_of_ranges():
    with pytest.raises(SplitError, match="at most"):
        parse_ranges(",".join(["1"] * 201), 10)


# --- split modes ------------------------------------------------------------------

def test_every_page(make_pdf):
    parts = split_pdf(make_pdf(pages=3).read_bytes(), "every")
    assert [label for label, _ in parts] == ["page_1", "page_2", "page_3"]
    assert [_page_texts(data) for _, data in parts] == [["This is page 1"], ["This is page 2"], ["This is page 3"]]


def test_ranges(make_pdf):
    parts = split_pdf(make_pdf(pages=6).read_bytes(), "ranges", "1-2, 3, 4-6")
    assert [label for label, _ in parts] == ["pages_1-2", "page_3", "pages_4-6"]
    assert _page_texts(parts[0][1]) == ["This is page 1", "This is page 2"]
    assert _page_texts(parts[2][1]) == ["This is page 4", "This is page 5", "This is page 6"]


def test_extract_combines_pages_in_the_given_order(make_pdf):
    parts = split_pdf(make_pdf(pages=5).read_bytes(), "extract", "4, 1-2")
    assert len(parts) == 1 and parts[0][0] == "extracted"
    assert _page_texts(parts[0][1]) == ["This is page 4", "This is page 1", "This is page 2"]


def test_every_page_of_a_one_page_pdf_is_refused(make_pdf):
    with pytest.raises(SplitError, match="only one page"):
        split_pdf(make_pdf(pages=1).read_bytes(), "every")


def test_password_protected_pdf_is_refused(make_pdf, tmp_path):
    source = fitz.open(make_pdf(pages=2))
    locked = tmp_path / "locked.pdf"
    source.save(locked, encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="secret")
    source.close()
    with pytest.raises(SplitError, match="Password-protected"):
        split_pdf(locked.read_bytes(), "every")


def test_damaged_pdf_is_refused():
    with pytest.raises(SplitError, match="couldn't be read as a PDF"):
        split_pdf(b"%PDF-1.4 this is not really a pdf", "every")


def test_unknown_mode_is_refused(make_pdf):
    with pytest.raises(SplitError, match="Unknown split mode"):
        split_pdf(make_pdf().read_bytes(), "shuffle")


# --- /splitPdf route -----------------------------------------------------------------

def _split(user_client, pdf_bytes, filename="report.pdf", **form):
    return user_client.post(
        "/splitPdf",
        data={"file": (io.BytesIO(pdf_bytes), filename), **form},
        content_type="multipart/form-data",
    )


def test_route_every_page_returns_a_zip(signup, make_pdf):
    response = _split(signup(), make_pdf(pages=3).read_bytes(), mode="every")

    assert response.status_code == 200
    assert response.mimetype == "application/zip"
    assert "report_split.zip" in response.headers["Content-Disposition"]
    archive = zipfile.ZipFile(io.BytesIO(response.data))
    assert archive.namelist() == ["report_page_1.pdf", "report_page_2.pdf", "report_page_3.pdf"]
    assert _page_texts(archive.read("report_page_2.pdf")) == ["This is page 2"]


def test_route_single_range_returns_one_pdf(signup, make_pdf):
    response = _split(signup(), make_pdf(pages=5).read_bytes(), mode="ranges", ranges="2-3")

    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert "report_pages_2-3.pdf" in response.headers["Content-Disposition"]
    assert _page_texts(response.data) == ["This is page 2", "This is page 3"]


def test_route_extract_returns_one_pdf(signup, make_pdf):
    response = _split(signup(), make_pdf(pages=5).read_bytes(), mode="extract", ranges="5, 1")
    assert "report_extracted.pdf" in response.headers["Content-Disposition"]
    assert _page_texts(response.data) == ["This is page 5", "This is page 1"]


def test_route_reports_bad_ranges(signup, make_pdf):
    response = _split(signup(), make_pdf(pages=3).read_bytes(), mode="ranges", ranges="2-9")
    assert response.status_code == 400
    assert response.get_json()["error"] == '"2-9" goes past the last page. This PDF has 3 pages.'


def test_route_rejects_unknown_modes_and_non_pdfs(signup, make_pdf):
    user_client = signup()
    assert _split(user_client, make_pdf().read_bytes(), mode="shuffle").status_code == 400
    not_pdf = _split(user_client, b"hello", filename="notes.txt", mode="every")
    assert not_pdf.status_code == 400
    assert not_pdf.get_json()["error"] == "File must be a PDF"


def test_route_sanitizes_the_download_name(signup, make_pdf):
    response = _split(signup(), make_pdf(pages=2).read_bytes(), filename="../../etc/My Report.pdf", mode="every")
    disposition = response.headers["Content-Disposition"]
    assert "My_Report_split.zip" in disposition
    assert ".." not in disposition and "/" not in disposition.split("filename=")[1]


def test_route_lets_the_browser_read_the_file_name(signup, make_pdf):
    response = signup().post(
        "/splitPdf",
        data={"file": (io.BytesIO(make_pdf(pages=2).read_bytes()), "report.pdf"), "mode": "every"},
        content_type="multipart/form-data",
        headers={"Origin": "http://localhost:3000"},
    )
    assert "Content-Disposition" in response.headers["Access-Control-Expose-Headers"]
