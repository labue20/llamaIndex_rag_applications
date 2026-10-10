/**
 * Document Menu
 * What you can do with one document: Open, Rename, Make a copy, Download, Delete.
 * Shown where the document was right-clicked, or under its ⋯ button (phones
 * have no right-click). Closes on a choice, a click elsewhere, Escape or scroll.
 * Arrow keys move between the items.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../../shared';

const MARGIN = 8;

const DocumentMenu = ({ name, x, y, items, onClose }) => {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Kept on screen: opens up or to the left when there's no room
  useLayoutEffect(() => {
    const { offsetWidth: width, offsetHeight: height } = menuRef.current;
    setPosition({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: y + height > window.innerHeight - MARGIN ? Math.max(MARGIN, y - height) : y,
    });
  }, [x, y]);

  useEffect(() => {
    menuRef.current.querySelector('[role="menuitem"]')?.focus();
    const onPointer = (e) => !menuRef.current?.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    const onScroll = (e) => !menuRef.current?.contains(e.target) && onClose();
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const moveFocus = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const next = buttons.indexOf(document.activeElement) + (e.key === 'ArrowDown' ? 1 : -1);
    buttons[(next + buttons.length) % buttons.length].focus();
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div ref={menuRef} className='doc-menu' role='menu' aria-label={`Actions for ${name}`}
      style={position} onKeyDown={moveFocus} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item) => (
        <button key={item.label} type='button' role='menuitem'
          className={`doc-menu__item ${item.danger ? 'doc-menu__item--danger' : ''}`}
          onClick={() => {
            onClose();
            item.onSelect();
          }}>
          <Icon name={item.icon} size={16} />
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default DocumentMenu;
