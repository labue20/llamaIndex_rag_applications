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
           page is an index into pages; positions are fractions of the page as
           shown (rotation applied), like Sign PDF. Kinds:
             text      font_size (fraction of page height), color, font (sans,
                       serif, mono), bold, italic, underline, align
             image     image (index into the uploaded images)
             highlight, whiteout, rect, ellipse   a box (rect and ellipse: stroke)
             line      points [[x, y], [x, y]], arrow, stroke
             draw      points (freehand), stroke
             mark      mark: check, cross, circle or dot
             redact    blacked out: what's underneath is removed from the file
             erase     removes the page's own text in the box (editing existing
                       text sends an erase for the old line and a text item)
             note      a sticky note (a real PDF comment): text, color
    form:  {"field name": "value" | true | false}
    options: {"watermark": {"text", "color", "opacity", "size", "diagonal"},
              "page_numbers": {"format", "position", "start", "skip_first", "size"}}

Everything is drawn into the page content (not as annotations), so the result
looks the same in every viewer. Form fields stay fillable. Redact and erase
really remove the text underneath; white-out only covers it.

text_lines() lists a PDF's lines of text with their style, for editing them.
"""

import html
import io
import json
import math
import re

import fitz  # PyMuPDF
from PIL import Image

from pdf_forms import remove_xfa

MAX_PAGES = 1000
MAX_FILES = 10
MAX_ITEMS = 500
MAX_IMAGES = 20
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_TEXT = 5000
MAX_POINTS = 5000
MAX_FORM_FIELDS = 1000
MAX_FORM_VALUE = 5000
ITEM_KINDS = ("text", "image", "highlight", "rect", "ellipse", "line", "whiteout", "draw", "mark", "redact", "erase",
              "note")
MAX_NOTE = 2000
MAX_WATERMARK = 60
NUMBER_FORMATS = {
    "n": "{n}",
    "page_n": "Page {n}",
    "page_n_of": "Page {n} of {total}",
    "n_of": "{n} / {total}",
}
NUMBER_POSITIONS = ("bottom-center", "bottom-right", "bottom-left", "top-center", "top-right", "top-left")
IMAGE_TYPES = ("png", "jpg", "jpeg", "webp")
MARKS = ("check", "cross", "circle", "dot")
FONTS = {"sans": "sans-serif", "serif": "serif", "mono": "monospace"}
ALIGNS = ("left", "center", "right")
MAX_TEXT_PAGES = 300
MAX_LINES_PER_PAGE = 3000
ROTATIONS = (0, 90, 180, 270)
_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULTS = {"text": "#111827", "highlight": "#fde047", "rect": "#dc2626", "ellipse": "#dc2626", "line": "#dc2626",
            "draw": "#2563eb", "mark": "#16a34a", "note": "#f59e0b", "watermark": "#dc2626"}
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
        if kind in ("draw", "line"):
            points = item.get("points")
            if not isinstance(points, list) or not 2 <= len(points) <= (MAX_POINTS if kind == "draw" else 2):
                raise EditError("A drawing isn't valid.")
            try:
                entry["points"] = [(min(max(float(x), 0.0), 1.0), min(max(float(y), 0.0), 1.0)) for x, y in points]
            except (TypeError, ValueError):
                raise EditError("A drawing isn't valid.")
            entry["stroke"] = _fraction(item, "stroke", 0.0005, 0.05) if "stroke" in item else 0.003
            entry["arrow"] = kind == "line" and bool(item.get("arrow"))
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
            entry["italic"] = bool(item.get("italic"))
            entry["underline"] = bool(item.get("underline"))
            entry["font"] = item.get("font") if item.get("font") in FONTS else "sans"
            entry["align"] = item.get("align") if item.get("align") in ALIGNS else "left"
        elif kind == "image":
            index = item.get("image")
            if not isinstance(index, int) or not 0 <= index < image_count:
                raise EditError("An image is missing. Please add it again.")
            entry["image"] = index
        elif kind in ("rect", "ellipse"):
            entry["stroke"] = _fraction(item, "stroke", 0.0005, 0.05) if "stroke" in item else 0.003
        elif kind == "mark":
            if item.get("mark") not in MARKS:
                raise EditError("One of the marks isn't valid.")
            entry["mark"] = item["mark"]
        elif kind == "note":
            text = str(item.get("text", "")).strip()
            if not text:
                continue  # an empty note: nothing to add
            entry["text"] = text[:MAX_NOTE]
        clean_items.append(entry)

    options = _parse_options(data.get("options"))

    form = data.get("form") or {}
    if not isinstance(form, dict) or len(form) > MAX_FORM_FIELDS:
        raise EditError("The form values couldn't be read.")
    clean_form = {}
    for name, value in form.items():
        if isinstance(value, bool):
            clean_form[str(name)] = value
        elif isinstance(value, (str, int, float)):
            clean_form[str(name)] = str(value)[:MAX_FORM_VALUE]
    return clean_pages, clean_items, clean_form, options


def _number(value, low, high, default):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return min(max(number, low), high)


def _parse_options(raw):
    """Whole-document options: a watermark and page numbers (both optional)."""
    options = {}
    if not isinstance(raw, dict):
        return options
    watermark = raw.get("watermark")
    if isinstance(watermark, dict) and str(watermark.get("text", "")).strip():
        options["watermark"] = {
            "text": " ".join(str(watermark["text"]).split())[:MAX_WATERMARK],
            "color": _color(watermark.get("color"), "watermark"),
            "opacity": _number(watermark.get("opacity"), 0.05, 1, 0.25),
            # Font size as a fraction of the page's shorter side
            "size": _number(watermark.get("size"), 0.03, 0.25, 0.1),
            "diagonal": watermark.get("diagonal", True) is not False,
        }
    numbers = raw.get("page_numbers")
    if isinstance(numbers, dict) and numbers.get("enabled", True):
        options["page_numbers"] = {
            "format": numbers.get("format") if numbers.get("format") in NUMBER_FORMATS else "n",
            "position": numbers.get("position") if numbers.get("position") in NUMBER_POSITIONS else "bottom-center",
            "start": int(_number(numbers.get("start"), 1, 100000, 1)),
            "skip_first": bool(numbers.get("skip_first")),
            "size": _number(numbers.get("size"), 6, 36, 10),
        }
    return options


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


def _hex(color):
    return "#" + "".join(f"{round(c * 255):02x}" for c in color)


def _draw_text(page, item):
    """Styled text in its box (shrunk to fit if it doesn't). Fonts with
    other alphabets (Chinese, Arabic...) are filled in automatically."""
    fontsize = max(4.0, item["font_size"] * page.rect.height)
    css = (
        f"* {{font-family: {FONTS[item['font']]}; font-size: {fontsize:.2f}px; line-height: 1.15;"
        f" color: {_hex(item['color'])}; text-align: {item['align']};"
        f" font-weight: {'bold' if item['bold'] else 'normal'}; font-style: {'italic' if item['italic'] else 'normal'};"
        f" text-decoration: {'underline' if item['underline'] else 'none'}; white-space: pre-wrap;"
        f" margin: 0; padding: 0;}}"
    )
    body = "<br>".join(html.escape(line) for line in item["text"].split("\n"))
    page.insert_htmlbox(_shown_rect(page, item), body, css=css, rotate=page.rotation, scale_low=0)


def _shown_point(page, x, y):
    shown = page.rect
    return fitz.Point(shown.x0 + x * shown.width, shown.y0 + y * shown.height) * page.derotation_matrix


def _draw_line(page, item):
    (x1, y1), (x2, y2) = item["points"]
    shown = page.rect
    width = item["stroke"] * shown.width
    start, end = _shown_point(page, x1, y1), _shown_point(page, x2, y2)
    page.draw_line(start, end, color=item["color"], width=width, lineCap=1, overlay=True)
    if item["arrow"]:
        # The arrowhead, worked out on the page as shown
        ax, ay = x1 * shown.width, y1 * shown.height
        bx, by = x2 * shown.width, y2 * shown.height
        angle = math.atan2(by - ay, bx - ax)
        size = max(width * 4, 6)
        wings = [(bx - size * math.cos(angle - a), by - size * math.sin(angle - a)) for a in (0.45, -0.45)]
        head = [fitz.Point(bx, by)] + [fitz.Point(wx, wy) for wx, wy in wings]
        page.draw_polyline([p * page.derotation_matrix for p in head], color=item["color"], fill=item["color"],
                           width=width, closePath=True, overlay=True)


def _draw_mark(page, item):
    rect = _shown_rect(page, item)
    width = max(1.0, min(rect.width, rect.height) * 0.12)
    mark = item["mark"]
    if mark in ("circle", "dot"):
        inset = width / 2 if mark == "circle" else 0
        page.draw_oval(rect + (inset, inset, -inset, -inset), color=None if mark == "dot" else item["color"],
                       fill=item["color"] if mark == "dot" else None, width=width, overlay=True)
        return
    # Check and cross, drawn in the box as shown
    strokes = ([[(0.15, 0.55), (0.4, 0.8), (0.88, 0.18)]] if mark == "check"
               else [[(0.18, 0.18), (0.82, 0.82)], [(0.82, 0.18), (0.18, 0.82)]])
    for stroke in strokes:
        points = [_shown_point(page, item["x"] + fx * item["width"], item["y"] + fy * item["height"]) for fx, fy in stroke]
        page.draw_polyline(points, color=item["color"], width=width, lineCap=1, lineJoin=1, closePath=False,
                           overlay=True)


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
    elif kind == "ellipse":
        page.draw_oval(_shown_rect(page, item), color=item["color"], width=item["stroke"] * page.rect.width,
                       overlay=True)
    elif kind == "line":
        _draw_line(page, item)
    elif kind == "mark":
        _draw_mark(page, item)
    elif kind == "note":
        # A real comment: opens in PDF viewers' comment panes
        rect = _shown_rect(page, item)
        annot = page.add_text_annot(rect.tl, item["text"], icon="Note")
        annot.set_colors(stroke=item["color"])
        annot.set_info(title="Note")
        annot.update()
    elif kind == "draw":
        shown = page.rect
        points = [fitz.Point(shown.x0 + x * shown.width, shown.y0 + y * shown.height) * page.derotation_matrix
                  for x, y in item["points"]]
        page.draw_polyline(points, color=item["color"], width=item["stroke"] * shown.width, closePath=False,
                           lineCap=1, lineJoin=1, overlay=True)


def add_watermark(page, options):
    """Text across the page, see-through, upright on the page as shown."""
    shown = page.rect
    center = fitz.Point(shown.width / 2, shown.height / 2) * page.derotation_matrix
    fontsize = options["size"] * min(shown.width, shown.height)
    # Long text shrinks to fit across the page
    fontsize = min(fontsize, 0.9 * (math.hypot(shown.width, shown.height) if options["diagonal"] else shown.width)
                   / max(1.0, fitz.get_text_length(options["text"], fontname="hebo", fontsize=1)))
    width = fitz.get_text_length(options["text"], fontname="hebo", fontsize=fontsize)
    angle = (math.degrees(math.atan2(shown.height, shown.width)) if options["diagonal"] else 0) + page.rotation
    page.insert_text(fitz.Point(center.x - width / 2, center.y + fontsize * 0.35), options["text"], fontsize=fontsize,
                     fontname="hebo", color=options["color"], fill_opacity=options["opacity"],
                     morph=(center, fitz.Matrix(angle)), overlay=True)


def add_page_number(page, label, options):
    shown = page.rect
    fontsize = options["size"]
    margin = max(18.0, shown.height * 0.03)
    vertical, horizontal = options["position"].split("-")
    top = margin if vertical == "top" else shown.height - margin - fontsize * 1.6
    box = fitz.Rect(margin, top, shown.width - margin, top + fontsize * 1.6)
    css = (f"* {{font-family: sans-serif; font-size: {fontsize:.1f}px; color: #374151; margin: 0;"
           f" text-align: {'center' if horizontal == 'center' else horizontal};}}")
    page.insert_htmlbox(box * page.derotation_matrix, html.escape(label), css=css, rotate=page.rotation)


def apply_options(doc, options):
    if "watermark" in options:
        for page in doc:
            add_watermark(page, options["watermark"])
    numbers = options.get("page_numbers")
    if numbers:
        first = 1 if numbers["skip_first"] else 0
        total = doc.page_count - first + numbers["start"] - 1
        for index in range(first, doc.page_count):
            n = index - first + numbers["start"]
            add_page_number(doc[index], NUMBER_FORMATS[numbers["format"]].format(n=n, total=total), numbers)


def images_to_pdf(image_bytes, name="image"):
    """A photo or picture as a one-page PDF, the page as wide as US Letter
    (612 points) and as tall as the image needs. Phone photos are turned the
    right way up."""
    from PIL import ImageOps
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image)
        image.load()
    except Exception:
        raise EditError(f"{name} couldn't be read as an image. Use a PNG or JPEG.")
    if image.mode not in ("RGB", "L"):
        background = Image.new("RGB", image.size, "white")
        background.paste(image.convert("RGBA"), mask=image.convert("RGBA").split()[-1])
        image = background
    # Keep files reasonable: big photos are scaled down to about 200 dpi
    if max(image.size) > 2400:
        image.thumbnail((2400, 2400))
    jpeg = io.BytesIO()
    image.save(jpeg, format="JPEG", quality=88)
    width = 612
    height = width * image.height / image.width
    doc = fitz.open()
    page = doc.new_page(width=width, height=height)
    page.insert_image(page.rect, stream=jpeg.getvalue())
    try:
        return doc.tobytes(garbage=3, deflate=True)
    finally:
        doc.close()


def remove_underneath(doc, items):
    """Erase (the page's own text only, for edited lines) and redact (text,
    images and drawings, then a black box), before anything is drawn."""
    for kind in ("erase", "redact"):
        pages = {}
        for item in items:
            if item["kind"] == kind:
                pages.setdefault(item["page"], []).append(item)
        for number, page_items in pages.items():
            page = doc[number]
            for item in page_items:
                rect = _shown_rect(page, item)
                if kind == "erase":
                    # Slightly smaller, so the lines above and below aren't touched
                    inset = rect.height * 0.12 if page.rotation in (0, 180) else rect.width * 0.12
                    rect = rect + ((0, inset, 0, -inset) if page.rotation in (0, 180) else (inset, 0, -inset, 0))
                    page.add_redact_annot(rect, fill=False)
                else:
                    page.add_redact_annot(rect, fill=(0, 0, 0))
            if kind == "erase":
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_NONE)
            else:
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS,
                                      graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED)


def _style_of(span):
    name = span["font"].lower()
    if any(word in name for word in ("courier", "mono", "consol")):
        font = "mono"
    elif any(word in name for word in ("times", "serif", "georgia", "garamond", "roman", "book", "cambria", "minion")) \
            and "sans" not in name:
        font = "serif"
    else:
        font = "sans"
    return {
        "font": font,
        "bold": bool(span["flags"] & 16) or "bold" in name or "black" in name,
        "italic": bool(span["flags"] & 2) or "italic" in name or "oblique" in name,
        "color": f"#{span['color'] & 0xFFFFFF:06x}",
    }


def text_lines(pdf_bytes):
    """Every horizontal line of text, per page, as shown (the page's own
    rotation applied): box, text, size and style, as fractions of the page."""
    doc = open_pdf(pdf_bytes)
    try:
        pages = []
        for page in doc.pages(0, min(doc.page_count, MAX_TEXT_PAGES)):
            shown = page.rect
            lines = []
            for block in page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]:
                for line in block.get("lines", []):
                    spans = [s for s in line["spans"] if s["text"].strip()]
                    # Only text that reads left to right as shown
                    turn = page.rotation_matrix
                    direction = fitz.Point(line["dir"]) * fitz.Matrix(turn.a, turn.b, turn.c, turn.d, 0, 0)
                    if not spans or abs(direction.y) > 0.01 or direction.x < 0:
                        continue
                    box = fitz.Rect(line["bbox"]) * page.rotation_matrix
                    main = max(spans, key=lambda s: len(s["text"]))
                    lines.append({
                        "x": round(box.x0 / shown.width, 5), "y": round(box.y0 / shown.height, 5),
                        "width": round(box.width / shown.width, 5), "height": round(box.height / shown.height, 5),
                        "text": "".join(s["text"] for s in line["spans"]).strip(),
                        "font_size": round(main["size"] / shown.height, 5),
                        **_style_of(main),
                    })
                    if len(lines) >= MAX_LINES_PER_PAGE:
                        break
            pages.append(lines)
        return pages
    finally:
        doc.close()


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
        pages, items, form, options = parse_request(raw_request, page_counts, len(image_bytes))
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
        remove_underneath(doc, items)
        for item in items:
            if item["kind"] not in ("erase", "redact"):
                draw_item(doc[item["page"]], item, pngs)
        apply_options(doc, options)
        # Adobe's own copy of the form no longer matches the pages and values
        remove_xfa(doc)

        return doc.tobytes(garbage=3, deflate=True)
    finally:
        for extra in extras:
            extra.close()
        doc.close()
