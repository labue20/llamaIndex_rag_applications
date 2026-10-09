/**
 * Edit PDF
 * Change the PDF's own text, add text, signatures, images, shapes, marks,
 * highlights, drawings, white-out and redactions, fill in its form fields,
 * and organize pages (reorder, turn, copy, remove, add blank pages, combine
 * PDFs). The server makes the new PDF (/editPdf); the text lines to edit come
 * from /pdfText.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/webpack';
import {
  apiFetch, dataUrlToBlob, DocumentPicker, downloadBlob, filenameFromDisposition, Icon, readApiError,
} from '../../../shared';
import SignatureDialog from '../../sign-pdf/components/SignatureDialog';
import {
  buildEdits, clamp, DEFAULT_COLORS, MARKS, MAX_FILES, newKey, POINTS_PER_PAGE, rotateBy, SHAPES, shownSize,
  STROKES, textItemForLine, TOOLS,
} from '../editModel';
import PageEditor from './PageEditor';
import PageStrip from './PageStrip';
import StyleBar from './StyleBar';
import '../../../shared/styles/converter.scss';
import '../../sign-pdf/styles/sign-pdf.scss';
import '../styles/edit-pdf.scss';

const isPdf = (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
const isImage = (file) => /^image\/(png|jpeg)$/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
const HISTORY = 50;
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

const loadPdf = async (file, fileIndex) => {
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
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

const EditPdf = forwardRef(({ onStatusChange, allowDocumentManager = true }, ref) => {
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
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

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
    setError('');
    setResult('');
  }, [docs]);

  const loadFile = useCallback(async (selectedFile) => {
    if (!isPdf(selectedFile)) {
      setError('Please choose a PDF file.');
      return;
    }
    reset();
    setIsLoading(true);
    try {
      const loaded = await loadPdf(selectedFile, 0);
      setFiles([selectedFile]);
      setDocs([loaded.doc]);
      setPages(loaded.pages);
      setCurrentKey(loaded.pages[0]?.key ?? null);
    } catch (err) {
      console.error('Could not open PDF:', err);
      setError('This PDF couldn’t be opened. It may be damaged or password-protected.');
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  useImperativeHandle(ref, () => ({ selectFile: loadFile, reset }));

  useEffect(() => {
    onStatusChange?.({ hasFile: !!file, isBusy: isSaving || isLoading });
  }, [onStatusChange, file, isSaving, isLoading]);

  // --- undo and redo -----------------------------------------------------------------------
  const snapshot = useCallback(() => ({ pages, items, formValues }), [pages, items, formValues]);

  const remember = useCallback(() => {
    setHistory((prev) => [...prev.slice(-(HISTORY - 1)), snapshot()]);
    setFuture([]);
    setResult('');
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
    const pdfs = newFiles.filter(isPdf);
    if (pdfs.length !== newFiles.length) setError('Only PDF files can be added.');
    if (files.length + pdfs.length > MAX_FILES) {
      setError(`Combine at most ${MAX_FILES} PDFs at once.`);
      return;
    }
    setIsLoading(true);
    try {
      let index = files.length;
      const loaded = [];
      for (const pdf of pdfs) {
        loaded.push({ file: pdf, ...(await loadPdf(pdf, index)) });
        index += 1;
      }
      remember();
      setFiles((prev) => [...prev, ...loaded.map((l) => l.file)]);
      setDocs((prev) => [...prev, ...loaded.map((l) => l.doc)]);
      setPages((prev) => [...prev, ...loaded.flatMap((l) => l.pages)]);
      if (loaded[0]?.pages[0]) setCurrentKey(loaded[0].pages[0].key);
    } catch (err) {
      console.error('Could not add PDF:', err);
      setError('One of those PDFs couldn’t be opened. It may be damaged or password-protected.');
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
    // Text and images are adjusted straight away; with the other tools, the
    // next drag on the page adds another one
    if (item.kind === 'text' || item.kind === 'image') setSelectedId(item.id);
    // After placing a text box, type into it
    if (item.kind === 'text') setTool('select');
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

  // --- saving ------------------------------------------------------------------------------
  const save = async () => {
    if (!file) return;
    setIsSaving(true);
    setError('');
    setResult('');
    try {
      const usedImages = [...new Set(items.filter((i) => i.kind === 'image' && pages.some((p) => p.key === i.pageKey))
        .map((i) => i.imageId))];
      const edits = buildEdits(pages, items, formValues, (id) => usedImages.indexOf(id));
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
      downloadBlob(blob, fileName);
      setResult(`Saved and downloaded ${fileName}.`);
    } catch (err) {
      console.error('Edit failed:', err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // --- screen --------------------------------------------------------------------------------
  if (!file) {
    return (
      <div className='file-converter edit-pdf'>
        <div className='file-input-section'>
          <div className='upload-area'>
            <input
              type='file'
              accept='.pdf'
              id='edit-pdf-file-input'
              onChange={(e) => {
                const picked = e.target.files[0];
                e.target.value = '';
                if (picked) loadFile(picked);
              }}
            />
            <div className='upload-actions'>
              <label htmlFor='edit-pdf-file-input' className='upload-label'>Choose PDF File</label>
              {allowDocumentManager && (
                <DocumentPicker acceptedExtensions={['.pdf']} onSelect={(picked) => picked && loadFile(picked)} />
              )}
            </div>
            <p className='upload-hint'>
              Change text, add text, signatures, images and shapes, fill in forms, redact, and reorder or combine
              pages • Max 50MB
            </p>
          </div>
        </div>
        {isLoading && <p className='edit-pdf__loading'>Opening the PDF…</p>}
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

  return (
    <div className='file-converter edit-pdf edit-pdf--editing'>
      <div className='edit-pdf__workspace'>
        <PageStrip
          pages={pages}
          docs={docs}
          currentKey={currentPage?.key}
          itemCounts={itemCounts}
          disabled={isSaving || isLoading}
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
          />
        )}

        {/* Tools on the right (on phones, above the page), so the page gets the room */}
        <aside className='edit-pdf__panel' aria-label='Editing tools'>
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
            <span className='edit-pdf__history'>
              <button type='button' className='edit-pdf__tool edit-pdf__tool--row' onClick={undo}
                disabled={!history.length || isSaving} title='Undo (Ctrl+Z)'>
                <Icon name='undo' size={16} />
                <span className='edit-pdf__tool-label'>Undo</span>
              </button>
              <button type='button' className='edit-pdf__tool edit-pdf__tool--row' onClick={redo}
                disabled={!future.length || isSaving} title='Redo (Ctrl+Shift+Z)'>
                <Icon name='redo' size={16} />
                <span className='edit-pdf__tool-label'>Redo</span>
              </button>
            </span>
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

          {error && (
            <div className='converter-message converter-message--error' role='alert'>
              <Icon name='alert' size={16} />
              <span>{error}</span>
            </div>
          )}
          {result && !error && (
            <div className='converter-message converter-message--success' role='status'>
              <Icon name='checkCircle' size={16} />
              <span>{result}</span>
            </div>
          )}

          <button type='button' className='convert-btn edit-pdf__save' onClick={save} disabled={isSaving || isLoading}>
            <span className='btn-icon' aria-hidden='true'>
              {isSaving ? <span className='btn-spinner' /> : <Icon name='edit' size={18} />}
            </span>
            {isSaving ? 'Saving...' : 'Save & download'}
          </button>
        </aside>
      </div>

      {signDialog && (
        <SignatureDialog kind={signDialog.kind} onDone={signatureDone} onClose={() => setSignDialog(null)} />
      )}
    </div>
  );
});

export default EditPdf;
