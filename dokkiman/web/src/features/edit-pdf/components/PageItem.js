/**
 * Page Item
 * One thing added to a page (text, image, shape, mark, drawing...), drawn as
 * it will look in the PDF, with handles to move, resize and remove it.
 */

import React from 'react';
import { fontCss } from '../editModel';

const LABELS = {
  text: 'text', image: 'image', highlight: 'highlight', rect: 'box', ellipse: 'ellipse', line: 'line',
  draw: 'drawing', mark: 'mark', whiteout: 'white-out', redact: 'redaction',
};

const MARK_PATHS = {
  check: <polyline points='15,55 40,80 88,18' />,
  cross: <path d='M18 18 L82 82 M82 18 L18 82' />,
  circle: <ellipse cx='50' cy='50' rx='42' ry='42' />,
  dot: <ellipse cx='50' cy='50' rx='50' ry='50' className='edit-pdf__mark-fill' />,
};

export const pointsBox = (points, pad) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    x: Math.max(0, Math.min(...xs) - pad), y: Math.max(0, Math.min(...ys) - pad),
    x2: Math.min(1, Math.max(...xs) + pad), y2: Math.min(1, Math.max(...ys) + pad),
  };
};

const RemoveButton = ({ onRemove }) => (
  <button type='button' className='edit-pdf__remove' aria-label='Remove' onPointerDown={(e) => e.stopPropagation()}
    onClick={onRemove}>
    ×
  </button>
);

const PageItem = ({
  item, image, selected, stageWidth, stageHeight, onPointerDown, onResize, onKeyDown, onFocus, onRemove, onText,
  onTextFocus,
}) => {
  const label = `${LABELS[item.kind]}${item.kind === 'text' && item.text ? `: ${item.text.slice(0, 30)}` : ''}`;
  const common = {
    role: 'button', tabIndex: 0, 'aria-label': label, 'aria-pressed': selected, onKeyDown, onFocus,
  };
  const className = `edit-pdf__item edit-pdf__item--${item.kind} ${selected ? 'edit-pdf__item--selected' : ''}`;
  const px = (fraction) => (stageHeight ? `${fraction * stageHeight}px` : undefined);
  const strokePx = Math.max(1, (item.stroke || 0.003) * (stageWidth || 600));

  // Drawings and lines: an SVG over the area they cover
  if (item.kind === 'draw' || item.kind === 'line') {
    const box = pointsBox(item.points, Math.max(item.stroke * 3, 0.01));
    const w = box.x2 - box.x;
    const h = box.y2 - box.y;
    const [first, last] = [item.points[0], item.points[item.points.length - 1]];
    const angle = Math.atan2((last[1] - first[1]) * (stageHeight || 1), (last[0] - first[0]) * (stageWidth || 1));
    return (
      <div
        {...common}
        className={className}
        style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
        onPointerDown={onPointerDown}
      >
        <svg viewBox={`${box.x} ${box.y} ${w} ${h}`} preserveAspectRatio='none' aria-hidden='true'>
          <polyline
            points={item.points.map(([x, y]) => `${x},${y}`).join(' ')}
            fill='none'
            stroke={item.color}
            strokeLinecap='round'
            strokeLinejoin='round'
            vectorEffect='non-scaling-stroke'
            style={{ strokeWidth: strokePx }}
          />
        </svg>
        {item.arrow && (
          <span
            className='edit-pdf__arrowhead'
            style={{
              left: `${((last[0] - box.x) / w) * 100}%`,
              top: `${((last[1] - box.y) / h) * 100}%`,
              borderLeftColor: item.color,
              borderLeftWidth: Math.max(8, strokePx * 4),
              borderTopWidth: Math.max(4, strokePx * 2),
              borderBottomWidth: Math.max(4, strokePx * 2),
              transform: `translate(-100%, -50%) rotate(${angle}rad)`,
              transformOrigin: '100% 50%',
            }}
          />
        )}
        {selected && <RemoveButton onRemove={onRemove} />}
      </div>
    );
  }

  const style = {
    left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%`,
  };
  if (item.kind === 'highlight') style.background = `${item.color}66`;
  if (item.kind === 'rect' || item.kind === 'ellipse') style.border = `${strokePx}px solid ${item.color}`;
  const textStyle = item.kind === 'text' && {
    fontSize: px(item.font_size),
    color: item.color,
    fontFamily: fontCss(item.font),
    fontWeight: item.bold ? 700 : 400,
    fontStyle: item.italic ? 'italic' : 'normal',
    textDecoration: item.underline ? 'underline' : 'none',
    textAlign: item.align || 'left',
  };

  return (
    <>
      {/* An edited line of the PDF's own text: hide the original under the new box */}
      {item.replaces && (
        <div
          className='edit-pdf__cover'
          style={{
            left: `${item.replaces.x * 100}%`, top: `${item.replaces.y * 100}%`,
            width: `${item.replaces.width * 100}%`, height: `${item.replaces.height * 100}%`,
          }}
        />
      )}
      <div
        {...common}
        className={className}
        style={style}
        onPointerDown={(e) => {
          if (e.target.tagName === 'TEXTAREA' && selected) return;
          onPointerDown(e);
        }}
      >
        {item.kind === 'text' && (selected ? (
          <textarea
            className='edit-pdf__text'
            aria-label='Text'
            value={item.text}
            placeholder='Type here'
            autoFocus
            style={textStyle}
            onFocus={onTextFocus}
            onChange={(e) => onText(e.target.value)}
          />
        ) : (
          <span className='edit-pdf__text' style={textStyle}>
            {item.text || <span className='edit-pdf__placeholder'>{item.replaces ? 'Deleted line' : 'Type here'}</span>}
          </span>
        ))}
        {item.kind === 'image' && <img src={image?.dataUrl} alt='' draggable={false} />}
        {item.kind === 'mark' && (
          <svg viewBox='0 0 100 100' preserveAspectRatio='none' aria-hidden='true' className='edit-pdf__mark'
            style={{ color: item.color }}>
            {MARK_PATHS[item.mark]}
          </svg>
        )}
        {selected && (
          <>
            <RemoveButton onRemove={onRemove} />
            <span className='edit-pdf__resize' aria-hidden='true' onPointerDown={onResize} />
          </>
        )}
      </div>
    </>
  );
};

export default PageItem;
