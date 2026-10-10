/**
 * Document Preview
 * A saved document opened just to look at: every page, scrolled like a
 * reader, over the Document Manager. PDFs and Word documents (shown as the
 * server's PDF of them) are drawn with pdf.js; text files are shown as text.
 * Nothing in it changes the document. Escape or Close returns to the list.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/webpack';
import { Icon, apiFetch, readApiError } from '../../../shared';
import { documentApi } from '../services/documentApi';

const TEXT_TYPES = ['.txt', '.md', '.json', '.csv'];
const extensionOf = (name) => (name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();

// One page, drawn when it scrolls near the screen so long documents open quickly
const PreviewPage = ({ page, number, width }) => {
  const canvasRef = useRef(null);
  const holderRef = useRef(null);
  const [isNear, setIsNear] = useState(typeof IntersectionObserver === 'undefined');
  const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });

  useEffect(() => {
    if (isNear) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setIsNear(true),
      { rootMargin: '600px 0px' },
    );
    observer.observe(holderRef.current);
    return () => observer.disconnect();
  }, [isNear]);

  useEffect(() => {
    if (!isNear || !canvasRef.current) return undefined;
    // Sharp on high-density screens, without drawing huge canvases
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const scaled = page.getViewport({ scale: viewport.scale * density });
    const canvas = canvasRef.current;
    canvas.width = scaled.width;
    canvas.height = scaled.height;
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled });
    task.promise.catch(() => {}); // cancelled when the preview closes: fine
    return () => task.cancel();
  }, [isNear, page, viewport.scale]);

  return (
    <div ref={holderRef} className='doc-preview__page' style={{ width: viewport.width, height: viewport.height }}>
      <canvas ref={canvasRef} aria-label={`Page ${number}`} role='img' />
    </div>
  );
};

const DocumentPreview = ({ document, name, onClose }) => {
  const [state, setState] = useState({ status: 'loading' }); // loading | pdf | text | error
  const [width, setWidth] = useState(800);
  const bodyRef = useRef(null);
  const closeRef = useRef(null);
  const extension = extensionOf(name);

  // Load the document: the PDF to show, or the text of a text file
  useEffect(() => {
    let cancelled = false;
    let pdf = null;
    const id = encodeURIComponent(document.id);
    (async () => {
      try {
        if (TEXT_TYPES.includes(extension)) {
          const response = await apiFetch(`/documents/${id}/file`);
          if (!response.ok) throw new Error(await readApiError(response, 'This document couldn’t be opened.'));
          const text = await response.text();
          if (!cancelled) setState({ status: 'text', text });
          return;
        }
        const response = await apiFetch(`/documents/${id}/preview`);
        if (!response.ok) throw new Error(await readApiError(response, 'This document couldn’t be opened.'));
        const data = await response.arrayBuffer();
        pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
        const pages = await Promise.all(
          Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)),
        );
        if (!cancelled) setState({ status: 'pdf', pages });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message || 'This document couldn’t be opened.' });
      }
    })();
    return () => {
      cancelled = true;
      pdf?.destroy();
    };
  }, [document.id, extension]);

  // Pages fill the width available, up to a comfortable reading size
  useEffect(() => {
    const measure = () => {
      const available = (bodyRef.current?.clientWidth || 800) - 32;
      setWidth(Math.max(240, Math.min(available, 900)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Escape closes; the page behind doesn't scroll while it's open
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const { overflow } = window.document.body.style;
    window.document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      window.document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const [isDownloading, setIsDownloading] = useState(false);
  const download = async () => {
    setIsDownloading(true);
    try {
      await documentApi.downloadDocument(document.id, name);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const pageCount = state.status === 'pdf' ? state.pages.length : null;

  return (
    <div className='doc-preview' role='dialog' aria-modal='true' aria-labelledby='doc-preview-title'>
      <div className='doc-preview__bar'>
        <div className='doc-preview__title'>
          <span className='doc-preview__icon' aria-hidden='true'><Icon name='file' size={16} /></span>
          <h2 id='doc-preview-title' title={name}>{name}</h2>
          {pageCount !== null && (
            <span className='doc-preview__pages'>{pageCount} page{pageCount === 1 ? '' : 's'}</span>
          )}
        </div>
        <div className='doc-preview__actions'>
          {document.has_file !== false && (
            <button type='button' className='doc-preview__button' onClick={download} disabled={isDownloading}>
              <Icon name='download' size={16} />
              <span className='doc-preview__button-label'>{isDownloading ? 'Downloading…' : 'Download'}</span>
            </button>
          )}
          <button type='button' ref={closeRef} className='doc-preview__button doc-preview__button--close'
            onClick={onClose} aria-label='Close'>
            <Icon name='close' size={18} />
          </button>
        </div>
      </div>
      <div className='doc-preview__body' ref={bodyRef}>
        {state.status === 'loading' && (
          <p className='doc-preview__message' role='status'>
            <span className='doc-preview__spinner' aria-hidden='true' /> Opening {name}…
          </p>
        )}
        {state.status === 'error' && (
          <p className='doc-preview__message doc-preview__message--error' role='alert'>
            <Icon name='alertTriangle' size={18} /> {state.message}
          </p>
        )}
        {state.status === 'text' && <pre className='doc-preview__text'>{state.text}</pre>}
        {state.status === 'pdf' && state.pages.map((page, i) => (
          <PreviewPage key={i} page={page} number={i + 1} width={width} />
        ))}
      </div>
    </div>
  );
};

export default DocumentPreview;
