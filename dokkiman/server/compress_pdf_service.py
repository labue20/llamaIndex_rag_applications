"""
Compress PDF documents with PyMuPDF.

Three levels:
- "light":       keeps images sharp (down to 200 dpi), only trims what's wasted
- "recommended": 150 dpi images, good for screens and most printing
- "strong":      96 dpi images at lower quality, for the smallest file

Every level also drops unused objects, compresses streams and keeps only the
characters of each font that are used. Text stays text.
"""

import fitz  # PyMuPDF

# level -> (shrink images above this dpi, to this dpi, JPEG quality)
LEVELS = {
    "light": (250, 200, 85),
    "recommended": (170, 150, 70),
    "strong": (110, 96, 50),
}


class CompressError(ValueError):
    """The request can't be carried out; the message is safe to show users."""


def compress_pdf(pdf_bytes, level="recommended"):
    """The compressed PDF, or the original bytes when it can't be made smaller."""
    if level not in LEVELS:
        raise CompressError("Choose how much to compress the PDF.")
    try:
        document = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        raise CompressError("This file couldn't be read as a PDF. It may be damaged.")
    try:
        if document.needs_pass:
            raise CompressError("Password-protected PDFs can't be compressed. Remove the password and try again.")
        if document.page_count == 0:
            raise CompressError("This PDF has no pages.")

        threshold, target, quality = LEVELS[level]
        document.rewrite_images(dpi_threshold=threshold, dpi_target=target, quality=quality)
        try:
            document.subset_fonts()
        except Exception:
            pass  # some fonts can't be subset; the file is still valid without it
        data = document.tobytes(garbage=4, deflate=True, deflate_images=True, deflate_fonts=True,
                                clean=True, use_objstms=1)
    finally:
        document.close()
    return data if len(data) < len(pdf_bytes) else pdf_bytes
