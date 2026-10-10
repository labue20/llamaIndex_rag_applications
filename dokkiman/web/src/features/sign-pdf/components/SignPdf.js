/**
 * Sign PDF
 * Place signatures, initials and dates on a PDF's pages, then have the server
 * stamp them into the document (/signPdf), optionally with an audit trail page.
 * The signed PDF can be downloaded, saved to the Document Manager, or both:
 * it's signed once and that copy is reused until something changes.
 *
 * Item positions are stored as fractions of the page (0..1 from the top-left),
 * which is also what the server expects.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/webpack';
import {
  apiFetch,
  asPdf,
  dataUrlToBlob,
  DocumentPicker,
  downloadBlob,
  filenameFromDisposition,
  Icon,
  isPdfFile,
  isWordFile,
  readApiError,
} from '../../../shared';
import SignatureDialog from './SignatureDialog';
import '../../../shared/styles/converter.scss';
import '../styles/sign-pdf.scss';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

let nextItemId = 1;

const SignPdf = forwardRef(({ onStatusChange, allowDocumentManager = true, onSaveToDocuments }, ref) => {
  const [file, setFile] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageRatio, setPageRatio] = useState(1.294); // height / width of the current page
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [images, setImages] = useState({}); // { signature: {dataUrl, aspect}, initials: {...} }
  const [dialogKind, setDialogKind] = useState(null); // 'signature' | 'initials' | null
  const [addAudit, setAddAudit] = useState(true);
  const [isSigning, setIsSigning] = useState(false);
  const [isConverting, setIsConverting] = useState(false); // a Word document becoming a PDF
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  // The signed copy: { file, fingerprint, recordId, downloaded, saved }
  const [signed, setSigned] = useState(null);

  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const stageRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [stageWidth, setStageWidth] = useState(0);

  // --- loading -----------------------------------------------------------------
  const reset = useCallback(() => {
    setFile(null);
    setPdf(null);
    setPageCount(0);
    setCurrentPage(0);
    setItems([]);
    setSelectedId(null);
    setError('');
    setResult(null);
  }, []);

  const loadFile = useCallback(async (selectedFile) => {
    if (!isPdfFile(selectedFile) && !isWordFile(selectedFile)) {
      alert('Please choose a PDF or a Word document (.docx)');
      return;
    }
    reset();
    let pdfFile = selectedFile;
    if (isWordFile(selectedFile)) {
      setIsConverting(true);
      try {
        pdfFile = await asPdf(selectedFile);
      } catch (err) {
        alert(err.message);
        return;
      } finally {
        setIsConverting(false);
      }
    }
    setFile(pdfFile);
    try {
      const doc = await pdfjsLib.getDocument({ data: await pdfFile.arrayBuffer() }).promise;
      setPdf(doc);
      setPageCount(doc.numPages);
    } catch (err) {
      console.error('Could not open PDF:', err);
      setError('This PDF couldn’t be opened. It may be damaged or password-protected.');
    }
  }, [reset]);

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    event.target.value = '';
    if (selectedFile) loadFile(selectedFile);
  };

  useImperativeHandle(ref, () => ({ selectFile: loadFile, reset }));

  useEffect(() => {
    onStatusChange?.({ hasFile: !!file, isBusy: isSigning });
  }, [onStatusChange, file, isSigning]);

  // --- rendering the current page --------------------------------------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => setStageWidth(stage.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [file]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return undefined;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(currentPage + 1);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setPageRatio(base.height / base.width);
      const width = stageWidth || 600;
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      renderTaskRef.current?.cancel?.();
      const task = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') console.error('Render failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, currentPage, stageWidth]);

  // --- adding items ---------------------------------------------------------------
  const addImageItem = (kind, image) => {
    const width = kind === 'initials' ? 0.12 : 0.3;
    // Fraction of page height that keeps the image's proportions on this page
    const height = clamp((width * image.aspect) / pageRatio, 0.02, 0.4);
    const item = {
      id: nextItemId++, type: 'image', kind, label: kind, page: currentPage,
      x: 0.5 - width / 2, y: 0.5 - height / 2, width, height,
    };
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
    setResult(null);
  };

  const requestImage = (kind) => {
    if (images[kind]) addImageItem(kind, images[kind]);
    else setDialogKind(kind);
  };

  const handleDialogDone = (image) => {
    const kind = dialogKind;
    setImages((prev) => ({ ...prev, [kind]: image }));
    // Changing a signature updates every copy already placed
    setDialogKind(null);
    if (!items.some((i) => i.kind === kind)) addImageItem(kind, image);
  };

  const addDate = () => {
    const width = 0.2;
    const height = 0.03;
    const item = {
      id: nextItemId++, type: 'text', kind: 'date', label: 'date', page: currentPage,
      text: new Date().toLocaleDateString(),
      x: 0.5 - width / 2, y: 0.6, width, height,
    };
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
    setResult(null);
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedId(null);
  };

  const updateItem = (id, changes) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));

  // --- dragging and resizing (pointer events: mouse, touch and pen) ---------------
  const startDrag = (event, item, mode) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);
    const overlay = overlayRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...item };

    const onMove = (e) => {
      const dx = (e.clientX - startX) / overlay.width;
      const dy = (e.clientY - startY) / overlay.height;
      if (mode === 'move') {
        updateItem(item.id, {
          x: clamp(start.x + dx, 0, 1 - start.width),
          y: clamp(start.y + dy, 0, 1 - start.height),
        });
      } else {
        // Resize from the corner, keeping proportions
        const width = clamp(start.width + dx, 0.04, 1 - start.x);
        const height = clamp((start.height * width) / start.width, 0.015, 1 - start.y);
        updateItem(item.id, { width: (height * start.width) / start.height, height });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleItemKey = (event, item) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      updateItem(item.id, {
        x: clamp(item.x + dx, 0, 1 - item.width),
        y: clamp(item.y + dy, 0, 1 - item.height),
      });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeItem(item.id);
    }
  };

  // --- signing ----------------------------------------------------------------------
  // Moving, adding or removing anything (or the audit page setting) means signing again
  useEffect(() => {
    setSigned(null);
    setResult(null);
  }, [file, items, addAudit]);

  // Sign on the server, once per version of the placements
  const signDocument = async () => {
    if (signed) return signed;
    const kinds = [...new Set(items.filter((i) => i.type === 'image').map((i) => i.kind))];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('audit', addAudit ? 'true' : 'false');
    formData.append('placements', JSON.stringify(items.map((i) => ({
      type: i.type, page: i.page, x: i.x, y: i.y, width: i.width, height: i.height, label: i.label,
      ...(i.type === 'image' ? { image: kinds.indexOf(i.kind) } : { text: i.text }),
    }))));
    for (const kind of kinds) {
      formData.append('images', dataUrlToBlob(images[kind].dataUrl), `${kind}.png`);
    }

    const response = await apiFetch('/signPdf', { method: 'POST', body: formData });
    if (!response.ok) {
      throw new Error(await readApiError(response, 'The PDF could not be signed.'));
    }
    const blob = await response.blob();
    const fileName = filenameFromDisposition(
      response.headers.get('Content-Disposition'),
      `${file.name.replace(/\.pdf$/i, '')}_signed.pdf`
    );
    return {
      file: new File([blob], fileName, { type: 'application/pdf' }),
      fingerprint: response.headers.get('X-Document-SHA256'),
      recordId: response.headers.get('X-Audit-Record-Id'),
      downloaded: false,
      saved: false,
    };
  };

  // action: 'download' or 'save' (to the Document Manager)
  const sign = async (action = 'download') => {
    if (!file) return;
    if (items.length === 0) {
      setError('Add a signature, initials or date to the document first.');
      return;
    }
    setIsSigning(true);
    setError('');
    try {
      const copy = await signDocument();
      if (action === 'save') {
        await onSaveToDocuments(copy.file);
        copy.saved = true;
      } else {
        downloadBlob(copy.file, copy.file.name);
        copy.downloaded = true;
      }
      setSigned({ ...copy });
      setResult({ fileName: copy.file.name, recordId: copy.recordId, downloaded: copy.downloaded, saved: copy.saved });
    } catch (err) {
      console.error('Signing failed:', err);
      setError(err.message);
    } finally {
      setIsSigning(false);
    }
  };

  const pageItems = items.filter((i) => i.page === currentPage);
  const stageHeight = stageWidth ? stageWidth * pageRatio : undefined;

  return (
    <div className='file-converter sign-pdf'>
      {!file && (
        <div className='file-input-section'>
          <div className='upload-area'>
            <input type='file' accept='.pdf,.docx' onChange={handleFileSelect} id='sign-pdf-file-input'
              disabled={isConverting} />
            <div className='upload-actions'>
              <label htmlFor='sign-pdf-file-input' className='upload-label'>Choose File</label>
              {allowDocumentManager && (
                <DocumentPicker
                  acceptedExtensions={['.pdf', '.docx']}
                  onSelect={(picked) => picked && loadFile(picked)}
                />
              )}
            </div>
            <p className='upload-hint'>
              {isConverting
                ? 'Converting your Word document…'
                : 'Add your signature, initials and the date to a PDF or Word document • Max 50MB'}
            </p>
          </div>
        </div>
      )}

      {file && (
        <>
          <div className='sign-pdf__toolbar' role='toolbar' aria-label='Add to document'>
            <button type='button' className='sign-pdf__tool' onClick={() => requestImage('signature')} disabled={isSigning}>
              <Icon name='pen' size={16} /> Signature
            </button>
            <button type='button' className='sign-pdf__tool' onClick={() => requestImage('initials')} disabled={isSigning}>
              <Icon name='pen' size={16} /> Initials
            </button>
            <button type='button' className='sign-pdf__tool' onClick={addDate} disabled={isSigning}>
              <Icon name='check' size={16} /> Date
            </button>
            {(images.signature || images.initials) && (
              <span className='sign-pdf__redo'>
                Change:
                {images.signature && (
                  <button type='button' onClick={() => setDialogKind('signature')}>signature</button>
                )}
                {images.initials && (
                  <button type='button' onClick={() => setDialogKind('initials')}>initials</button>
                )}
              </span>
            )}
          </div>

          <p className='sign-pdf__hint'>
            Drag to move, drag the corner to resize, or select one and use the arrow keys. Press Delete to remove.
          </p>

          {pageCount > 1 && (
            <div className='sign-pdf__pager'>
              <button type='button' onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 0}>
                ← Previous
              </button>
              <span>Page {currentPage + 1} of {pageCount}</span>
              <button
                type='button'
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={currentPage >= pageCount - 1}
              >
                Next →
              </button>
            </div>
          )}

          <div className='sign-pdf__stage' ref={stageRef} onPointerDown={() => setSelectedId(null)}>
            <div className='sign-pdf__page' style={{ height: stageHeight }}>
              <canvas ref={canvasRef} className='sign-pdf__canvas' aria-label={`Page ${currentPage + 1}`} />
              <div className='sign-pdf__overlay' ref={overlayRef}>
                {pageItems.map((item) => (
                  <div
                    key={item.id}
                    className={`sign-pdf__item sign-pdf__item--${item.type} ${selectedId === item.id ? 'sign-pdf__item--selected' : ''}`}
                    style={{
                      left: `${item.x * 100}%`,
                      top: `${item.y * 100}%`,
                      width: `${item.width * 100}%`,
                      height: `${item.height * 100}%`,
                      fontSize: stageHeight ? `${item.height * stageHeight * 0.7}px` : undefined,
                    }}
                    role='button'
                    tabIndex={0}
                    aria-label={`${item.label} on page ${item.page + 1}`}
                    onPointerDown={(e) => startDrag(e, item, 'move')}
                    onKeyDown={(e) => handleItemKey(e, item)}
                    onFocus={() => setSelectedId(item.id)}
                  >
                    {item.type === 'image' ? (
                      <img src={images[item.kind]?.dataUrl} alt='' draggable={false} />
                    ) : (
                      <span>{item.text}</span>
                    )}
                    <button
                      type='button'
                      className='sign-pdf__remove'
                      aria-label={`Remove ${item.label}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => removeItem(item.id)}
                    >
                      ×
                    </button>
                    <span
                      className='sign-pdf__resize'
                      aria-hidden='true'
                      onPointerDown={(e) => startDrag(e, item, 'resize')}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <label className='sign-pdf__audit'>
            <input type='checkbox' checked={addAudit} onChange={(e) => setAddAudit(e.target.checked)} />
            <span>
              Add an audit trail page (recommended): who signed, when, and fingerprints that show if the
              document is changed later
            </span>
          </label>

          {error && (
            <div className='converter-message converter-message--error' role='alert'>
              <Icon name='alert' size={16} />
              <span>{error}</span>
            </div>
          )}
          {result && !error && (
            <div className='converter-message converter-message--success' role='status'>
              <Icon name='checkCircle' size={16} />
              <span>
                {result.downloaded && result.saved && `Signed ${result.fileName}: downloaded and saved to your Document Manager.`}
                {result.downloaded && !result.saved && `Signed and downloaded ${result.fileName}.`}
                {!result.downloaded && result.saved && `Signed and saved ${result.fileName} to your Document Manager.`}
                {result.recordId && <> Audit record {result.recordId.slice(0, 8)}…</>}
              </span>
            </div>
          )}

          <div className='conversion-action'>
            <button type='button' className='convert-btn' onClick={() => sign('download')} disabled={isSigning}>
              <span className='btn-icon' aria-hidden='true'>
                {isSigning ? <span className='btn-spinner' /> : <Icon name='pen' size={18} />}
              </span>
              {isSigning ? 'Signing...' : signed ? 'Download' : 'Sign & download'}
            </button>
            {/* Accounts only: keep the signed copy without downloading it */}
            {onSaveToDocuments && (
              <button type='button' className='convert-btn convert-btn--secondary' onClick={() => sign('save')}
                disabled={isSigning || !!signed?.saved}>
                <span className='btn-icon' aria-hidden='true'><Icon name='folder' size={18} /></span>
                {signed?.saved ? 'Saved to Documents' : signed ? 'Save to Documents' : 'Sign & save to Documents'}
              </button>
            )}
          </div>
        </>
      )}

      {dialogKind && (
        <SignatureDialog kind={dialogKind} onDone={handleDialogDone} onClose={() => setDialogKind(null)} />
      )}
    </div>
  );
});

export default SignPdf;
