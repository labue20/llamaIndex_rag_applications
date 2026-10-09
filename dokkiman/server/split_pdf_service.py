"""
Split PDF documents with PyMuPDF.

Three modes:
- "every":   one PDF per page
- "ranges":  one PDF per page range, e.g. "1-3, 4-6, 7"
- "extract": the selected pages, in order, combined into one PDF
"""

import io
import re
import zipfile

import fitz  # PyMuPDF

from pdf_forms import remove_xfa

SPLIT_MODES = ("every", "ranges", "extract")

# Guards against pathological requests (e.g. "1-1000000")
MAX_RANGES = 200

_RANGE_RE = re.compile(r"^(\d+)(?:\s*-\s*(\d+))?$")


class SplitError(ValueError):
    """The request can't be carried out; the message is safe to show users."""


def parse_ranges(spec, page_count):
    """Parse "1-3, 5, 7-9" into [(1, 3), (5, 5), (7, 9)] (1-based, inclusive)."""
    if not spec or not spec.strip():
        raise SplitError("Enter the pages to use, for example 1-3, 5.")

    parts = [part.strip() for part in spec.split(",") if part.strip()]
    if len(parts) > MAX_RANGES:
        raise SplitError(f"Use at most {MAX_RANGES} page ranges.")

    ranges = []
    for part in parts:
        match = _RANGE_RE.match(part)
        if not match:
            raise SplitError(f'"{part}" isn\'t a page or page range. Use a format like 1-3, 5.')
        start = int(match.group(1))
        end = int(match.group(2) or start)
        if start < 1 or end < 1:
            raise SplitError("Page numbers start at 1.")
        if start > end:
            raise SplitError(f'"{part}" is backwards. Write the lower page first, like {end}-{start}.')
        if end > page_count:
            raise SplitError(
                f'"{part}" goes past the last page. This PDF has {page_count} '
                f'{"page" if page_count == 1 else "pages"}.'
            )
        ranges.append((start, end))
    return ranges


def _range_label(start, end):
    return f"page_{start}" if start == end else f"pages_{start}-{end}"


def _pdf_bytes(pdf_bytes, page_ranges):
    """A new PDF containing the given (start, end) page ranges, in order.

    Made by keeping those pages of a fresh copy rather than copying pages into
    an empty PDF: copying renames form fields that share a name, which breaks
    forms (Adobe shows "Malformed SOM expression")."""
    output = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        output.select([page - 1 for start, end in page_ranges for page in range(start, end + 1)])
        remove_xfa(output)
        return output.tobytes(garbage=3, deflate=True)
    finally:
        output.close()


def open_pdf(pdf_bytes):
    try:
        document = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        raise SplitError("This file couldn't be read as a PDF. It may be damaged.")
    if document.needs_pass:
        document.close()
        raise SplitError("Password-protected PDFs can't be split. Remove the password and try again.")
    if document.page_count == 0:
        document.close()
        raise SplitError("This PDF has no pages.")
    return document


def split_pdf(pdf_bytes, mode, ranges_spec=""):
    """Split a PDF and return a list of (label, pdf_bytes) parts."""
    if mode not in SPLIT_MODES:
        raise SplitError(f"Unknown split mode: {mode}")

    document = open_pdf(pdf_bytes)
    try:
        page_count = document.page_count
        if mode == "every":
            if page_count == 1:
                raise SplitError("This PDF has only one page, so there's nothing to split.")
            return [(_range_label(n, n), _pdf_bytes(pdf_bytes, [(n, n)])) for n in range(1, page_count + 1)]

        ranges = parse_ranges(ranges_spec, page_count)
        if mode == "ranges":
            return [(_range_label(start, end), _pdf_bytes(pdf_bytes, [(start, end)])) for start, end in ranges]

        # extract: everything selected, combined into one file
        return [("extracted", _pdf_bytes(pdf_bytes, ranges))]
    finally:
        document.close()


def zip_parts(parts, stem):
    """Bundle split parts into a ZIP archive as {stem}_{label}.pdf files."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for label, data in parts:
            archive.writestr(f"{stem}_{label}.pdf", data)
    return buffer.getvalue()
