"""
Edit PDFs: organize pages and add things to them, in one pass.

The browser sends the PDF (plus any PDFs being merged in), the pages of the
result in order, things to draw on them, and values for the PDF's own form
fields:

    pages: [{"file": 0, "page": 2, "rotate": 90}, {"blank": true}, ...]
           file 0 is the main PDF, 1.. the merged ones; rotate adds to the
           page's own rotation; a page may appear more than once
    items: [{"page": 0, "kind": "text", "x": .1, "y": .1, "width": .3,
             "height": .05, "text": "Hello", "font_size": .02, "color": "#000000"}, ...]
           page is an index into pages; kind is text, image, highlight, rect,
           whiteout or draw; positions are fractions of the page as shown
           (rotation applied), like Sign PDF
    form:  {"field name": "value" | true | false}

Everything is drawn into the page content (not as annotations), so the result
looks the same in every viewer. Form fields stay fillable.
"""

import io
import json
import re

import fitz  # PyMuPDF
from PIL import Image

MAX_PAGES = 1000
MAX_FILES = 10
MAX_ITEMS = 500
MAX_IMAGES = 20
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_TEXT = 5000
MAX_POINTS = 5000
MAX_FORM_FIELDS = 1000
MAX_FORM_VALUE = 5000
ITEM_KINDS = ("text", "image", "highlight", "rect", "whiteout", "draw")
ROTATIONS = (0, 90, 180, 270)
_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULTS = {"text": "#111827", "highlight": "#fde047", "rect": "#dc2626", "draw": "#2563eb"}
HIGHLIGHT_OPACITY = 0.4


class EditError(ValueError):
    """The request can't be carried out; the message is safe to show users."""


def open_pdf(data, label="This file"):
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        raise EditError(f"{label} couldn't be read as a PDF. It may be damaged.")
    if doc.needs_pass:
        doc.close()
        raise EditError(f"{label} is password-protected. Remove the password and try again.")
    if doc.page_count == 0:
        doc.close()
        raise EditError(f"{label} has no pages.")
    return doc


def _color(value, kind):
    value = value if isinstance(value, str) and _COLOR_RE.match(value) else DEFAULTS.get(kind, "#000000")
    return tuple(int(value[i:i + 2], 16) / 255 for i in (1, 3, 5))


def _fraction(item, key, low=0.0, high=1.0001):
    try:
        value = float(item[key])
    except (KeyError, TypeError, ValueError):
        raise EditError("One of the things added to the PDF isn't valid.")
    if not low <= value <= high:
        raise EditError("Something was placed outside the page.")
    return value


def parse_request(raw, page_counts, image_count):
    """Validate the edit instructions JSON sent by the browser."""
    try:
        data = json.loads(raw or "{}")
    except json.JSONDecodeError:
        raise EditError("The changes couldn't be read. Please try again.")
    if not isinstance(data, dict):
        raise EditError("The changes couldn't be read. Please try again.")

    pages = data.get("pages")
    if not isinstance(pages, list) or not pages:
        raise EditError("The edited PDF needs at least one page.")
    if len(pages) > MAX_PAGES:
        raise EditError(f"The edited PDF can have at most {MAX_PAGES} pages.")
    clean_pages = []
    for entry in pages:
        if not isinstance(entry, dict):
            raise EditError("One of the pages isn't valid.")
        rotate = entry.get("rotate", 0)
        if rotate not in ROTATIONS:
            raise EditError("Pages can only be turned by quarter turns.")
        if entry.get("blank"):
            clean_pages.append({"blank": True, "rotate": rotate})
            continue
        file_index, page_index = entry.get("file", 0), entry.get("page")
        if not isinstance(file_index, int) or not 0 <= file_index < len(page_counts):
            raise EditError("A page comes from a PDF that wasn't uploaded.")
        if not isinstance(page_index, int) or not 0 <= page_index < page_counts[file_index]:
            raise EditError("A page doesn't exist in its PDF.")
        clean_pages.append({"file": file_index, "page": page_index, "rotate": rotate})

    items = data.get("items") or []
    if not isinstance(items, list):
        raise EditError("The changes couldn't be read. Please try again.")
    if len(items) > MAX_ITEMS:
        raise EditError(f"Add at most {MAX_ITEMS} things to a PDF at once.")
    clean_items = []
    for item in items:
        if not isinstance(item, dict) or item.get("kind") not in ITEM_KINDS:
            raise EditError("One of the things added to the PDF isn't valid.")
        page = item.get("page")
        if not isinstance(page, int) or not 0 <= page < len(clean_pages):
            raise EditError("Something was added to a page that doesn't exist.")
        kind = item["kind"]
        entry = {"kind": kind, "page": page, "color": _color(item.get("color"), kind)}
        if kind == "draw":
            points = item.get("points")
            if not isinstance(points, list) or not 2 <= len(points) <= MAX_POINTS:
                raise EditError("A drawing isn't valid.")
            try:
                entry["points"] = [(min(max(float(x), 0.0), 1.0), min(max(float(y), 0.0), 1.0)) for x, y in points]
            except (TypeError, ValueError):
                raise EditError("A drawing isn't valid.")
            entry["stroke"] = _fraction(item, "stroke", 0.0005, 0.05) if "stroke" in item else 0.003
        else:
            x, y = _fraction(item, "x"), _fraction(item, "y")
            width, height = _fraction(item, "width", 0.001), _fraction(item, "height", 0.001)
            if x + width > 1.0001 or y + height > 1.0001:
                raise EditError("Something was placed outside the page.")
            entry.update(x=x, y=y, width=width, height=height)
        if kind == "text":
            text = str(item.get("text", ""))
            if not text.strip():
                continue  # an empty text box: nothing to draw
            if len(text) > MAX_TEXT:
                raise EditError(f"Text boxes can hold at most {MAX_TEXT} characters.")
            entry["text"] = text
            entry["font_size"] = _fraction(item, "font_size", 0.004, 0.2) if "font_size" in item else 0.015
            entry["bold"] = bool(item.get("bold"))
        elif kind == "image":
            index = item.get("image")
            if not isinstance(index, int) or not 0 <= index < image_count:
                raise EditError("An image is missing. Please add it again.")
            entry["image"] = index
        elif kind == "rect":
            entry["stroke"] = _fraction(item, "stroke", 0.0005, 0.05) if "stroke" in item else 0.003
        clean_items.append(entry)

    form = data.get("form") or {}
    if not isinstance(form, dict) or len(form) > MAX_FORM_FIELDS:
        raise EditError("The form values couldn't be read.")
    clean_form = {}
    for name, value in form.items():
        if isinstance(value, bool):
            clean_form[str(name)] = value
        elif isinstance(value, (str, int, float)):
            clean_form[str(name)] = str(value)[:MAX_FORM_VALUE]
    return clean_pages, clean_items, clean_form


def load_image(data):
    """An uploaded image as PNG bytes (keeping transparency)."""
    if len(data) > MAX_IMAGE_BYTES:
        raise EditError("An image is too large (5 MB at most).")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception:
        raise EditError("An image couldn't be read. Use a PNG or JPEG.")
    if image.mode not in ("RGB", "RGBA", "L", "LA"):
        image = image.convert("RGBA")
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def fill_form(doc, values):
    """Set the PDF's own form fields (text, check boxes, radio buttons, lists)."""
    if not values:
        return
    for page in doc:
        for widget in page.widgets():
            if widget.field_name not in values:
                continue
            value = values[widget.field_name]
            kind = widget.field_type
            if kind == fitz.PDF_WIDGET_TYPE_CHECKBOX:
                widget.field_value = widget.on_state() if value is True or value == widget.on_state() else "Off"
            elif kind == fitz.PDF_WIDGET_TYPE_RADIOBUTTON:
                # Radio buttons share a name; the value says which one is on
                widget.field_value = widget.on_state() if str(value) == str(widget.on_state()) else "Off"
            elif kind in (fitz.PDF_WIDGET_TYPE_COMBOBOX, fitz.PDF_WIDGET_TYPE_LISTBOX):
                if widget.choice_values and str(value) not in [
                    c[0] if isinstance(c, (list, tuple)) else c for c in widget.choice_values
                ]:
                    continue
                widget.field_value = str(value)
            elif kind == fitz.PDF_WIDGET_TYPE_TEXT:
                widget.field_value = "" if value is False else str(value)
            else:
                continue
            widget.update()


def _shown_rect(page, item):
    """Item fractions (of the page as shown) -> a rectangle in the page's own,
    unrotated coordinates, which is what PyMuPDF draws in."""
    shown = page.rect
    rect = fitz.Rect(
        shown.x0 + item["x"] * shown.width,
        shown.y0 + item["y"] * shown.height,
        shown.x0 + (item["x"] + item["width"]) * shown.width,
        shown.y0 + (item["y"] + item["height"]) * shown.height,
    )
    return rect * page.derotation_matrix


def _draw_text(page, item):
    rect = _shown_rect(page, item)
    fontsize = max(4.0, item["font_size"] * page.rect.height)
    fontname = "hebo" if item["bold"] else "helv"
    # Shrink to fit the box if the text doesn't fit at the chosen size
    while True:
        if page.insert_textbox(rect, item["text"], fontsize=fontsize, fontname=fontname, color=item["color"],
                               rotate=page.rotation, align=fitz.TEXT_ALIGN_LEFT) >= 0 or fontsize <= 4:
            return
        fontsize = max(4.0, fontsize * 0.9)


def draw_item(page, item, pngs):
    kind = item["kind"]
    if kind == "text":
        _draw_text(page, item)
    elif kind == "image":
        page.insert_image(_shown_rect(page, item), stream=pngs[item["image"]], keep_proportion=True,
                          rotate=page.rotation, overlay=True)
    elif kind == "whiteout":
        page.draw_rect(_shown_rect(page, item), color=None, fill=(1, 1, 1), overlay=True)
    elif kind == "highlight":
        page.draw_rect(_shown_rect(page, item), color=None, fill=item["color"], fill_opacity=HIGHLIGHT_OPACITY,
                       overlay=True)
    elif kind == "rect":
        page.draw_rect(_shown_rect(page, item), color=item["color"], width=item["stroke"] * page.rect.width,
                       overlay=True)
    elif kind == "draw":
        shown = page.rect
        points = [fitz.Point(shown.x0 + x * shown.width, shown.y0 + y * shown.height) * page.derotation_matrix
                  for x, y in item["points"]]
        page.draw_polyline(points, color=item["color"], width=item["stroke"] * shown.width, closePath=False,
                           lineCap=1, lineJoin=1, overlay=True)


def edit_pdf(main_bytes, extra_bytes, raw_request, image_bytes):
    """Apply the edits; returns the new PDF's bytes."""
    if len(extra_bytes) > MAX_FILES - 1:
        raise EditError(f"Combine at most {MAX_FILES} PDFs at once.")
    if len(image_bytes) > MAX_IMAGES:
        raise EditError(f"Add at most {MAX_IMAGES} images at once.")

    doc = open_pdf(main_bytes)
    extras = []
    try:
        for number, data in enumerate(extra_bytes, start=2):
            extras.append(open_pdf(data, f"PDF {number}"))
        page_counts = [doc.page_count] + [extra.page_count for extra in extras]
        pages, items, form = parse_request(raw_request, page_counts, len(image_bytes))
        pngs = [load_image(data) for data in image_bytes]

        # Form fields belong to the main PDF: fill them before pages move around
        fill_form(doc, form)

        # Every source page in one document: the main PDF's pages, then each merged PDF's
        offsets = [0]
        for extra in extras:
            offsets.append(doc.page_count)
            doc.insert_pdf(extra)

        # Build the result's page list. A page used again gets a real copy, so
        # what's drawn on one copy doesn't appear on the other.
        used, order = set(), []
        for entry in pages:
            if entry.get("blank"):
                # The size of the page before it (or the first page)
                like = doc[order[-1]] if order else doc[0]
                doc.new_page(-1, width=like.rect.width, height=like.rect.height)
                order.append(doc.page_count - 1)
                continue
            index = offsets[entry["file"]] + entry["page"]
            if index in used:
                doc.fullcopy_page(index)
                index = doc.page_count - 1
            used.add(index)
            order.append(index)
        doc.select(order)

        for number, entry in enumerate(pages):
            if entry["rotate"]:
                page = doc[number]
                page.set_rotation((page.rotation + entry["rotate"]) % 360)
        for item in items:
            draw_item(doc[item["page"]], item, pngs)

        return doc.tobytes(garbage=3, deflate=True)
    finally:
        for extra in extras:
            extra.close()
        doc.close()
