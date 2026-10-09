/**
 * Style Bar
 * Under the tools: the choices for the current tool (which shape or mark, sign
 * options) and the style of what's selected or about to be added (color, font,
 * size, bold/italic/underline, alignment, line width), with a short hint.
 * Always shown, so the page doesn't jump when the tool changes.
 */

import React from 'react';
import { COLORS, FONT_SIZES, FONTS, MARKS, POINTS_PER_PAGE, SHAPES, STROKES } from '../editModel';

const HINTS = {
  select: 'Click something you added to change it. Fill in form fields right on the page.',
  edittext: 'Click a line of text on the page to change it.',
  text: 'Click on the page where the text should go, then type.',
  sign: 'Add your signature, initials or today’s date, then drag it into place.',
  shapes: 'Drag across the page to add it. Use Select to move or change it.',
  marks: 'Click where the mark should go. Use Select to move it.',
  highlight: 'Drag across the text to highlight it.',
  draw: 'Draw on the page with your mouse, finger or pen.',
  whiteout: 'Drag across what to cover. It’s hidden, but still in the file: use Redact for private details.',
  redact: 'Drag across what to black out. It’s removed from the file for good when you save.',
};

const Toggle = ({ label, pressed, onClick, children, className = '' }) => (
  <button type='button' className={`edit-pdf__toggle ${pressed ? 'edit-pdf__toggle--active' : ''} ${className}`}
    aria-label={label} aria-pressed={pressed} onClick={onClick}>
    {children}
  </button>
);

const StyleBar = ({
  tool, selected, styleKind, style, onStyle, shapeId, onShape, markId, onMark, onSign, hasSignature, hasInitials,
  onChangeSignature, hint,
}) => {
  const colorKinds = ['text', 'highlight', 'rect', 'ellipse', 'line', 'draw', 'mark'];
  const points = Math.round((style.font_size || 0) * POINTS_PER_PAGE);

  return (
    <div className='edit-pdf__style' role='group' aria-label='Style'>
      {!selected && tool === 'shapes' && SHAPES.map((s) => (
        <Toggle key={s.id} label={s.label} pressed={shapeId === s.id} onClick={() => onShape(s.id)}>{s.label}</Toggle>
      ))}
      {!selected && tool === 'marks' && MARKS.map((m) => (
        <Toggle key={m.id} label={m.label} pressed={markId === m.id} onClick={() => onMark(m.id)}
          className='edit-pdf__toggle--symbol'>
          {m.symbol}
        </Toggle>
      ))}
      {!selected && tool === 'sign' && (
        <>
          <button type='button' className='edit-pdf__toggle' onClick={() => onSign('signature')}>Signature</button>
          <button type='button' className='edit-pdf__toggle' onClick={() => onSign('initials')}>Initials</button>
          <button type='button' className='edit-pdf__toggle' onClick={() => onSign('date')}>Date</button>
          {(hasSignature || hasInitials) && (
            <span className='edit-pdf__style-label'>
              Change:
              {hasSignature && <button type='button' className='edit-pdf__link' onClick={() => onChangeSignature('signature')}>signature</button>}
              {hasInitials && <button type='button' className='edit-pdf__link' onClick={() => onChangeSignature('initials')}>initials</button>}
            </span>
          )}
        </>
      )}

      {colorKinds.includes(styleKind) && (
        <span className='edit-pdf__style-group'>
          <span className='edit-pdf__style-label'>Color</span>
          {COLORS.filter((c) => styleKind !== 'highlight' || c !== '#ffffff').map((c) => (
            <button
              key={c}
              type='button'
              className={`edit-pdf__swatch ${style.color === c ? 'edit-pdf__swatch--active' : ''}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              aria-pressed={style.color === c}
              onClick={() => onStyle({ color: c })}
            />
          ))}
        </span>
      )}

      {styleKind === 'text' && (
        <span className='edit-pdf__style-group'>
          <label className='edit-pdf__style-label'>
            Font
            <select value={style.font || 'sans'} onChange={(e) => onStyle({ font: e.target.value })}>
              {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label className='edit-pdf__style-label'>
            Size
            <select
              value={FONT_SIZES.includes(points) ? points : ''}
              onChange={(e) => onStyle({ font_size: Number(e.target.value) / POINTS_PER_PAGE })}
            >
              {!FONT_SIZES.includes(points) && <option value=''>{points}</option>}
              {FONT_SIZES.map((s) => <option key={s} value={s}>{s} pt</option>)}
            </select>
          </label>
          <Toggle label='Bold' pressed={!!style.bold} onClick={() => onStyle({ bold: !style.bold })}>
            <b>B</b>
          </Toggle>
          <Toggle label='Italic' pressed={!!style.italic} onClick={() => onStyle({ italic: !style.italic })}>
            <i>I</i>
          </Toggle>
          <Toggle label='Underline' pressed={!!style.underline} onClick={() => onStyle({ underline: !style.underline })}>
            <u>U</u>
          </Toggle>
          {['left', 'center', 'right'].map((align) => (
            <Toggle key={align} label={`Align ${align}`} pressed={(style.align || 'left') === align}
              onClick={() => onStyle({ align })}>
              {align === 'left' ? '⇤' : align === 'center' ? '↔' : '⇥'}
            </Toggle>
          ))}
        </span>
      )}

      {['rect', 'ellipse', 'line', 'draw'].includes(styleKind) && (
        <label className='edit-pdf__style-label'>
          Line
          <select value={style.stroke} onChange={(e) => onStyle({ stroke: Number(e.target.value) })}>
            {!STROKES.some((s) => s.value === style.stroke) && <option value={style.stroke}>Custom</option>}
            {STROKES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      )}

      <span className='edit-pdf__hint'>
        {hint || (selected ? 'Drag to move, drag the corner to resize, Delete to remove.' : HINTS[tool])}
      </span>
    </div>
  );
};

export default StyleBar;
