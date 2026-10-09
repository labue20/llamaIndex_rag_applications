/**
 * Edit PDF
 * Change the PDF's own text, add text, signatures, images, shapes, marks,
 * notes, highlights, drawings, white-out and redactions, fill in its form
 * fields, add a watermark and page numbers, and organize pages (reorder,
 * turn, copy, remove, add blank pages, combine files). Word documents and
 * images open too (made into PDFs by /toPdf). The server makes the new PDF
 * (/editPdf); the text lines to edit come from /pdfText. Afterwards the result
 * can be saved to the Document Manager or sent for signature. While a
 * document is open, the editor fills the window (like a desktop PDF editor).
 */

import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist/webpack';
import {
  apiFetch, dataUrlToBlob, DocumentPicker, downloadBlob, filenameFromDisposition, Icon, readApiError,
} from '../../../shared';
import SignatureDialog from '../../sign-pdf/components/SignatureDialog';
import {
  buildEdits, clamp, DEFAULT_COLORS, DEFAULT_OPTIONS, MARKS, MAX_FILES, newKey, pageNumberLabel, POINTS_PER_PAGE,
  rotateBy, SHAPES, shownSize, STROKES, textItemForLine, TOOLS,
} from '../editModel';
import DocumentOptions from './DocumentOptions';
import PageEditor from './PageEditor';
import PageStrip from './PageStrip';
import StyleBar from './StyleBar';
import '../../../shared/styles/converter.scss';
import '../../sign-pdf/styles/sign-pdf.scss';
import '../styles/edit-pdf.scss';

const isPdf = (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
const isImage = (file) => /^image\/(png|jpeg)$/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
// Opened by making them into PDFs first
const CONVERTIBLE = /\.(docx|png|jpe?g|webp)$/i;
const OPENS = '.pdf,.docx,.png,.jpg,.jpeg,.webp';

/** A PDF, or a Word document or image turned into one by the server. */
const asPdf = async (file) => {
  if (isPdf(file)) return file;
  if (!CONVERTIBLE.test(file.name)) {
    throw new Error('Open a PDF, a Word document (.docx) or an image (PNG or JPEG).');
  }
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiFetch('/toPdf', { method: 'POST', body: formData });
  if (!response.ok) throw new Error(await readApiError(response, `${file.name} couldn’t be opened.`));
  const blob = await response.blob();
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.pdf`, { type: 'application/pdf' });
};
const HISTORY = 50;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
let nextItemId = 1;
let nextImageId = 1;

const readImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('That image couldn’t be read.'));
  reader.onload = () => {
    const dataUrl = reader.result;
    const img = new Image();
    let done = false;
    const finish = (aspect) => {
      if (!done) {
        done = true;
        resolve({ file, dataUrl, aspect });
      }
    };
    img.onload = () => finish(img.naturalHeight / (img.naturalWidth || 1) || 1);
    img.onerror = () => finish(1);
    setTimeout(() => finish(1), 1500);
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
});

// File.arrayBuffer(), with a fallback for older browsers
const bytesOf = (file) => (file.arrayBuffer ? file.arrayBuffer() : new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsArrayBuffer(file);
}));

const loadPdf = async (file, fileIndex) => {
  const doc = await pdfjsLib.getDocument({ data: await bytesOf(file) }).promise;
  const pages = [];
  for (let i = 0; i < doc.numPages; i += 1) {
    const page = await doc.getPage(i + 1);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ key: newKey(), file: fileIndex, page: i, rotate: 0, width: viewport.width, height: viewport.height });
  }
  return { doc, pages };
};

// What each tool adds, for its color and style
const kindOfTool = (tool, shapeId) => {
  if (tool === 'shapes') return SHAPES.find((s) => s.id === shapeId).kind;
  if (tool === 'marks') return 'mark';
  if (tool === 'sign') return null;
  return ['text', 'highlight', 'draw'].includes(tool) ? tool : null;
};

const EditPdf = forwardRef(({
  onStatusChange, allowDocumentManager = true, onSaveToDocuments, onSendForSignature,
}, ref) => {
  const [files, setFiles] = useState([]); // File objects: [0] the main PDF, then PDFs added
  const [docs, setDocs] = useState([]); // pdf.js documents, same order
  const [pages, setPages] = useState([]);
  const [items, setItems] = useState([]);
  const [images, setImages] = useState({}); // imageId -> { file?, dataUrl, aspect }
  const [formValues, setFormValues] = useState({});
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [currentKey, setCurrentKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState('select');
  const [shapeId, setShapeId] = useState('rect');
  const [markId, setMarkId] = useState('check');
  const [styles, setStyles] = useState({
    text: { color: DEFAULT_COLORS.text, font: 'sans', font_size: 12 / POINTS_PER_PAGE, bold: false, italic: false,
      underline: false, align: 'left' },
    stroke: STROKES[1].value,
    colors: DEFAULT_COLORS,
  });
  const [textLines, setTextLines] = useState({}); // file index -> { status, pages }
  const [signImages, setSignImages] = useState({}); // signature / initials -> imageId
  const [signDialog, setSignDialog] = useState(null); // { kind, place }
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [saved, setSaved] = useState(null); // the last saved PDF: { file, inDocuments }
  const [doneOpen, setDoneOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false); // the Watermark and Page numbers panel
  const [zoom, setZoom] = useState(null); // null: fit the page to the screen's width
  const [shownScale, setShownScale] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const doneRef = useRef(null);

  const file = files[0] || null;
  const currentPage = pages.find((p) => p.key === currentKey) || pages[0];
  const selected = items.find((i) => i.id === selectedId) || null;

  // --- loading -------------------------------------------------------------------------
  const reset = useCallback(() => {
    docs.forEach((d) => d?.destroy?.());
    setFiles([]);
    setDocs([]);
    setPages([]);
    setItems([]);
    setImages({});
    setFormValues({});
    setHistory([]);
    setFuture([]);
    setCurrentKey(null);
    setSelectedId(null);
    setTool('select');
    setTextLines({});
    setSignImages({});
    setOptions(DEFAULT_OPTIONS);
    setSaved(null);
    setDoneOpen(false);
    setShowSetup(false);
    setZoom(null);
    setError('');
    setResult('');
  }, [docs]);

  // Open one file, or several combined (Merge PDF)
  const loadFiles = useCallback(async (selectedFiles) => {
    reset();
    if (selectedFiles.length > MAX_FILES) {
      setError(`Combine at most ${MAX_FILES} files at once.`);
      return;
    }
    setIsLoading(true);
    const pdfFiles = [];
    try {
      for (const selected of selectedFiles) pdfFiles.push(await asPdf(selected));
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
      return;
    }
    try {
      const loaded = [];
      for (const [index, pdfFile] of pdfFiles.entries()) loaded.push(await loadPdf(pdfFile, index));
      const allPages = loaded.flatMap((l) => l.pages);
      setFiles(pdfFiles);
      setDocs(loaded.map((l) => l.doc));
      setPages(allPages);
      setCurrentKey(allPages[0]?.key ?? null);
    } catch (err) {
      console.error('Could not open PDF:', err);
      setError(pdfFiles.length > 1
        ? 'One of those files couldn’t be opened. It may be damaged or password-protected.'
        : 'This PDF couldn’t be opened. It may be damaged or password-protected.');
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  const loadFile = useCallback((selectedFile) => loadFiles([selectedFile]), [loadFiles]);

  useImperativeHandle(ref, () => ({ selectFile: loadFile, openFiles: loadFiles, reset }));

  useEffect(() => {
    onStatusChange?.({ hasFile: !!file, isBusy: isSaving || isLoading });
  }, [onStatusChange, file, isSaving, isLoading]);

  // --- undo and redo -----------------------------------------------------------------------
  const snapshot = useCallback(() => ({ pages, items, formValues }), [pages, items, formValues]);

  const remember = useCallback(() => {
    setHistory((prev) => [...prev.slice(-(HISTORY - 1)), snapshot()]);
    setFuture([]);
    setResult('');
    setSaved(null); // changed since the last save
  }, [snapshot]);

  const restore = useCallback((state) => {
    setPages(state.pages);
    setItems(state.items);
    setFormValues(state.formValues);
    setSelectedId(null);
    if (!state.pages.some((p) => p.key === currentKey)) setCurrentKey(state.pages[0]?.key ?? null);
  }, [currentKey]);

  const undo = useCallback(() => {
    if (!history.length) return;
    setFuture((prev) => [snapshot(), ...prev]);
    restore(history[history.length - 1]);
    setHistory((prev) => prev.slice(0, -1));
  }, [history, snapshot, restore]);

  const redo = useCallback(() => {
    if (!future.length) return;
    setHistory((prev) => [...prev, snapshot()]);
    restore(future[0]);
    setFuture((prev) => prev.slice(1));
  }, [future, snapshot, restore]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if (!(e.metaKey || e.ctrlKey) || typing || !file) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, file]);

  // --- pages ---------------------------------------------------------------------------
  const movePage = (key, toIndex) => {
    remember();
    setPages((prev) => {
      const from = prev.findIndex((p) => p.key === key);
      if (from < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(clamp(toIndex, 0, next.length), 0, moved);
      return next;
    });
  };

  const rotatePage = (key) => {
    remember();
    setPages((prev) => prev.map((p) => (p.key === key ? { ...p, rotate: rotateBy(p.rotate, 90) } : p)));
  };

  const duplicatePage = (key) => {
    remember();
    const copyKey = newKey();
    setPages((prev) => {
      const index = prev.findIndex((p) => p.key === key);
      const next = [...prev];
      next.splice(index + 1, 0, { ...prev[index], key: copyKey });
      return next;
    });
    // What was added to the page comes along to the copy
    setItems((prev) => [...prev, ...prev.filter((i) => i.pageKey === key)
      .map((i) => ({ ...i, id: nextItemId++, pageKey: copyKey, lineKey: i.lineKey?.replace(key, copyKey) }))]);
    setCurrentKey(copyKey);
  };

  const deletePage = (key) => {
    if (pages.length <= 1) return;
    remember();
    const index = pages.findIndex((p) => p.key === key);
    const rest = pages.filter((p) => p.key !== key);
    setPages(rest);
    setItems((prev) => prev.filter((i) => i.pageKey !== key));
    if (key === currentPage?.key) setCurrentKey(rest[Math.min(index, rest.length - 1)].key);
  };

  const addBlank = () => {
    remember();
    const like = currentPage || pages[pages.length - 1];
    const size = shownSize(like);
    const blank = { key: newKey(), blank: true, file: null, page: null, rotate: 0, width: size.width, height: size.height };
    setPages((prev) => {
      const index = prev.findIndex((p) => p.key === like.key);
      const next = [...prev];
      next.splice(index + 1, 0, blank);
      return next;
    });
    setCurrentKey(blank.key);
  };

  const addPdfs = async (newFiles) => {
    if (files.length + newFiles.length > MAX_FILES) {
      setError(`Combine at most ${MAX_FILES} files at once.`);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      let index = files.length;
      const loaded = [];
      for (const added of newFiles) {
        const pdf = await asPdf(added);
        loaded.push({ file: pdf, ...(await loadPdf(pdf, index)) });
        index += 1;
      }
      remember();
      setFiles((prev) => [...prev, ...loaded.map((l) => l.file)]);
      setDocs((prev) => [...prev, ...loaded.map((l) => l.doc)]);
      setPages((prev) => [...prev, ...loaded.flatMap((l) => l.pages)]);
      if (loaded[0]?.pages[0]) setCurrentKey(loaded[0].pages[0].key);
    } catch (err) {
      console.error('Could not add file:', err);
      setError(/couldn’t be opened|Open a PDF/.test(err.message)
        ? err.message : 'One of those files couldn’t be opened. It may be damaged or password-protected.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- the PDF's own text (Edit text) --------------------------------------------------------
  const textFile = tool === 'edittext' && currentPage && !currentPage.blank ? currentPage.file : null;
  useEffect(() => {
    if (textFile === null || textLines[textFile]) return;
    setTextLines((prev) => ({ ...prev, [textFile]: { status: 'loading' } }));
    (async () => {
      try {
        const formData = new FormData();
        formData.append('file', files[textFile]);
        const response = await apiFetch('/pdfText', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(await readApiError(response, 'The text in this PDF couldn’t be read.'));
        const data = await response.json();
        setTextLines((prev) => ({ ...prev, [textFile]: { status: 'ready', pages: data.pages } }));
      } catch (err) {
        setTextLines((prev) => ({ ...prev, [textFile]: { status: 'error', message: err.message } }));
      }
    })();
  }, [textFile, textLines, files]);

  const linesInfo = textFile === null ? null : textLines[textFile];
  const pageLines = linesInfo?.status === 'ready' && currentPage?.rotate === 0
    ? linesInfo.pages[currentPage.page] || [] : null;
  let editTextHint = null;
  if (tool === 'edittext') {
    if (!currentPage || currentPage.blank) editTextHint = 'A blank page has no text to change. Use Add text.';
    else if (currentPage.rotate) editTextHint = 'Turn this page back to change its text (or change it, then turn it).';
    else if (!linesInfo || linesInfo.status === 'loading') editTextHint = 'Finding the text on this page…';
    else if (linesInfo.status === 'error') editTextHint = linesInfo.message;
    else if (pageLines && pageLines.length === 0) {
      editTextHint = 'No text found on this page. If it’s a scan, use White-out and Add text instead.';
    }
  }

  const editLine = (line, lineKey) => {
    remember();
    const item = { id: nextItemId++, pageKey: currentPage.key, ...textItemForLine(line, lineKey) };
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
  };

  // --- things on pages --------------------------------------------------------------------
  const styleFor = (kind) => {
    if (kind === 'text') return { ...styles.text };
    if (kind === 'whiteout' || kind === 'redact' || kind === 'image') return {};
    return {
      color: styles.colors[kind],
      ...(['rect', 'ellipse', 'line', 'draw'].includes(kind) ? { stroke: styles.stroke } : {}),
    };
  };

  const createItem = (spec) => {
    remember();
    const item = { id: nextItemId++, pageKey: currentPage.key, ...styleFor(spec.kind), ...spec };
    if (item.kind === 'text' && item.text === undefined) item.text = '';
    setItems((prev) => [...prev, item]);
    // Text, notes and images are adjusted straight away; with the other
    // tools, the next drag on the page adds another one
    if (['text', 'image', 'note'].includes(item.kind)) setSelectedId(item.id);
    // After placing a text box or note, type into it
    if (item.kind === 'text' || item.kind === 'note') setTool('select');
    return item;
  };

  const changeItem = (id, changes) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));

  const removeItem = (id) => {
    remember();
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedId(null);
  };

  const placeImage = (imageId, image, width = 0.3) => {
    const size = shownSize(currentPage);
    const height = clamp((width * image.aspect * size.width) / size.height, 0.02, 0.8);
    createItem({ kind: 'image', imageId, x: clamp(0.5 - width / 2, 0, 1 - width), y: clamp(0.5 - height / 2, 0, 1 - height), width, height });
  };

  const addImage = async (imageFile) => {
    if (!isImage(imageFile)) {
      setError('Images must be PNG or JPEG.');
      return;
    }
    if (imageFile.size > 5 * 1024 * 1024) {
      setError('Images can be 5 MB at most.');
      return;
    }
    try {
      const image = await readImage(imageFile);
      const imageId = `img-${nextImageId++}`;
      setImages((prev) => ({ ...prev, [imageId]: image }));
      placeImage(imageId, image);
      setTool('select');
    } catch (err) {
      setError(err.message);
    }
  };

  // Sign: a signature or initials (made once, then reused), or today's date
  const sign = (kind) => {
    if (kind === 'date') {
      createItem({ kind: 'text', text: new Date().toLocaleDateString(), x: 0.4, y: 0.6, width: 0.2, height: 0.03 });
      return;
    }
    const imageId = signImages[kind];
    if (imageId) placeImage(imageId, images[imageId], kind === 'initials' ? 0.12 : 0.3);
    else setSignDialog({ kind, place: true });
  };

  const signatureDone = (image) => {
    const { kind, place } = signDialog;
    const imageId = `${kind}-${nextImageId++}`;
    setImages((prev) => ({ ...prev, [imageId]: image }));
    setSignDialog(null);
    // A new signature replaces the old one everywhere it was placed
    const previous = signImages[kind];
    setSignImages((prev) => ({ ...prev, [kind]: imageId }));
    if (previous) setItems((prev) => prev.map((i) => (i.imageId === previous ? { ...i, imageId } : i)));
    if (place) placeImage(imageId, image, kind === 'initials' ? 0.12 : 0.3);
  };

  // The style controls change the selected item, or what the tool adds next
  const styleKind = selected ? selected.kind : kindOfTool(tool, shapeId);
  const currentStyle = selected || (styleKind === 'text' ? styles.text : {
    color: styles.colors[styleKind], stroke: styles.stroke,
  });
  const setStyle = (changes) => {
    if (selected) {
      remember();
      changeItem(selected.id, changes);
    }
    setStyles((prev) => {
      if (styleKind === 'text') return { ...prev, text: { ...prev.text, ...changes } };
      return {
        ...prev,
        ...(changes.stroke ? { stroke: changes.stroke } : {}),
        colors: changes.color ? { ...prev.colors, [styleKind]: changes.color } : prev.colors,
      };
    });
  };

  const setFormValue = (name, value) => {
    remember();
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const itemCounts = useMemo(() => items.reduce((counts, item) => ({
    ...counts, [item.pageKey]: (counts[item.pageKey] || 0) + 1,
  }), {}), [items]);

  // --- finishing (Done) ---------------------------------------------------------------------
  // The server makes the PDF once per version of the edits; Download, Save to
  // Document Manager and Send for signature all use that copy
  const makePdf = async () => {
    if (saved) return saved.file;
    const usedImages = [...new Set(items.filter((i) => i.kind === 'image' && pages.some((p) => p.key === i.pageKey))
      .map((i) => i.imageId))];
    const edits = buildEdits(pages, items, formValues, (id) => usedImages.indexOf(id), options);
    const formData = new FormData();
    formData.append('file', file);
    files.slice(1).forEach((extra) => formData.append('files', extra));
    usedImages.forEach((id) => {
      const image = images[id];
      if (image.file) formData.append('images', image.file);
      else formData.append('images', dataUrlToBlob(image.dataUrl), `${id}.png`);
    });
    formData.append('edits', JSON.stringify(edits));

    const response = await apiFetch('/editPdf', { method: 'POST', body: formData });
    if (!response.ok) throw new Error(await readApiError(response, 'The PDF could not be saved.'));
    const blob = await response.blob();
    const fileName = filenameFromDisposition(
      response.headers.get('Content-Disposition'),
      `${file.name.replace(/\.pdf$/i, '')}_edited.pdf`
    );
    const made = new File([blob], fileName, { type: 'application/pdf' });
    setSaved({ file: made, inDocuments: false });
    return made;
  };

  const finish = async (action) => {
    if (!file) return;
    setDoneOpen(false);
    setIsSaving(true);
    setError('');
    setResult('');
    try {
      const made = await makePdf();
      if (action === 'download') {
        downloadBlob(made, made.name);
        setResult(`Downloaded ${made.name}.`);
      } else if (action === 'documents') {
        await onSaveToDocuments(made);
        setSaved({ file: made, inDocuments: true });
        setResult(`Saved ${made.name} to your Document Manager.`);
      } else if (action === 'sign') {
        onSendForSignature(made);
      }
    } catch (err) {
      console.error('Edit failed:', err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Close the Done menu on a click elsewhere or Escape
  useEffect(() => {
    if (!doneOpen) return undefined;
    const onPointer = (e) => {
      if (!doneRef.current?.contains(e.target)) setDoneOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setDoneOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [doneOpen]);

  const closeEditor = () => {
    if (history.length && !saved && !window.confirm('Close without saving? Your changes will be lost.')) return;
    reset();
  };

  // --- page and zoom ---------------------------------------------------------------------------
  const goToPage = (index) => {
    const target = pages[clamp(index, 0, pages.length - 1)];
    if (target) {
      setCurrentKey(target.key);
      setSelectedId(null);
    }
  };
  const zoomBy = (direction) => {
    const next = direction > 0
      ? ZOOMS.find((z) => z > shownScale + 0.01)
      : [...ZOOMS].reverse().find((z) => z < shownScale - 0.01);
    if (next) setZoom(next);
  };

  // Watermark and Page numbers: turn it on and show its settings
  const openSetup = (option) => {
    setShowSetup(true);
    if (!options[option].enabled) changeOptions({ [option]: { ...options[option], enabled: true } });
  };
  const changeOptions = (changes) => {
    setOptions((prev) => ({ ...prev, ...changes }));
    setResult('');
    setSaved(null);
  };

  // --- screen --------------------------------------------------------------------------------
  if (!file) {
    return (
      <div className='file-converter edit-pdf'>
        <div className='file-input-section'>
          <div className='upload-area'>
            <input
              type='file'
              accept={OPENS}
              id='edit-pdf-file-input'
              onChange={(e) => {
                const picked = e.target.files[0];
                e.target.value = '';
                if (picked) loadFile(picked);
              }}
            />
            <div className='upload-actions'>
              <label htmlFor='edit-pdf-file-input' className='upload-label'>Choose File</label>
              {allowDocumentManager && (
                <DocumentPicker acceptedExtensions={['.pdf', '.docx']} onSelect={(picked) => picked && loadFile(picked)} />
              )}
            </div>
            <p className='upload-hint'>
              PDF, Word or image. Change text, add text, signatures and shapes, fill in forms, redact, add page
              numbers, and reorder or combine pages • Max 50MB
            </p>
          </div>
        </div>
        {isLoading && <p className='edit-pdf__loading'>Opening…</p>}
        {error && (
          <div className='converter-message converter-message--error' role='alert'>
            <Icon name='alert' size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  const pageIndex = pages.findIndex((p) => p.key === currentPage?.key);
  const busy = isSaving || isLoading;

  // While a document is open, the editor fills the window
  return (
    <div className='file-converter edit-pdf edit-pdf--fullscreen' role='region' aria-label='PDF editor'>
      <header className='edit-pdf__topbar'>
        <button type='button' className='edit-pdf__icon-btn' aria-label='Close editor' title='Close' onClick={closeEditor}
          disabled={isSaving}>
          <Icon name='close' size={20} />
        </button>
        <div className='edit-pdf__title'>
          <span className='edit-pdf__file-name' title={file.name}>{file.name}</span>
          <span className='edit-pdf__file-meta'>
            {pages.length} {pages.length === 1 ? 'page' : 'pages'}
            {files.length > 1 ? ` · ${files.length} files combined` : ''}
          </span>
        </div>
        <div className='edit-pdf__topbar-actions'>
          <button type='button' className='edit-pdf__icon-btn' aria-label='Undo' title='Undo (Ctrl+Z)' onClick={undo}
            disabled={!history.length || isSaving}>
            <Icon name='undo' size={18} />
          </button>
          <button type='button' className='edit-pdf__icon-btn' aria-label='Redo' title='Redo (Ctrl+Shift+Z)' onClick={redo}
            disabled={!future.length || isSaving}>
            <Icon name='redo' size={18} />
          </button>
          <div className='edit-pdf__done' ref={doneRef}>
            <button type='button' className='edit-pdf__done-btn' aria-haspopup='menu' aria-expanded={doneOpen}
              onClick={() => setDoneOpen((open) => !open)} disabled={busy}>
              {isSaving ? <span className='btn-spinner' aria-hidden='true' /> : <Icon name='check' size={18} />}
              {isSaving ? 'Saving…' : 'Done'}
              <Icon name='chevronDown' size={16} />
            </button>
            {doneOpen && (
              <div className='edit-pdf__done-menu' role='menu' aria-label='Done'>
                <button type='button' role='menuitem' onClick={() => finish('download')}>
                  <Icon name='download' size={18} />
                  <span><strong>Download</strong><small>Save the PDF to this device</small></span>
                </button>
                {onSendForSignature ? (
                  <>
                    <button type='button' role='menuitem' onClick={() => finish('sign')}>
                      <Icon name='pen' size={18} />
                      <span><strong>Send for signature</strong><small>Email it to others to sign</small></span>
                    </button>
                    <button type='button' role='menuitem' onClick={() => finish('documents')}
                      disabled={!!saved?.inDocuments}>
                      <Icon name='folder' size={18} />
                      <span>
                        <strong>{saved?.inDocuments ? 'Saved to Document Manager' : 'Save to Document Manager'}</strong>
                        <small>Keep it in your account</small>
                      </span>
                    </button>
                  </>
                ) : (
                  <p className='edit-pdf__done-note'>
                    Create a free account to keep your PDFs or send them for signature.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className='edit-pdf__toolbar' role='toolbar' aria-label='Edit tools'>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type='button'
            className={`edit-pdf__tool ${tool === t.id ? 'edit-pdf__tool--active' : ''}`}
            aria-pressed={tool === t.id}
            onClick={() => {
              setTool(t.id);
              setSelectedId(null);
            }}
            disabled={isSaving}
          >
            <Icon name={t.icon} size={18} />
            <span className='edit-pdf__tool-label'>{t.label}</span>
          </button>
        ))}
        <label className='edit-pdf__tool'>
          <Icon name='image' size={18} />
          <span className='edit-pdf__tool-label'>Image</span>
          <input
            type='file'
            accept='image/png,image/jpeg'
            hidden
            aria-label='Add an image'
            onChange={(e) => {
              const picked = e.target.files[0];
              e.target.value = '';
              if (picked) addImage(picked);
            }}
          />
        </label>
        <span className='edit-pdf__toolbar-divider' aria-hidden='true' />
        <button type='button' className={`edit-pdf__tool ${options.watermark.enabled ? 'edit-pdf__tool--on' : ''}`}
          onClick={() => openSetup('watermark')} disabled={isSaving}>
          <Icon name='layers' size={18} />
          <span className='edit-pdf__tool-label'>Watermark</span>
        </button>
        <button type='button' className={`edit-pdf__tool ${options.page_numbers.enabled ? 'edit-pdf__tool--on' : ''}`}
          onClick={() => openSetup('page_numbers')} disabled={isSaving}>
          <Icon name='sliders' size={18} />
          <span className='edit-pdf__tool-label'>Page numbers</span>
        </button>
      </div>

      <StyleBar
        tool={tool}
        selected={selected}
        styleKind={styleKind}
        style={currentStyle}
        onStyle={setStyle}
        shapeId={shapeId}
        onShape={setShapeId}
        markId={markId}
        onMark={setMarkId}
        onSign={sign}
        hasSignature={!!signImages.signature}
        hasInitials={!!signImages.initials}
        onChangeSignature={(kind) => setSignDialog({ kind, place: false })}
        hint={editTextHint}
      />

      <div className={`edit-pdf__main ${showSetup ? 'edit-pdf__main--setup' : ''}`}>
        <PageStrip
          pages={pages}
          docs={docs}
          currentKey={currentPage?.key}
          itemCounts={itemCounts}
          disabled={busy}
          onSelect={(key) => {
            setCurrentKey(key);
            setSelectedId(null);
          }}
          onMove={movePage}
          onRotate={rotatePage}
          onDuplicate={duplicatePage}
          onDelete={deletePage}
          onAddBlank={addBlank}
          onAddPdf={addPdfs}
        />

        <div className='edit-pdf__canvas-area'>
          {(error || result) && (
            <div className='edit-pdf__messages'>
              {error && (
                <div className='converter-message converter-message--error' role='alert'>
                  <Icon name='alert' size={16} />
                  <span>{error}</span>
                  <button type='button' className='edit-pdf__dismiss' aria-label='Dismiss' onClick={() => setError('')}>
                    <Icon name='close' size={14} />
                  </button>
                </div>
              )}
              {result && !error && (
                <div className='converter-message converter-message--success' role='status'>
                  <Icon name='checkCircle' size={16} />
                  <span>{result}</span>
                  <button type='button' className='edit-pdf__dismiss' aria-label='Dismiss' onClick={() => setResult('')}>
                    <Icon name='close' size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {currentPage && (
            <PageEditor
              key={currentPage.key}
              page={currentPage}
              pdf={currentPage.blank ? null : docs[currentPage.file]}
              items={items.filter((i) => i.pageKey === currentPage.key)}
              images={images}
              tool={tool}
              shape={SHAPES.find((s) => s.id === shapeId)}
              mark={MARKS.find((m) => m.id === markId)}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCreate={createItem}
              onChange={changeItem}
              onBeginChange={remember}
              onRemove={removeItem}
              formValues={formValues}
              onFormChange={setFormValue}
              pageLabel={`Page ${pageIndex + 1} of ${pages.length}`}
              lines={pageLines}
              onEditLine={editLine}
              watermark={options.watermark.enabled && options.watermark.text.trim() ? options.watermark : null}
              pageNumber={(() => {
                const label = pageNumberLabel(options.page_numbers, pageIndex, pages.length);
                return label && { ...options.page_numbers, label };
              })()}
              zoom={zoom}
              onScale={setShownScale}
            />
          )}

          {/* Floating: move between pages and zoom */}
          <div className='edit-pdf__nav' role='group' aria-label='Page and zoom'>
            <button type='button' aria-label='Previous page' onClick={() => goToPage(pageIndex - 1)}
              disabled={pageIndex <= 0}>
              <Icon name='chevronLeft' size={16} />
            </button>
            <span className='edit-pdf__nav-value'>{pageIndex + 1} / {pages.length}</span>
            <button type='button' aria-label='Next page' onClick={() => goToPage(pageIndex + 1)}
              disabled={pageIndex >= pages.length - 1}>
              <Icon name='chevronRight' size={16} />
            </button>
            <span className='edit-pdf__nav-divider' aria-hidden='true' />
            <button type='button' aria-label='Zoom out' onClick={() => zoomBy(-1)} disabled={shownScale <= ZOOMS[0] + 0.01}>
              <Icon name='minus' size={16} />
            </button>
            <span className='edit-pdf__nav-value' aria-label='Zoom'>{Math.round(shownScale * 100)}%</span>
            <button type='button' aria-label='Zoom in' onClick={() => zoomBy(1)}
              disabled={shownScale >= ZOOMS[ZOOMS.length - 1] - 0.01}>
              <Icon name='plus' size={16} />
            </button>
            <button type='button' className='edit-pdf__nav-fit' aria-label='Fit to width' aria-pressed={zoom === null}
              onClick={() => setZoom(null)}>
              <Icon name='fit' size={16} />
              <span>Fit</span>
            </button>
          </div>
        </div>

        {showSetup && (
          <aside className='edit-pdf__setup' aria-label='Watermark and page numbers'>
            <div className='edit-pdf__setup-head'>
              <h3>Watermark & page numbers</h3>
              <button type='button' className='edit-pdf__icon-btn' aria-label='Close watermark and page numbers'
                onClick={() => setShowSetup(false)}>
                <Icon name='close' size={18} />
              </button>
            </div>
            <DocumentOptions options={options} onChange={changeOptions} />
          </aside>
        )}
      </div>

      {signDialog && (
        <SignatureDialog kind={signDialog.kind} onDone={signatureDone} onClose={() => setSignDialog(null)} />
      )}
    </div>
  );
});

export default EditPdf;
