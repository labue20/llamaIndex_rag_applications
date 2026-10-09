/**
 * Edit PDF
 * Organize pages (reorder, turn, copy, remove, add blank pages, combine
 * PDFs) and add text, images, highlights, boxes, white-out and drawings, and
 * fill in the PDF's own form fields. The server makes the new PDF (/editPdf).
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/webpack';
import {
  apiFetch, DocumentPicker, downloadBlob, filenameFromDisposition, Icon, readApiError,
} from '../../../shared';
import {
  buildEdits, clamp, COLORS, DEFAULT_COLORS, FONT_SIZES, MAX_FILES, newKey, POINTS_PER_PAGE, rotateBy, shownSize,
  STROKES, TOOLS,
} from '../editModel';
import PageEditor from './PageEditor';
import PageStrip from './PageStrip';
import '../../../shared/styles/converter.scss';
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

const EditPdf = forwardRef(({ onStatusChange, allowDocumentManager = true }, ref) => {
  const [files, setFiles] = useState([]); // File objects: [0] the main PDF, then PDFs added
  const [docs, setDocs] = useState([]); // pdf.js documents, same order
  const [pages, setPages] = useState([]);
  const [items, setItems] = useState([]);
  const [images, setImages] = useState({}); // imageId -> { file, dataUrl, aspect }
  const [formValues, setFormValues] = useState({});
  const [history, setHistory] = useState([]);
  const [currentKey, setCurrentKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState('select');
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [fontPoints, setFontPoints] = useState(12);
  const [stroke, setStroke] = useState(STROKES[1].value);
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
    setCurrentKey(null);
    setSelectedId(null);
    setTool('select');
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

  // --- undo ----------------------------------------------------------------------------
  const remember = useCallback(() => {
    setHistory((prev) => [...prev.slice(-(HISTORY - 1)), { pages, items, formValues }]);
    setResult('');
  }, [pages, items, formValues]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setPages(last.pages);
      setItems(last.items);
      setFormValues(last.formValues);
      setSelectedId(null);
      if (!last.pages.some((p) => p.key === currentKey)) setCurrentKey(last.pages[0]?.key ?? null);
      return prev.slice(0, -1);
    });
  }, [currentKey]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !typing && file) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, file]);

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
      .map((i) => ({ ...i, id: nextItemId++, pageKey: copyKey }))]);
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

  // --- things on pages --------------------------------------------------------------------
  const styleFor = (kind) => ({
    color: colors[kind] || '#111827',
    ...(kind === 'text' ? { font_size: fontPoints / POINTS_PER_PAGE, bold: false } : {}),
    ...(kind === 'rect' || kind === 'draw' ? { stroke } : {}),
  });

  const createItem = (spec) => {
    remember();
    const item = { id: nextItemId++, pageKey: currentPage.key, ...styleFor(spec.kind), ...spec };
    if (item.kind === 'text') item.text = '';
    if (item.kind === 'whiteout') delete item.color;
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
    // After placing a text box, type into it
    if (item.kind === 'text') setTool('select');
  };

  const changeItem = (id, changes) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));

  const removeItem = (id) => {
    remember();
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedId(null);
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
      const size = shownSize(currentPage);
      const width = 0.3;
      const height = clamp((width * image.aspect * size.width) / size.height, 0.02, 0.8);
      createItem({ kind: 'image', imageId, x: 0.35, y: clamp(0.5 - height / 2, 0, 1 - height), width, height });
      setTool('select');
    } catch (err) {
      setError(err.message);
    }
  };

  // The style controls change the selected item, or what the tool will add next
  const styleTarget = selected ? selected.kind : tool;
  const setStyle = (changes) => {
    if (selected) {
      remember();
      changeItem(selected.id, changes);
    }
    if (changes.color) setColors((prev) => ({ ...prev, [styleTarget]: changes.color }));
    if (changes.font_size) setFontPoints(Math.round(changes.font_size * POINTS_PER_PAGE));
    if (changes.stroke) setStroke(changes.stroke);
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
      usedImages.forEach((id) => formData.append('images', images[id].file));
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
              Add text, images, highlights and drawings, fill in forms, and reorder, turn, remove or combine pages
              • Max 50MB
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

  const strokeTarget = styleTarget === 'rect' || styleTarget === 'draw';
  const currentStroke = selected?.stroke ?? stroke;
  const currentColor = selected?.color ?? colors[styleTarget];
  const currentPoints = selected?.kind === 'text' ? Math.round(selected.font_size * POINTS_PER_PAGE) : fontPoints;
  const pageIndex = pages.findIndex((p) => p.key === currentPage?.key);

  return (
    <div className='file-converter edit-pdf'>
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
            {t.label}
          </button>
        ))}
        <label className='edit-pdf__tool'>
          Image
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
        <button type='button' className='edit-pdf__tool edit-pdf__undo' onClick={undo} disabled={!history.length || isSaving}>
          Undo
        </button>
      </div>

      {/* Always shown, so the page doesn't jump when the tool changes */}
      <div className='edit-pdf__style' role='group' aria-label='Style'>
        {(['text', 'highlight', 'rect', 'draw'].includes(styleTarget)) && (
          <>
            <span className='edit-pdf__style-label'>Color</span>
            {COLORS.filter((c) => styleTarget !== 'highlight' || c !== '#ffffff').map((c) => (
              <button
                key={c}
                type='button'
                className={`edit-pdf__swatch ${currentColor === c ? 'edit-pdf__swatch--active' : ''}`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
                aria-pressed={currentColor === c}
                onClick={() => setStyle({ color: c })}
              />
            ))}
            {styleTarget === 'text' && (
              <>
                <label className='edit-pdf__style-label'>
                  Size
                  <select
                    value={FONT_SIZES.includes(currentPoints) ? currentPoints : ''}
                    onChange={(e) => setStyle({ font_size: Number(e.target.value) / POINTS_PER_PAGE })}
                  >
                    {!FONT_SIZES.includes(currentPoints) && <option value=''>{currentPoints}</option>}
                    {FONT_SIZES.map((s) => <option key={s} value={s}>{s} pt</option>)}
                  </select>
                </label>
                {selected && (
                  <button
                    type='button'
                    className={`edit-pdf__bold ${selected.bold ? 'edit-pdf__bold--active' : ''}`}
                    aria-pressed={!!selected.bold}
                    onClick={() => setStyle({ bold: !selected.bold })}
                  >
                    B
                  </button>
                )}
              </>
            )}
            {strokeTarget && (
              <label className='edit-pdf__style-label'>
                Line
                <select value={currentStroke} onChange={(e) => setStyle({ stroke: Number(e.target.value) })}>
                  {STROKES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            )}
          </>
        )}
        <span className='edit-pdf__hint'>
          {selected && 'Drag to move, drag the corner to resize, Delete to remove.'}
          {!selected && tool === 'select' && 'Click something you added to change it. Fill in form fields right on the page.'}
          {!selected && tool === 'text' && 'Click on the page where the text should go, then type.'}
          {!selected && ['highlight', 'rect', 'whiteout'].includes(tool) && 'Drag across the page to add it.'}
          {!selected && tool === 'draw' && 'Draw on the page with your mouse, finger or pen.'}
        </span>
      </div>

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
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={createItem}
            onChange={changeItem}
            onBeginChange={remember}
            onRemove={removeItem}
            formValues={formValues}
            onFormChange={setFormValue}
            pageLabel={`Page ${pageIndex + 1} of ${pages.length}`}
          />
        )}
      </div>

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

      <div className='conversion-action'>
        <button type='button' className='convert-btn' onClick={save} disabled={isSaving || isLoading}>
          <span className='btn-icon' aria-hidden='true'>
            {isSaving ? <span className='btn-spinner' /> : <Icon name='edit' size={18} />}
          </span>
          {isSaving ? 'Saving...' : 'Save & download'}
        </button>
      </div>
    </div>
  );
});

export default EditPdf;
