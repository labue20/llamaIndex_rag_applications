"""Edit PDF: organizing pages, drawing on them, filling forms, and the /editPdf route."""

import io
import json

import fitz
import pytest
from PIL import Image

from edit_pdf_service import EditError, edit_pdf, parse_request


def _png(color=(200, 0, 0, 255), size=(100, 50)):
    buffer = io.BytesIO()
    Image.new("RGBA", size, color).save(buffer, "PNG")
    return buffer.getvalue()


def _edit(pdf_bytes, pages, items=(), form=None, extras=(), images=()):
    data = json.dumps({"pages": pages, "items": list(items), "form": form or {}})
    return fitz.open(stream=edit_pdf(pdf_bytes, list(extras), data, list(images)), filetype="pdf")


def _texts(doc):
    return [" ".join(page.get_text().split()) for page in doc]


def _pixel(page, fx, fy):
    """RGB at a point given as fractions of the page as shown."""
    pixmap = page.get_pixmap()
    return pixmap.pixel(int(fx * pixmap.width), int(fy * pixmap.height))[:3]


def _form_pdf(tmp_path):
    doc = fitz.open()
    page = doc.new_page(width=600, height=800)
    fields = [
        ("name", fitz.PDF_WIDGET_TYPE_TEXT, fitz.Rect(50, 50, 300, 80), {}),
        ("agree", fitz.PDF_WIDGET_TYPE_CHECKBOX, fitz.Rect(50, 100, 70, 120), {}),
        ("color", fitz.PDF_WIDGET_TYPE_COMBOBOX, fitz.Rect(50, 150, 200, 175), {"choice_values": ["Red", "Blue"]}),
    ]
    for name, kind, rect, extra in fields:
        widget = fitz.Widget()
        widget.field_name, widget.field_type, widget.rect = name, kind, rect
        for key, value in extra.items():
            setattr(widget, key, value)
        page.add_widget(widget)
    path = tmp_path / "form.pdf"
    doc.save(path)
    return path.read_bytes()


def _values(doc):
    return {w.field_name: w.field_value for page in doc for w in page.widgets()}


# --- pages ------------------------------------------------------------------------------

def test_reorder_delete_and_duplicate(make_pdf):
    doc = _edit(make_pdf(pages=3).read_bytes(),
                [{"page": 2}, {"page": 0}, {"page": 0}])  # page 2 (index 1) left out
    assert doc.page_count == 3
    assert [t.split(".")[0] for t in _texts(doc)] == ["This is page 3", "This is page 1", "This is page 1"]


def test_a_duplicated_page_is_a_real_copy(make_pdf):
    text = {"kind": "text", "x": 0.1, "y": 0.5, "width": 0.6, "height": 0.05, "text": "ONLY ON THE COPY"}
    doc = _edit(make_pdf(pages=1).read_bytes(), [{"page": 0}, {"page": 0}], [{**text, "page": 1}])
    assert "ONLY ON THE COPY" not in _texts(doc)[0]
    assert "ONLY ON THE COPY" in _texts(doc)[1]


def test_rotation_adds_to_the_pages_own(make_pdf, tmp_path):
    source = fitz.open(make_pdf(pages=2))
    source[1].set_rotation(90)
    path = tmp_path / "rotated.pdf"
    source.save(path)
    doc = _edit(path.read_bytes(), [{"page": 0, "rotate": 90}, {"page": 1, "rotate": 270}])
    assert [p.rotation for p in doc] == [90, 0]


def test_blank_pages_match_the_page_before(make_pdf):
    doc = _edit(make_pdf(pages=1).read_bytes(), [{"page": 0}, {"blank": True}])
    assert doc.page_count == 2
    assert doc[1].get_text().strip() == ""
    assert doc[1].rect == doc[0].rect


def test_merging_other_pdfs(make_pdf):
    main = make_pdf(pages=2, name="a.pdf", marker="Main").read_bytes()
    other = make_pdf(pages=2, name="b.pdf", marker="Other").read_bytes()
    doc = _edit(main, [{"page": 0}, {"file": 1, "page": 1}, {"page": 1}], extras=[other])
    texts = _texts(doc)
    assert "Main" in texts[0] and "Other" in texts[1] and "page 2" in texts[1] and "Main" in texts[2]


# --- things drawn on pages ------------------------------------------------------------------

def test_text_is_written_into_the_page(make_pdf):
    doc = _edit(make_pdf(pages=2).read_bytes(), [{"page": 0}, {"page": 1}], [
        {"kind": "text", "page": 1, "x": 0.1, "y": 0.4, "width": 0.8, "height": 0.1,
         "text": "Paid in full\nThank you", "font_size": 0.02, "color": "#2563eb", "bold": True},
    ])
    assert "Paid in full Thank you" in _texts(doc)[1]
    assert "Paid in full" not in _texts(doc)[0]
    assert list(doc[1].annots()) == []  # in the content, not an annotation


def test_text_too_big_for_its_box_shrinks_to_fit(make_pdf):
    doc = _edit(make_pdf(pages=1).read_bytes(), [{"page": 0}], [
        {"kind": "text", "page": 0, "x": 0.1, "y": 0.5, "width": 0.3, "height": 0.03,
         "text": "A sentence that is far too long for this small box", "font_size": 0.05},
    ])
    assert "far too long" in _texts(doc)[0]


def test_shapes_highlights_whiteout_drawings_and_images(make_pdf):
    doc = _edit(make_pdf(pages=1).read_bytes(), [{"page": 0}], [
        {"kind": "whiteout", "page": 0, "x": 0.0, "y": 0.0, "width": 1.0, "height": 0.2},
        {"kind": "highlight", "page": 0, "x": 0.1, "y": 0.3, "width": 0.3, "height": 0.05},
        {"kind": "rect", "page": 0, "x": 0.5, "y": 0.3, "width": 0.3, "height": 0.1, "color": "#00ff00",
         "stroke": 0.01},
        {"kind": "draw", "page": 0, "points": [[0.1, 0.6], [0.9, 0.6]], "color": "#0000ff", "stroke": 0.01},
        {"kind": "image", "page": 0, "x": 0.1, "y": 0.8, "width": 0.2, "height": 0.1, "image": 0},
    ], images=[_png()])
    page = doc[0]
    # The white-out covers the page's text (still in the file, but hidden)
    assert min(_pixel(page, 0.15, 0.09)) > 245
    r, g, b = _pixel(page, 0.2, 0.325)
    assert r > 200 and g > 200 and b < 200  # see-through yellow
    r, g, b = _pixel(page, 0.5 + 0.002, 0.35)
    assert g > 200 and r < 80  # the rectangle's green edge
    assert min(_pixel(page, 0.65, 0.35)) > 245  # not filled
    r, g, b = _pixel(page, 0.5, 0.6)
    assert b > 200 and r < 80  # the blue line
    r, g, b = _pixel(page, 0.2, 0.85)
    assert r > 150 and g < 80  # the red image


def test_positions_follow_the_page_as_shown_on_rotated_pages(make_pdf):
    # A red box at the top-left of the page as it will be shown (turned a quarter)
    doc = _edit(make_pdf(pages=1).read_bytes(), [{"page": 0, "rotate": 90}], [
        {"kind": "highlight", "page": 0, "x": 0.0, "y": 0.0, "width": 0.2, "height": 0.2, "color": "#ff0000"},
    ])
    page = doc[0]
    assert page.rect.width > page.rect.height  # shown in landscape
    r, g, b = _pixel(page, 0.1, 0.1)
    assert r > 200 and g < 200
    assert min(_pixel(page, 0.9, 0.9)) > 245


# --- forms ---------------------------------------------------------------------------

def test_form_fields_are_filled_and_stay_fillable(tmp_path):
    doc = _edit(_form_pdf(tmp_path), [{"page": 0}],
                form={"name": "Jordan Avery", "agree": True, "color": "Blue", "unknown": "x"})
    values = _values(doc)
    assert values["name"] == "Jordan Avery"
    assert values["agree"] not in ("Off", "", None, False)
    assert values["color"] == "Blue"
    assert "Jordan Avery" in doc[0].get_text() or any(w.field_value == "Jordan Avery" for w in doc[0].widgets())


def test_form_choices_must_be_one_of_the_options(tmp_path):
    values = _values(_edit(_form_pdf(tmp_path), [{"page": 0}], form={"color": "Green", "agree": False}))
    assert values["color"] != "Green"
    assert values["agree"] in ("Off", "", None, False)


# --- validation ------------------------------------------------------------------------

@pytest.mark.parametrize("data,message", [
    ("not json", "couldn't be read"),
    ({"pages": []}, "at least one page"),
    ({"pages": [{"page": 5}]}, "doesn't exist"),
    ({"pages": [{"file": 3, "page": 0}]}, "wasn't uploaded"),
    ({"pages": [{"page": 0, "rotate": 45}]}, "quarter turns"),
    ({"pages": [{"page": 0}] * 1001}, "at most 1000 pages"),
    ({"pages": [{"page": 0}], "items": [{"kind": "video", "page": 0}]}, "isn't valid"),
    ({"pages": [{"page": 0}], "items": [{"kind": "rect", "page": 1, "x": 0, "y": 0, "width": .1, "height": .1}]},
     "doesn't exist"),
    ({"pages": [{"page": 0}], "items": [{"kind": "rect", "page": 0, "x": .95, "y": 0, "width": .1, "height": .1}]},
     "outside the page"),
    ({"pages": [{"page": 0}], "items": [{"kind": "image", "page": 0, "x": 0, "y": 0, "width": .1, "height": .1,
                                          "image": 2}]}, "image is missing"),
    ({"pages": [{"page": 0}], "items": [{"kind": "draw", "page": 0, "points": [[0, 0]]}]}, "drawing isn't valid"),
    ({"pages": [{"page": 0}], "items": [{"kind": "text", "page": 0, "x": 0, "y": 0, "width": .5, "height": .1,
                                          "text": "x" * 5001}]}, "at most 5000"),
])
def test_validation(data, message):
    raw = data if isinstance(data, str) else json.dumps(data)
    with pytest.raises(EditError, match=message):
        parse_request(raw, page_counts=[1], image_count=1)


def test_empty_text_boxes_are_skipped():
    _, items, _, _ = parse_request(json.dumps({"pages": [{"page": 0}], "items": [
        {"kind": "text", "page": 0, "x": 0, "y": 0, "width": .5, "height": .1, "text": "  "}]}), [1], 0)
    assert items == []


def test_damaged_and_locked_pdfs_are_refused(make_pdf, tmp_path):
    with pytest.raises(EditError, match="couldn't be read"):
        _edit(b"%PDF-broken", [{"page": 0}])
    locked = tmp_path / "locked.pdf"
    fitz.open(make_pdf()).save(locked, encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="o", user_pw="u")
    with pytest.raises(EditError, match="password-protected"):
        _edit(locked.read_bytes(), [{"page": 0}])
    with pytest.raises(EditError, match="PDF 2 couldn't be read"):
        _edit(make_pdf().read_bytes(), [{"page": 0}], extras=[b"nope"])


def test_bad_images_are_refused(make_pdf):
    with pytest.raises(EditError, match="image couldn't be read"):
        _edit(make_pdf().read_bytes(), [{"page": 0}], images=[b"not an image"])


# --- the route --------------------------------------------------------------------------

def _post(client, pdf_bytes, edits, extras=(), images=()):
    data = {"file": (io.BytesIO(pdf_bytes), "lease.pdf"), "edits": json.dumps(edits)}
    if extras:
        data["files"] = [(io.BytesIO(e), f"extra{i}.pdf") for i, e in enumerate(extras)]
    if images:
        data["images"] = [(io.BytesIO(img), f"img{i}.png") for i, img in enumerate(images)]
    return client.post("/editPdf", data=data, content_type="multipart/form-data")


def test_route_returns_the_edited_pdf(signup, make_pdf):
    other = make_pdf(pages=1, name="other.pdf", marker="Appendix").read_bytes()
    response = _post(signup(), make_pdf(pages=2).read_bytes(), {
        "pages": [{"page": 1}, {"file": 1, "page": 0}],
        "items": [{"kind": "text", "page": 0, "x": .1, "y": .5, "width": .5, "height": .05, "text": "Approved"},
                  {"kind": "image", "page": 1, "x": .1, "y": .5, "width": .2, "height": .1, "image": 0}],
    }, extras=[other], images=[_png()])
    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert "lease_edited.pdf" in response.headers["Content-Disposition"]
    doc = fitz.open(stream=response.data, filetype="pdf")
    assert doc.page_count == 2
    assert "Approved" in doc[0].get_text() and "page 2" in doc[0].get_text()
    assert "Appendix" in doc[1].get_text()


def test_guests_can_edit(client, make_pdf):
    assert _post(client, make_pdf().read_bytes(), {"pages": [{"page": 0}]}).status_code == 200


def test_route_reports_problems(signup, make_pdf):
    user = signup()
    bad = _post(user, make_pdf().read_bytes(), {"pages": [{"page": 9}]})
    assert bad.status_code == 400 and "doesn't exist" in bad.get_json()["error"]
    not_pdf = user.post("/editPdf", data={"file": (io.BytesIO(b"x"), "a.txt"), "edits": "{}"},
                        content_type="multipart/form-data")
    assert not_pdf.status_code == 400
    bad_extra = _post(user, make_pdf().read_bytes(), {"pages": [{"page": 0}]}, extras=[b"x"])
    assert bad_extra.status_code == 400


# --- Release A: editing existing text, redaction, shapes, marks, styles -----------------------

from edit_pdf_service import text_lines  # noqa: E402


def _letter(tmp_path, rotation=0):
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 100), "Monthly rent is $1,700", fontsize=12, fontname="tiro", color=(0.8, 0, 0))
    page.insert_text((72, 116), "Due on the first day", fontsize=12, fontname="hebo")
    page.insert_text((72, 300), "Account number 12345678", fontsize=11)
    page.set_rotation(rotation)
    path = tmp_path / f"letter{rotation}.pdf"
    doc.save(path)
    return path.read_bytes()


def test_text_lines_give_each_lines_place_and_style(tmp_path):
    [lines] = text_lines(_letter(tmp_path))
    rent, due, account = lines
    assert rent["text"] == "Monthly rent is $1,700"
    assert rent["font"] == "serif" and not rent["bold"] and rent["color"] == "#cc0000"
    assert due["font"] == "sans" and due["bold"]
    assert rent["font_size"] == pytest.approx(12 / 792, rel=0.01)
    assert rent["x"] == pytest.approx(72 / 612, abs=0.002)
    assert rent["y"] < due["y"] < account["y"]


def test_text_lines_on_a_turned_page_are_as_shown(tmp_path):
    [lines] = text_lines(_letter(tmp_path, rotation=90))
    # The text runs top to bottom when the page is turned: not editable as lines
    assert lines == []


def test_editing_a_line_replaces_it(tmp_path):
    [lines] = text_lines(_letter(tmp_path))
    rent = lines[0]
    box = {key: rent[key] for key in ("x", "y", "width", "height")}
    doc = _edit(_letter(tmp_path), [{"page": 0}], [
        {"kind": "erase", "page": 0, **box},
        {"kind": "text", "page": 0, **box, "width": 0.5, "height": rent["height"] * 1.4,
         "text": "Monthly rent is $1,850", "font_size": rent["font_size"], "font": "serif", "color": rent["color"]},
    ])
    text = doc[0].get_text()
    assert "$1,850" in text and "$1,700" not in text
    assert "Due on the first day" in text  # the next line is untouched


def test_redaction_removes_the_text_for_good(tmp_path):
    [lines] = text_lines(_letter(tmp_path))
    account = lines[2]
    doc = _edit(_letter(tmp_path), [{"page": 0}], [
        {"kind": "redact", "page": 0, **{key: account[key] for key in ("x", "y", "width", "height")}},
    ])
    page = doc[0]
    assert "12345678" not in page.get_text()
    assert page.search_for("12345678") == []
    assert "Monthly rent" in page.get_text()
    r, g, b = _pixel(page, account["x"] + account["width"] / 2, account["y"] + account["height"] / 2)
    assert max(r, g, b) < 40  # a black box


def test_text_styles_and_other_alphabets(make_pdf):
    doc = _edit(make_pdf(pages=1).read_bytes(), [{"page": 0}], [
        {"kind": "text", "page": 0, "x": 0.1, "y": 0.5, "width": 0.8, "height": 0.08, "text": "Signed 已付",
         "font": "serif", "italic": True, "underline": True, "align": "center", "font_size": 0.02},
    ])
    page = doc[0]
    assert "Signed" in page.get_text() and "已付" in page.get_text()
    fonts = " ".join(f[3] for f in page.get_fonts())
    assert "Italic" in fonts
    # Centered: the text starts well to the right of the box's left edge
    word = next(w for w in page.get_text("words") if w[4] == "Signed")
    assert word[0] > 0.25 * page.rect.width


def test_lines_arrows_ellipses_and_marks(make_pdf):
    doc = _edit(make_pdf(pages=1).read_bytes(), [{"page": 0}], [
        {"kind": "line", "page": 0, "points": [[0.1, 0.6], [0.5, 0.6]], "arrow": True, "color": "#0000ff",
         "stroke": 0.004},
        {"kind": "ellipse", "page": 0, "x": 0.6, "y": 0.55, "width": 0.3, "height": 0.1, "color": "#00ff00",
         "stroke": 0.006},
        {"kind": "mark", "page": 0, "mark": "check", "x": 0.1, "y": 0.8, "width": 0.05, "height": 0.04},
        {"kind": "mark", "page": 0, "mark": "dot", "x": 0.3, "y": 0.8, "width": 0.05, "height": 0.04,
         "color": "#ff0000"},
    ])
    page = doc[0]
    r, g, b = _pixel(page, 0.3, 0.6)
    assert b > 200 and r < 80  # the line
    r, g, b = _pixel(page, 0.75, 0.55 + 0.002)
    assert g > 150 and r < 120  # the top of the ellipse
    assert min(_pixel(page, 0.75, 0.6)) > 240  # not filled
    r, g, b = _pixel(page, 0.325, 0.82)
    assert r > 200 and g < 80  # the dot is filled
    assert len(page.get_drawings()) >= 4


@pytest.mark.parametrize("item,message", [
    ({"kind": "mark", "mark": "star", "x": 0, "y": 0, "width": .1, "height": .1}, "marks isn't valid"),
    ({"kind": "line", "points": [[0, 0], [1, 1], [0.5, 0.5]]}, "drawing isn't valid"),
    ({"kind": "redact", "x": 0.95, "y": 0, "width": .1, "height": .1}, "outside the page"),
])
def test_validation_of_the_new_kinds(item, message):
    with pytest.raises(EditError, match=message):
        parse_request(json.dumps({"pages": [{"page": 0}], "items": [{**item, "page": 0}]}), [1], 0)


def test_unknown_styles_fall_back_to_the_defaults():
    _, [item], _, _ = parse_request(json.dumps({"pages": [{"page": 0}], "items": [
        {"kind": "text", "page": 0, "x": 0, "y": 0, "width": .5, "height": .1, "text": "Hi", "font": "comic",
         "align": "justify"}]}), [1], 0)
    assert item["font"] == "sans" and item["align"] == "left"


def test_pdf_text_route(client, tmp_path):
    response = client.post("/pdfText", data={"file": (io.BytesIO(_letter(tmp_path)), "letter.pdf")},
                           content_type="multipart/form-data")
    assert response.status_code == 200
    [lines] = response.get_json()["pages"]
    assert [line["text"] for line in lines][0] == "Monthly rent is $1,700"
    bad = client.post("/pdfText", data={"file": (io.BytesIO(b"nope"), "x.pdf")}, content_type="multipart/form-data")
    assert bad.status_code == 400


# --- Release B: notes, watermark, page numbers, opening Word and images ----------------------

def _edit_with(pdf_bytes, page_count, options=None, items=()):
    return _edit(pdf_bytes, [{"page": i} for i in range(page_count)], items) if options is None else \
        fitz.open(stream=edit_pdf(pdf_bytes, [], json.dumps({"pages": [{"page": i} for i in range(page_count)],
                                                             "items": list(items), "options": options}), []),
                  filetype="pdf")


def test_sticky_notes_are_real_pdf_comments(make_pdf):
    doc = _edit(make_pdf(pages=1).read_bytes(), [{"page": 0}], [
        {"kind": "note", "page": 0, "x": 0.8, "y": 0.1, "width": 0.03, "height": 0.03, "text": "Check this clause",
         "color": "#2563eb"},
        {"kind": "note", "page": 0, "x": 0.8, "y": 0.3, "width": 0.03, "height": 0.03, "text": "   "},
    ])
    page = doc[0]
    [annot] = list(page.annots())
    assert annot.type[1] == "Text"
    assert annot.info["content"] == "Check this clause"


@pytest.mark.parametrize("rotation", [0, 90])
def test_watermark_on_every_page_upright_and_see_through(make_pdf, tmp_path, rotation):
    source = fitz.open(make_pdf(pages=2))
    for page in source:
        page.set_rotation(rotation)
    path = tmp_path / "rotated.pdf"
    source.save(path)
    doc = _edit_with(path.read_bytes(), 2, {"watermark": {"text": "CONFIDENTIAL", "color": "#ff0000", "opacity": 0.3}})
    for page in doc:
        [line] = [l for b in page.get_text("dict")["blocks"] for l in b.get("lines", [])
                  if "CONFIDENTIAL" in "".join(s["text"] for s in l["spans"])]
        turn = page.rotation_matrix
        direction = fitz.Point(line["dir"]) * fitz.Matrix(turn.a, turn.b, turn.c, turn.d, 0, 0)
        assert direction.x > 0.3 and direction.y < -0.3  # rising left to right, as shown
        box = fitz.Rect(line["bbox"]) * page.rotation_matrix
        center = fitz.Point(box.x0 + box.width / 2, box.y0 + box.height / 2)
        assert abs(center.x - page.rect.width / 2) < 20 and abs(center.y - page.rect.height / 2) < 20
    # See-through: the red is pale, not solid
    pixmap = doc[0].get_pixmap()
    reds = [pixmap.pixel(x, y)[:3] for x in range(0, pixmap.width, 3) for y in range(0, pixmap.height, 3)]
    tinted = [p for p in reds if p[0] > 200 and p[1] < 240]
    assert tinted and all(p[1] > 120 for p in tinted)


def test_page_numbers(make_pdf):
    doc = _edit_with(make_pdf(pages=3).read_bytes(), 3, {"page_numbers": {
        "format": "page_n_of", "position": "bottom-right", "start": 1, "skip_first": True}})
    assert "Page" not in doc[0].get_text()
    assert "Page 1 of 2" in doc[1].get_text() and "Page 2 of 2" in doc[2].get_text()
    word = next(w for w in doc[2].get_text("words") if w[4] == "2" and w[1] > doc[2].rect.height * 0.8)
    assert word[0] > doc[2].rect.width * 0.7  # bottom right


def test_page_numbers_can_start_later_and_sit_at_the_top(make_pdf):
    doc = _edit_with(make_pdf(pages=2).read_bytes(), 2, {"page_numbers": {
        "format": "n", "position": "top-center", "start": 5}})
    words = [w for w in doc[1].get_text("words") if w[4] == "6"]
    assert words and words[0][1] < doc[1].rect.height * 0.1


def test_options_are_checked():
    _, _, _, options = parse_request(json.dumps({"pages": [{"page": 0}], "options": {
        "watermark": {"text": "  ", "opacity": 7}, "page_numbers": {"format": "roman", "position": "middle",
                                                                      "start": -4, "size": 500}}}), [1], 0)
    assert "watermark" not in options  # no text, no watermark
    assert options["page_numbers"] == {"format": "n", "position": "bottom-center", "start": 1, "skip_first": False,
                                       "size": 36}


def test_images_become_pdf_pages(tmp_path):
    from edit_pdf_service import images_to_pdf
    buffer = io.BytesIO()
    image = Image.new("RGB", (400, 200), (0, 0, 255))
    exif = image.getexif()
    exif[0x0112] = 6  # a phone photo taken sideways
    image.save(buffer, "JPEG", exif=exif)
    doc = fitz.open(stream=images_to_pdf(buffer.getvalue()), filetype="pdf")
    page = doc[0]
    assert page.rect.width == 612
    assert page.rect.height == pytest.approx(612 * 400 / 200)  # turned the right way up: taller than wide
    with pytest.raises(EditError, match="couldn't be read as an image"):
        images_to_pdf(b"not an image", "photo.jpg")


def test_to_pdf_route(client, monkeypatch):
    import flask_demo

    response = client.post("/toPdf", data={"file": (io.BytesIO(_png()), "receipt.png")},
                           content_type="multipart/form-data")
    assert response.status_code == 200 and response.mimetype == "application/pdf"
    assert fitz.open(stream=response.data, filetype="pdf").page_count == 1

    def fake_convert(input_path, output_path):
        doc = fitz.open()
        doc.new_page().insert_text((72, 72), "From Word")
        doc.save(output_path)
    monkeypatch.setattr(flask_demo.converter, "convert_docx_to_pdf", fake_convert)
    import zipfile as zf
    docx = io.BytesIO()
    with zf.ZipFile(docx, "w") as archive:
        archive.writestr("word/document.xml", "<w/>")
    response = client.post("/toPdf", data={"file": (io.BytesIO(docx.getvalue()), "letter.docx")},
                           content_type="multipart/form-data")
    assert response.status_code == 200
    assert "From Word" in fitz.open(stream=response.data, filetype="pdf")[0].get_text()

    for name, data in (("notes.txt", b"hello"), ("fake.docx", b"not a zip"), ("bad.png", b"nope")):
        bad = client.post("/toPdf", data={"file": (io.BytesIO(data), name)}, content_type="multipart/form-data")
        assert bad.status_code == 400, name
