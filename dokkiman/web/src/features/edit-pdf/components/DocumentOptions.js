/**
 * Document Options
 * In the tools panel: a watermark across every page, and page numbers. Both
 * are previewed on the page and added when saving.
 */

import React from 'react';
import { NUMBER_FORMATS, NUMBER_POSITIONS } from '../editModel';

const WATERMARK_COLORS = ['#dc2626', '#2563eb', '#111827', '#16a34a', '#64748b'];

const DocumentOptions = ({ options, onChange }) => {
  const { watermark, page_numbers: numbers } = options;
  const setWatermark = (changes) => onChange({ watermark: { ...watermark, ...changes } });
  const setNumbers = (changes) => onChange({ page_numbers: { ...numbers, ...changes } });

  return (
    <div className='edit-pdf__options'>
      <label className='edit-pdf__option-switch'>
        <input type='checkbox' checked={watermark.enabled} onChange={(e) => setWatermark({ enabled: e.target.checked })} />
        Watermark
      </label>
      {watermark.enabled && (
        <div className='edit-pdf__option-body'>
          <input
            className='edit-pdf__option-input'
            aria-label='Watermark text'
            value={watermark.text}
            maxLength={60}
            onChange={(e) => setWatermark({ text: e.target.value })}
          />
          <span className='edit-pdf__style-group'>
            {WATERMARK_COLORS.map((c) => (
              <button
                key={c}
                type='button'
                className={`edit-pdf__swatch ${watermark.color === c ? 'edit-pdf__swatch--active' : ''}`}
                style={{ background: c }}
                aria-label={`Watermark color ${c}`}
                aria-pressed={watermark.color === c}
                onClick={() => setWatermark({ color: c })}
              />
            ))}
          </span>
          <label className='edit-pdf__style-label edit-pdf__option-range'>
            See-through
            <input
              type='range'
              min='0.1'
              max='0.8'
              step='0.05'
              aria-label='Watermark strength'
              value={watermark.opacity}
              onChange={(e) => setWatermark({ opacity: Number(e.target.value) })}
            />
            Solid
          </label>
          <label className='edit-pdf__style-label edit-pdf__option-check'>
            <input type='checkbox' checked={watermark.diagonal} onChange={(e) => setWatermark({ diagonal: e.target.checked })} />
            Diagonal
          </label>
        </div>
      )}

      <label className='edit-pdf__option-switch'>
        <input type='checkbox' checked={numbers.enabled} onChange={(e) => setNumbers({ enabled: e.target.checked })} />
        Page numbers
      </label>
      {numbers.enabled && (
        <div className='edit-pdf__option-body'>
          <label className='edit-pdf__style-label'>
            Style
            <select value={numbers.format} onChange={(e) => setNumbers({ format: e.target.value })}>
              {NUMBER_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label className='edit-pdf__style-label'>
            Where
            <select value={numbers.position} onChange={(e) => setNumbers({ position: e.target.value })}>
              {NUMBER_POSITIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className='edit-pdf__style-label'>
            Start at
            <input
              type='number'
              min='1'
              className='edit-pdf__option-input edit-pdf__option-input--short'
              value={numbers.start}
              onChange={(e) => setNumbers({ start: e.target.value })}
            />
          </label>
          <label className='edit-pdf__style-label edit-pdf__option-check'>
            <input type='checkbox' checked={numbers.skip_first}
              onChange={(e) => setNumbers({ skip_first: e.target.checked })} />
            Not on the first page
          </label>
        </div>
      )}
    </div>
  );
};

export default DocumentOptions;
