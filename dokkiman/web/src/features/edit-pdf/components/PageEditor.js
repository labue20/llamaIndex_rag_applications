/**
 * Page Editor
 * The current page, large, with what's been added to it on top. With a tool
 * picked, drag on the page to add a box (text, highlight, box, white-out) or
 * draw freehand; with Select, drag things to move them and their corner to
 * resize. The PDF's own form fields can be filled in place.
 */

import React, { useEffect, useRef, useState } from 'react';
import { clamp, fieldValue, formFieldsFrom, shownSize } from '../editModel';

const MIN_SIZE = 0.01;

const PageEditor = ({
  page, pdf, items, images, tool, selectedId, onSelect, onCreate, onChange, onBeginChange, onRemove, formValues,
  onFormChange, pageLabel,
}) => {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [fields, setFields] = useState([]);
  const [draft, setDraft] = useState(null); // a box or line being drawn
  const size = shownSize(page);
  const ratio = size.height / size.width;
  const stageHeight = stageWidth ? stageWidth * ratio : undefined;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => setStageWidth(Math.min(stage.clientWidth, 900));
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
    if (tool === 'select') {
      onSelect(null);
      return;
    }
    if (event.target !== overlayRef.current) return;
    event.preventDefault();
    const start = pointAt(event);
    let current = tool === 'draw' ? { points: [[start.x, start.y]] } : { start, end: start };
    setDraft(current);

    const onMove = (e) => {
      const point = pointAt(e);
      current = tool === 'draw'
        ? { points: [...current.points, [point.x, point.y]] }
        : { start, end: point };
      setDraft(current);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDraft(null);
      if (tool === 'draw') {
        if (current.points.length > 1) onCreate({ kind: 'draw', points: current.points });
        return;
      }
      const { end } = current;
      let x = Math.min(start.x, end.x);
      let y = Math.min(start.y, end.y);
      let width = Math.abs(end.x - start.x);
      let height = Math.abs(end.y - start.y);
      // A click (no drag): a box of a useful size where it was clicked
      if (width < MIN_SIZE * 2 && height < MIN_SIZE * 2) {
        width = tool === 'text' ? 0.4 : 0.25;
        height = tool === 'text' ? 0.045 : tool === 'highlight' ? 0.025 : 0.08;
        x = clamp(start.x, 0, 1 - width);
        y = clamp(start.y - height / 2, 0, 1 - height);
      }
      onCreate({ kind: tool, x, y, width: Math.max(width, MIN_SIZE), height: Math.max(height, MIN_SIZE) });
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
      if (item.kind === 'draw') {
        const xs = start.points.map((p) => p[0]);
        const ys = start.points.map((p) => p[1]);
        const mx = clamp(dx, -Math.min(...xs), 1 - Math.max(...xs));
        const my = clamp(dy, -Math.min(...ys), 1 - Math.max(...ys));
        onChange(item.id, { points: start.points.map(([px, py]) => [px + mx, py + my]) });
      } else if (mode === 'move') {
        onChange(item.id, {
          x: clamp(start.x + dx, 0, 1 - start.width),
          y: clamp(start.y + dy, 0, 1 - start.height),
        });
      } else {
        const width = clamp(start.width + dx, MIN_SIZE, 1 - start.x);
        // Images keep their proportions
        const height = item.kind === 'image'
          ? clamp((start.height * width) / start.width, MIN_SIZE, 1 - start.y)
          : clamp(start.height + dy, MIN_SIZE, 1 - start.y);
        onChange(item.id, item.kind === 'image' ? { width: (height * start.width) / start.height, height } : { width, height });
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
    if (moves[event.key] && item.kind !== 'draw') {
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

  const px = (fraction) => (stageHeight ? `${fraction * stageHeight}px` : undefined);

  const renderItem = (item) => {
    const selected = selectedId === item.id;
    const common = {
      role: 'button',
      tabIndex: 0,
      'aria-label': `${item.kind === 'whiteout' ? 'white-out' : item.kind === 'rect' ? 'box' : item.kind}${item.kind === 'text' && item.text ? `: ${item.text.slice(0, 30)}` : ''}`,
      'aria-pressed': selected,
      onKeyDown: (e) => onItemKey(e, item),
      onFocus: () => onSelect(item.id),
    };
    if (item.kind === 'draw') {
      const xs = item.points.map((p) => p[0]);
      const ys = item.points.map((p) => p[1]);
      const pad = item.stroke;
      const box = {
        x: Math.max(0, Math.min(...xs) - pad), y: Math.max(0, Math.min(...ys) - pad),
        x2: Math.min(1, Math.max(...xs) + pad), y2: Math.min(1, Math.max(...ys) + pad),
      };
      return (
        <div
          key={item.id}
          {...common}
          className={`edit-pdf__item edit-pdf__item--draw ${selected ? 'edit-pdf__item--selected' : ''}`}
          style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${(box.x2 - box.x) * 100}%`, height: `${(box.y2 - box.y) * 100}%` }}
          onPointerDown={(e) => startDrag(e, item, 'move')}
        >
          <svg viewBox={`${box.x} ${box.y} ${box.x2 - box.x} ${box.y2 - box.y}`} preserveAspectRatio='none' aria-hidden='true'>
            <polyline
              points={item.points.map(([x, y]) => `${x},${y}`).join(' ')}
              fill='none'
              stroke={item.color}
              strokeLinecap='round'
              strokeLinejoin='round'
              vectorEffect='non-scaling-stroke'
              style={{ strokeWidth: stageWidth ? item.stroke * stageWidth : 2 }}
            />
          </svg>
          {selected && <RemoveButton onRemove={() => onRemove(item.id)} />}
        </div>
      );
    }
    const style = {
      left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%`,
    };
    if (item.kind === 'highlight') style.background = `${item.color}66`;
    if (item.kind === 'rect') style.border = `${Math.max(1, item.stroke * (stageWidth || 600))}px solid ${item.color}`;
    return (
      <div
        key={item.id}
        {...common}
        className={`edit-pdf__item edit-pdf__item--${item.kind} ${selected ? 'edit-pdf__item--selected' : ''}`}
        style={style}
        onPointerDown={(e) => {
          if (e.target.tagName === 'TEXTAREA' && selected) return;
          startDrag(e, item, 'move');
        }}
      >
        {item.kind === 'text' && (selected ? (
          <textarea
            className='edit-pdf__text'
            aria-label='Text'
            value={item.text}
            placeholder='Type here'
            autoFocus={!item.text}
            style={{ fontSize: px(item.font_size), color: item.color, fontWeight: item.bold ? 700 : 400 }}
            onFocus={onBeginChange}
            onChange={(e) => onChange(item.id, { text: e.target.value })}
          />
        ) : (
          <span className='edit-pdf__text' style={{ fontSize: px(item.font_size), color: item.color, fontWeight: item.bold ? 700 : 400 }}>
            {item.text || <span className='edit-pdf__placeholder'>Type here</span>}
          </span>
        ))}
        {item.kind === 'image' && <img src={images[item.imageId]?.dataUrl} alt='' draggable={false} />}
        {selected && (
          <>
            <RemoveButton onRemove={() => onRemove(item.id)} />
            <span className='edit-pdf__resize' aria-hidden='true' onPointerDown={(e) => startDrag(e, item, 'resize')} />
          </>
        )}
      </div>
    );
  };

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

  const draftBox = draft && !draft.points && {
    left: `${Math.min(draft.start.x, draft.end.x) * 100}%`,
    top: `${Math.min(draft.start.y, draft.end.y) * 100}%`,
    width: `${Math.abs(draft.end.x - draft.start.x) * 100}%`,
    height: `${Math.abs(draft.end.y - draft.start.y) * 100}%`,
  };

  return (
    <div className='edit-pdf__stage' ref={stageRef}>
      <div className='edit-pdf__page' style={{ width: stageWidth || undefined, height: stageHeight }}>
        <canvas ref={canvasRef} className='edit-pdf__canvas' aria-label={pageLabel} />
        <div
          className={`edit-pdf__overlay edit-pdf__overlay--${tool}`}
          ref={overlayRef}
          data-testid='edit-overlay'
          onPointerDown={startCreate}
        >
          {fields.map(renderField)}
          {items.map(renderItem)}
          {draftBox && <div className={`edit-pdf__draft edit-pdf__draft--${tool}`} style={draftBox} />}
          {draft?.points && (
            <svg className='edit-pdf__draft-line' viewBox='0 0 1 1' preserveAspectRatio='none' aria-hidden='true'>
              <polyline points={draft.points.map(([x, y]) => `${x},${y}`).join(' ')} fill='none' stroke='#2563eb'
                vectorEffect='non-scaling-stroke' strokeWidth='2' />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

const RemoveButton = ({ onRemove }) => (
  <button
    type='button'
    className='edit-pdf__remove'
    aria-label='Remove'
    onPointerDown={(e) => e.stopPropagation()}
    onClick={onRemove}
  >
    ×
  </button>
);

export default PageEditor;
