/**
 * Folder Picker
 * A button that opens a searchable list of folders (by path, e.g.
 * "214 Willow Lane › Leases"), for moving documents or choosing where a
 * signature request is filed. Works with many folders, unlike a long dropdown.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../../shared';

let pickerCount = 0;

// options: [{ id, label }] (id null = "no folder"); onSelect(id)
const FolderPicker = ({
  options, onSelect, buttonLabel, buttonClassName = 'folders__btn', disabled = false, align = 'right',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const [listId] = useState(() => `folder-picker-${++pickerCount}`);

  // Close on a click outside or Escape
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (e) => !rootRef.current?.contains(e.target) && setIsOpen(false);
    const onKeyDown = (e) => e.key === 'Escape' && setIsOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((option) => words.every((word) => option.label.toLowerCase().includes(word)));
  }, [options, query]);

  const choose = (id) => {
    setIsOpen(false);
    setQuery('');
    onSelect(id);
  };

  return (
    <div className='folder-picker' ref={rootRef}>
      <button
        type='button'
        className={buttonClassName}
        aria-haspopup='listbox'
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Icon name='folder' size={14} /> <span className='folder-picker__label'>{buttonLabel}</span>
      </button>
      {isOpen && (
        <div className={`folder-picker__panel folder-picker__panel--${align}`}>
          <input
            className='folder-picker__search'
            type='search'
            placeholder='Search folders'
            aria-label='Search folders'
            aria-controls={listId}
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && shown.length > 0) {
                e.preventDefault();
                choose(shown[0].id);
              }
            }}
          />
          <ul className='folder-picker__list' role='listbox' id={listId} aria-label='Folders'>
            {shown.map((option) => (
              <li key={option.id || 'none'} role='option' aria-selected='false'>
                <button type='button' className='folder-picker__option' onClick={() => choose(option.id)}>
                  {option.label}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className='folder-picker__empty'>No folders match.</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FolderPicker;
