/**
 * Page Strip
 * Every page of the PDF being made, in order: pick one to edit, drag (or use
 * the arrows) to reorder, turn, copy or remove it, and add blank pages or
 * other PDFs at the end.
 */

import React, { useEffect, useRef, useState } from 'react';
import { shownSize } from '../editModel';

const THUMB_WIDTH = 96;

const Thumbnail = ({ page, pdf }) => {
  const canvasRef = useRef(null);
  const size = shownSize(page);

  useEffect(() => {
    if (page.blank || !pdf) return undefined;
    let cancelled = false;
    let task = null;
    (async () => {
      const pdfPage = await pdf.getPage(page.page + 1);
      if (cancelled || !canvasRef.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const ratio = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({
        scale: (THUMB_WIDTH / (page.rotate % 180 === 0 ? base.width : base.height)) * ratio,
        rotation: ((pdfPage.rotate || 0) + page.rotate) % 360,
      });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      task = pdfPage.render({ canvasContext: context, viewport });
      try {
        await task.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') console.error('Thumbnail failed:', err);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [pdf, page.page, page.rotate, page.blank]);

  return (
    <span className='edit-pdf__thumb-paper' style={{ aspectRatio: `${size.width} / ${size.height}` }}>
      {!page.blank && <canvas ref={canvasRef} aria-hidden='true' />}
    </span>
  );
};

const PageStrip = ({
  pages, docs, currentKey, itemCounts, disabled, onSelect, onMove, onRotate, onDuplicate, onDelete, onAddBlank,
  onAddPdf,
}) => {
  const [dragKey, setDragKey] = useState(null);
  const addInputRef = useRef(null);

  return (
    <div className='edit-pdf__strip'>
      <ol className='edit-pdf__pages' aria-label='Pages'>
        {pages.map((page, index) => {
          const isCurrent = page.key === currentKey;
          const label = `Page ${index + 1}${page.blank ? ' (blank)' : ''}`;
          return (
            <li
              key={page.key}
              className={`edit-pdf__thumb ${isCurrent ? 'edit-pdf__thumb--current' : ''} ${dragKey === page.key ? 'edit-pdf__thumb--dragging' : ''}`}
              draggable={!disabled}
              onDragStart={(e) => {
                setDragKey(page.key);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', page.key);
              }}
              onDragOver={(e) => {
                if (dragKey && dragKey !== page.key) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragKey) onMove(dragKey, index);
                setDragKey(null);
              }}
              onDragEnd={() => setDragKey(null)}
            >
              <button
                type='button'
                className='edit-pdf__thumb-select'
                aria-label={label}
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() => onSelect(page.key)}
              >
                <Thumbnail page={page} pdf={docs[page.file]} />
                <span className='edit-pdf__thumb-number'>
                  {index + 1}
                  {page.file > 0 && <span className='edit-pdf__thumb-source'> · PDF {page.file + 1}</span>}
                  {itemCounts[page.key] > 0 && <span className='edit-pdf__thumb-dot' title='Has changes' />}
                </span>
              </button>
              <span className='edit-pdf__thumb-actions'>
                <button type='button' aria-label={`Move page ${index + 1} earlier`} disabled={disabled || index === 0}
                  onClick={() => onMove(page.key, index - 1)}>‹</button>
                <button type='button' aria-label={`Turn page ${index + 1}`} disabled={disabled}
                  onClick={() => onRotate(page.key)}>↻</button>
                <button type='button' aria-label={`Copy page ${index + 1}`} disabled={disabled}
                  onClick={() => onDuplicate(page.key)}>⧉</button>
                <button type='button' aria-label={`Remove page ${index + 1}`} disabled={disabled || pages.length === 1}
                  onClick={() => onDelete(page.key)}>×</button>
                <button type='button' aria-label={`Move page ${index + 1} later`}
                  disabled={disabled || index === pages.length - 1}
                  onClick={() => onMove(page.key, index + 1)}>›</button>
              </span>
            </li>
          );
        })}
        <li className='edit-pdf__strip-add'>
          <button type='button' className='edit-pdf__add' onClick={onAddBlank} disabled={disabled}>+ Blank page</button>
          <button type='button' className='edit-pdf__add' onClick={() => addInputRef.current?.click()} disabled={disabled}>
            + Add PDF
          </button>
          <input
            ref={addInputRef}
            type='file'
            accept='.pdf,application/pdf'
            multiple
            hidden
            aria-label='Add PDF files'
            onChange={(e) => {
              const files = [...e.target.files];
              e.target.value = '';
              if (files.length) onAddPdf(files);
            }}
          />
        </li>
      </ol>
    </div>
  );
};

export default PageStrip;
