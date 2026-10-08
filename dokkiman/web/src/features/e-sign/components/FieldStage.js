/**
 * Field Stage
 * One PDF page with fields on top. Editable: fields can be dragged, resized
 * (corner handle), moved with the arrow keys and removed. Read-only: fields
 * are buttons (used on the signing page).
 *
 * Positions are fractions of the page (0..1 from the top-left), which is
 * what the server stores.
 */

import React, { useEffect, useRef, useState } from 'react';
import { clamp } from '../fields';

// Draw a page of a pdf.js document into a canvas sized to `width` CSS pixels
export const usePageCanvas = (pdf, pageIndex, width) => {
  const canvasRef = useRef(null);
  const [ratio, setRatio] = useState(1.294); // height / width
  useEffect(() => {
    if (!pdf || !canvasRef.current || !width) return undefined;
    let cancelled = false;
    let task = null;
    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const scale = (width / base.width) * (window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      task = page.render({ canvasContext: context, viewport });
      try {
        await task.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') console.error('Render failed:', err);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [pdf, pageIndex, width]);
  return { canvasRef, ratio };
};

// Width of an element, kept up to date
export const useWidth = () => {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
};

const FieldStage = ({
  pdf, pageIndex, fields, renderField, describeField, fieldStyle,
  editable = false, selectedId, onSelect, onChange, onRemove, onActivate,
}) => {
  const [stageRef, width] = useWidth();
  const { canvasRef, ratio } = usePageCanvas(pdf, pageIndex, width);
  const overlayRef = useRef(null);
  const height = width ? width * ratio : undefined;

  const startDrag = (event, field, mode) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(field.id);
    const box = overlayRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...field };
    const onMove = (e) => {
      const dx = (e.clientX - startX) / box.width;
      const dy = (e.clientY - startY) / box.height;
      if (mode === 'move') {
        onChange(field.id, {
          x: clamp(start.x + dx, 0, 1 - start.width),
          y: clamp(start.y + dy, 0, 1 - start.height),
        });
      } else {
        onChange(field.id, {
          width: clamp(start.width + dx, 0.04, 1 - start.x),
          height: clamp(start.height + dy, 0.015, 1 - start.y),
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleKey = (event, field) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      onChange(field.id, {
        x: clamp(field.x + dx, 0, 1 - field.width),
        y: clamp(field.y + dy, 0, 1 - field.height),
      });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove(field.id);
    }
  };

  return (
    <div className='sign-pdf__stage esign-stage' ref={stageRef} onPointerDown={() => editable && onSelect?.(null)}>
      <div className='sign-pdf__page' style={{ height }}>
        <canvas ref={canvasRef} className='sign-pdf__canvas' aria-label={`Page ${pageIndex + 1}`} />
        <div className='sign-pdf__overlay' ref={overlayRef}>
          {fields.map((field) => {
            const style = {
              left: `${field.x * 100}%`,
              top: `${field.y * 100}%`,
              width: `${field.width * 100}%`,
              height: `${field.height * 100}%`,
              fontSize: height ? `${Math.max(9, field.height * height * 0.55)}px` : undefined,
              ...fieldStyle?.(field),
            };
            if (!editable) {
              return (
                <button
                  key={field.id}
                  type='button'
                  className={`esign-field esign-field--${field.kind}`}
                  style={style}
                  aria-label={describeField(field)}
                  onClick={() => onActivate?.(field)}
                >
                  {renderField(field)}
                </button>
              );
            }
            return (
              <div
                key={field.id}
                className={`sign-pdf__item esign-field esign-field--${field.kind} ${selectedId === field.id ? 'sign-pdf__item--selected' : ''}`}
                style={style}
                role='button'
                tabIndex={0}
                aria-label={describeField(field)}
                onPointerDown={(e) => startDrag(e, field, 'move')}
                onKeyDown={(e) => handleKey(e, field)}
                onFocus={() => onSelect?.(field.id)}
              >
                {renderField(field)}
                <button
                  type='button'
                  className='sign-pdf__remove'
                  aria-label={`Remove ${describeField(field)}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onRemove(field.id)}
                >
                  ×
                </button>
                <span className='sign-pdf__resize' aria-hidden='true' onPointerDown={(e) => startDrag(e, field, 'resize')} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FieldStage;
