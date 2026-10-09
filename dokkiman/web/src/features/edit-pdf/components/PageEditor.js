/**
 * Page Editor
 * The current page, large, with what's been added to it on top. With a tool
 * picked, drag on the page to add a box (text, highlight, shapes, white-out,
 * redaction), a line or arrow, or draw freehand; click to add a mark. With
 * Edit text, the page's own lines of text can be clicked to change them.
 * Things added can be moved, resized and removed with any tool. The PDF's own
 * form fields can be filled in place. Shown fitted to the width of the screen,
 * or at a chosen zoom (1 = the page's real size).
 */

import React, { useEffect, useRef, useState } from 'react';
import { clamp, fieldValue, formFieldsFrom, shownSize } from '../editModel';
import PageItem, { pointsBox } from './PageItem';

const MIN_SIZE = 0.01;
// Screen pixels per PDF point at 100%
const PIXELS_PER_POINT = 96 / 72;

// What a drag on the page makes with each tool
const creation = (tool, shape, mark) => {
  if (tool === 'draw') return { mode: 'free' };
  if (tool === 'shapes' && shape.kind === 'line') return { mode: 'line', kind: 'line', arrow: !!shape.arrow };
  if (tool === 'shapes') return { mode: 'box', kind: shape.kind };
  if (tool === 'marks') return { mode: 'box', kind: 'mark', mark: mark.id };
  if (tool === 'note') return { mode: 'box', kind: 'note' };
  if (['text', 'highlight', 'whiteout', 'redact'].includes(tool)) return { mode: 'box', kind: tool };
  return null;
};

// A click (no drag) adds something of a useful size
const CLICK_SIZES = { text: [0.4, 0.045], highlight: [0.25, 0.025], mark: [0.035, null], note: [0.03, null] };

const PageEditor = ({
  page, pdf, items, images, tool, shape, mark, selectedId, onSelect, onCreate, onChange, onBeginChange, onRemove,
  formValues, onFormChange, pageLabel, lines, onEditLine, watermark, pageNumber, zoom = null, onScale,
}) => {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [fitWidth, setFitWidth] = useState(0);
  const [fields, setFields] = useState([]);
  const [draft, setDraft] = useState(null); // a box, line or drawing being made
  const size = shownSize(page);
  const ratio = size.height / size.width;
  // The page's width on screen: fitted, or zoomed
  const stageWidth = zoom ? Math.round(size.width * PIXELS_PER_POINT * zoom) : fitWidth;
  const stageHeight = stageWidth ? stageWidth * ratio : undefined;

  // Tell the zoom control what "fitted" works out to
  useEffect(() => {
    if (stageWidth) onScale?.(stageWidth / (size.width * PIXELS_PER_POINT));
  }, [stageWidth, size.width, onScale]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => setFitWidth(Math.max(0, stage.clientWidth - 24));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Draw the page (white for a blank page) and find its form fields
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    let task = null;
    const width = stageWidth || 600;
    const pixelRatio = window.devicePixelRatio || 1;
    (async () => {
      if (page.blank || !pdf) {
        canvas.width = width * pixelRatio;
        canvas.height = width * ratio * pixelRatio;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        setFields([]);
        return;
      }
      const pdfPage = await pdf.getPage(page.page + 1);
      if (cancelled) return;
      const rotation = ((pdfPage.rotate || 0) + page.rotate) % 360;
      const unscaled = pdfPage.getViewport({ scale: 1, rotation });
      const viewport = pdfPage.getViewport({ scale: (width / unscaled.width) * pixelRatio, rotation });
      // Only the main PDF's form fields can be filled
      if (page.file === 0 && pdfPage.getAnnotations && unscaled.convertToViewportRectangle) {
        const annotations = await pdfPage.getAnnotations({ intent: 'display' });
        if (!cancelled) setFields(formFieldsFrom(annotations, unscaled));
      } else {
        setFields([]);
      }
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context || cancelled) return;
      task = pdfPage.render({ canvasContext: context, viewport });
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
  }, [pdf, page.page, page.rotate, page.blank, page.file, stageWidth, ratio]);

  // --- adding (drag on the page with a tool) -------------------------------------------
  const pointAt = (event) => {
    const box = overlayRef.current.getBoundingClientRect();
    return {
      x: clamp((event.clientX - box.left) / (box.width || 1), 0, 1),
      y: clamp((event.clientY - box.top) / (box.height || 1), 0, 1),
    };
  };

  const startCreate = (event) => {
    const make = creation(tool, shape, mark);
    if (!make) {
      onSelect(null);
      return;
    }
    if (event.target !== overlayRef.current) return;
    event.preventDefault();
    const start = pointAt(event);
    let current = make.mode === 'free' ? { points: [[start.x, start.y]] } : { start, end: start };
    setDraft({ ...current, mode: make.mode, kind: make.kind });

    const onMove = (e) => {
      const point = pointAt(e);
      current = make.mode === 'free' ? { points: [...current.points, [point.x, point.y]] } : { start, end: point };
      setDraft({ ...current, mode: make.mode, kind: make.kind });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDraft(null);
      if (make.mode === 'free') {
        if (current.points.length > 1) onCreate({ kind: 'draw', points: current.points });
        return;
      }
      const { end } = current;
      if (make.mode === 'line') {
        if (Math.hypot(end.x - start.x, end.y - start.y) > MIN_SIZE) {
          onCreate({ kind: 'line', arrow: make.arrow, points: [[start.x, start.y], [end.x, end.y]] });
        }
        return;
      }
      let x = Math.min(start.x, end.x);
      let y = Math.min(start.y, end.y);
      let width = Math.abs(end.x - start.x);
      let height = Math.abs(end.y - start.y);
      if (width < MIN_SIZE * 2 && height < MIN_SIZE * 2) {
        const [w, h] = CLICK_SIZES[make.kind] || [0.25, 0.08];
        width = w;
        // Marks and notes are square on the page
        height = h ?? (w * size.width) / size.height;
        x = clamp(start.x - (h === null ? width / 2 : 0), 0, 1 - width);
        y = clamp(start.y - height / 2, 0, 1 - height);
      }
      onCreate({
        kind: make.kind, ...(make.mark ? { mark: make.mark } : {}),
        x, y, width: Math.max(width, MIN_SIZE), height: Math.max(height, MIN_SIZE),
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // --- moving and resizing --------------------------------------------------------------
  const startDrag = (event, item, mode) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(item.id);
    onBeginChange();
    const box = overlayRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...item };
    const onMove = (e) => {
      const dx = (e.clientX - startX) / (box.width || 1);
      const dy = (e.clientY - startY) / (box.height || 1);
      if (start.points) {
        const area = pointsBox(start.points, 0);
        const mx = clamp(dx, -area.x, 1 - area.x2);
        const my = clamp(dy, -area.y, 1 - area.y2);
        onChange(item.id, { points: start.points.map(([px, py]) => [px + mx, py + my]) });
      } else if (mode === 'move') {
        onChange(item.id, {
          x: clamp(start.x + dx, 0, 1 - start.width),
          y: clamp(start.y + dy, 0, 1 - start.height),
        });
      } else {
        const width = clamp(start.width + dx, MIN_SIZE, 1 - start.x);
        // Images, marks and notes keep their proportions
        const keep = item.kind === 'image' || item.kind === 'mark' || item.kind === 'note';
        const height = keep
          ? clamp((start.height * width) / start.width, MIN_SIZE, 1 - start.y)
          : clamp(start.height + dy, MIN_SIZE, 1 - start.y);
        onChange(item.id, keep ? { width: (height * start.width) / start.height, height } : { width, height });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onItemKey = (event, item) => {
    if (event.target.tagName === 'TEXTAREA') return;
    const step = event.shiftKey ? 0.05 : 0.005;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key] && !item.points) {
      event.preventDefault();
      onBeginChange();
      const [dx, dy] = moves[event.key];
      onChange(item.id, {
        x: clamp(item.x + dx, 0, 1 - item.width),
        y: clamp(item.y + dy, 0, 1 - item.height),
      });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove(item.id);
    }
  };

  // --- the PDF's own form fields ---------------------------------------------------------
  const renderField = (field) => {
    const value = fieldValue(field, formValues);
    const style = {
      left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%`,
      fontSize: stageHeight ? `${Math.min(field.height * stageHeight * 0.65, 16)}px` : undefined,
    };
    const common = { 'aria-label': `Form field ${field.name}`, onPointerDown: (e) => e.stopPropagation() };
    if (field.type === 'checkbox') {
      return (
        <input key={field.id} type='checkbox' className='edit-pdf__field edit-pdf__field--check' style={style} {...common}
          checked={value === true || value === field.onValue}
          onChange={(e) => onFormChange(field.name, e.target.checked)} />
      );
    }
    if (field.type === 'radio') {
      return (
        <input key={field.id} type='radio' className='edit-pdf__field edit-pdf__field--check' style={style} {...common}
          aria-label={`${field.name}: ${field.onValue}`}
          checked={value === field.onValue}
          onChange={() => onFormChange(field.name, field.onValue)} />
      );
    }
    if (field.type === 'choice') {
      return (
        <select key={field.id} className='edit-pdf__field' style={style} {...common} value={value || ''}
          onChange={(e) => onFormChange(field.name, e.target.value)}>
          <option value='' />
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return field.multiline ? (
      <textarea key={field.id} className='edit-pdf__field' style={style} {...common} value={value || ''}
        onChange={(e) => onFormChange(field.name, e.target.value)} />
    ) : (
      <input key={field.id} type='text' className='edit-pdf__field' style={style} {...common} value={value || ''}
        onChange={(e) => onFormChange(field.name, e.target.value)} />
    );
  };

  // --- the page's own lines of text (Edit text) ---------------------------------------------
  const editedLines = new Set(items.map((i) => i.lineKey).filter(Boolean));
  const renderLine = (line, index) => {
    const lineKey = `${page.key}:${index}`;
    if (editedLines.has(lineKey)) return null;
    return (
      <button
        key={lineKey}
        type='button'
        className='edit-pdf__line'
        aria-label={`Edit text: ${line.text}`}
        style={{
          left: `${line.x * 100}%`, top: `${line.y * 100}%`,
          width: `${line.width * 100}%`, height: `${line.height * 100}%`,
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onEditLine(line, lineKey)}
      />
    );
  };

  const draftBox = draft?.mode === 'box' && {
    left: `${Math.min(draft.start.x, draft.end.x) * 100}%`,
    top: `${Math.min(draft.start.y, draft.end.y) * 100}%`,
    width: `${Math.abs(draft.end.x - draft.start.x) * 100}%`,
    height: `${Math.abs(draft.end.y - draft.start.y) * 100}%`,
  };
  const draftPoints = draft?.mode === 'free'
    ? draft.points
    : draft?.mode === 'line' && [[draft.start.x, draft.start.y], [draft.end.x, draft.end.y]];

  return (
    <div className='edit-pdf__stage' ref={stageRef}>
      <div className={`edit-pdf__page ${zoom ? 'edit-pdf__page--zoomed' : ''}`}
        style={{ width: stageWidth || undefined, height: stageHeight }}>
        <canvas ref={canvasRef} className='edit-pdf__canvas' aria-label={pageLabel} />
        <div
          className={`edit-pdf__overlay edit-pdf__overlay--${tool} ${creation(tool, shape, mark) ? 'edit-pdf__overlay--creating' : ''}`}
          ref={overlayRef}
          data-testid='edit-overlay'
          onPointerDown={startCreate}
        >
          {/* Previews of the watermark and page number (added to every page when saved) */}
          {watermark && (
            <span
              className='edit-pdf__watermark'
              aria-hidden='true'
              style={{
                color: watermark.color,
                opacity: watermark.opacity,
                fontSize: stageWidth ? `${watermark.size * Math.min(stageWidth, stageHeight)}px` : undefined,
                transform: `translate(-50%, -50%) rotate(${watermark.diagonal ? -Math.atan2(size.height, size.width) : 0}rad)`,
              }}
            >
              {watermark.text}
            </span>
          )}
          {pageNumber && (
            <span
              className={`edit-pdf__page-number edit-pdf__page-number--${pageNumber.position}`}
              aria-label={`Page number: ${pageNumber.label}`}
              style={{ fontSize: stageHeight ? `${(pageNumber.size / size.height) * stageHeight}px` : undefined }}
            >
              {pageNumber.label}
            </span>
          )}
          {fields.map(renderField)}
          {items.map((item) => (
            <PageItem
              key={item.id}
              item={item}
              image={images[item.imageId]}
              selected={selectedId === item.id}
              stageWidth={stageWidth}
              stageHeight={stageHeight}
              onPointerDown={(e) => startDrag(e, item, 'move')}
              onResize={(e) => startDrag(e, item, 'resize')}
              onKeyDown={(e) => onItemKey(e, item)}
              onFocus={() => onSelect(item.id)}
              onRemove={() => onRemove(item.id)}
              onText={(text) => onChange(item.id, { text })}
              onTextFocus={onBeginChange}
            />
          ))}
          {tool === 'edittext' && lines?.map(renderLine)}
          {draftBox && <div className={`edit-pdf__draft edit-pdf__draft--${draft.kind}`} style={draftBox} />}
          {draftPoints && (
            <svg className='edit-pdf__draft-line' viewBox='0 0 1 1' preserveAspectRatio='none' aria-hidden='true'>
              <polyline points={draftPoints.map(([x, y]) => `${x},${y}`).join(' ')} fill='none' stroke='#2563eb'
                vectorEffect='non-scaling-stroke' strokeWidth='2' />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

export default PageEditor;
