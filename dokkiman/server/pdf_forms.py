"""
Shared handling of PDF forms.

Some fillable PDFs (IRS and many government forms) carry a second, Adobe-only
copy of the form (XFA) next to the standard one. Adobe Acrobat and Reader use
the XFA copy, which refers to fields and pages by name. Once we move pages or
fill fields, that copy is out of date: Adobe shows "Malformed SOM expression"
or the old values. Removing it makes Adobe use the standard form, which is
kept up to date and works in every viewer.
"""


def remove_xfa(document):
    """Drop the Adobe-only XFA form, keeping the standard form fields."""
    catalog = document.pdf_catalog()
    kind, value = document.xref_get_key(catalog, "AcroForm")
    if kind == "xref":
        form = int(value.split()[0])
        if document.xref_get_key(form, "XFA")[0] != "null":
            document.xref_set_key(form, "XFA", "null")
    elif kind == "dict" and document.xref_get_key(catalog, "AcroForm/XFA")[0] != "null":
        document.xref_set_key(catalog, "AcroForm/XFA", "null")
