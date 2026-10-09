/**
 * Icon Component
 * Small set of outline icons (24x24, stroke-based) used across the app
 */

import React from 'react';

const PATHS = {
  search: (
    <>
      <circle cx='11' cy='11' r='7' />
      <path d='M20 20l-3.5-3.5' />
    </>
  ),
  file: (
    <>
      <path d='M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' />
      <path d='M14 3v5h5M9 13h6M9 17h4' />
    </>
  ),
  folder: (
    <path d='M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' />
  ),
  chat: (
    <>
      <path d='M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.4A8 8 0 1 1 21 12z' />
      <path d='M8.5 12h.01M12 12h.01M15.5 12h.01' />
    </>
  ),
  fileToWord: (
    <>
      <path d='M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' />
      <path d='M14 3v5h5' />
      <path d='M9 13l1.2 4 1.8-3 1.8 3 1.2-4' />
    </>
  ),
  fileToPdf: (
    <>
      <path d='M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' />
      <path d='M14 3v5h5' />
      <path d='M12 11v6M9.5 14.5L12 17l2.5-2.5' />
    </>
  ),
  scissors: (
    <>
      <circle cx='6' cy='6' r='3' />
      <circle cx='6' cy='18' r='3' />
      <path d='M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12' />
    </>
  ),
  layers: (
    <>
      <path d='M12 3l9 5-9 5-9-5z' />
      <path d='M3 13l9 5 9-5' />
    </>
  ),
  arrowUp: <path d='M12 19V5M5 12l7-7 7 7' />,
  copy: (
    <>
      <rect x='9' y='9' width='12' height='12' rx='2' />
      <path d='M5 15V5a2 2 0 0 1 2-2h10' />
    </>
  ),
  check: <path d='M5 12.5l4.5 4.5L19 7.5' />,
  sparkle: (
    <path d='M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z' />
  ),
  lock: (
    <>
      <rect x='5' y='11' width='14' height='10' rx='2' />
      <path d='M8 11V8a4 4 0 0 1 8 0v3' />
    </>
  ),
  arrowLeft: <path d='M19 12H5M11 18l-6-6 6-6' />,
  // Pen writing a signature line
  edit: (
    <>
      <path d='M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' />
      <path d='M14 3v5h5' />
      <path d='M14.5 11.5l2 2L11 19l-2.5.5.5-2.5z' />
    </>
  ),
  // Edit PDF tools
  pointer: <path d='M5 3l14 7.5-6.2 1.7L10 18.5z' />,
  textCursor: (
    <>
      <path d='M4 6V4h10v2M9 4v14M7 18h4' />
      <path d='M17 9v10M15.5 9h3M15.5 19h3' />
    </>
  ),
  type: <path d='M5 7V5h14v2M12 5v14M9 19h6' />,
  shapes: (
    <>
      <rect x='3' y='3' width='10' height='10' rx='1' />
      <circle cx='15.5' cy='15.5' r='5.5' />
    </>
  ),
  marks: (
    <>
      <path d='M3.5 8.5l2.5 2.5 5-5.5' />
      <path d='M14 4l6 6M20 4l-6 6' />
      <circle cx='7' cy='17' r='3' />
      <path d='M14.5 17h6' />
    </>
  ),
  highlighter: (
    <>
      <path d='M14.5 4.5l5 5-8 8H6.5v-5z' />
      <path d='M4 20h16' />
    </>
  ),
  draw: <path d='M3 17c3-6 5-9 7-9s1 6 3 6 3-7 5-7 2 3 3 4' />,
  eraser: (
    <>
      <path d='M8 20l-4.5-4.5a1.5 1.5 0 0 1 0-2.1L13 4l7 7-9 9z' />
      <path d='M8 20h12M9.5 9.5l7 7' />
    </>
  ),
  redact: (
    <>
      <rect x='3' y='5' width='18' height='5' rx='1' fill='currentColor' />
      <path d='M3 15h12M3 19h8' />
    </>
  ),
  image: (
    <>
      <rect x='3' y='4' width='18' height='16' rx='2' />
      <circle cx='9' cy='10' r='1.75' />
      <path d='M21 16l-5-5-9 9' />
    </>
  ),
  compress: (
    <>
      <path d='M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7' />
    </>
  ),
  note: (
    <>
      <path d='M5 4h14a1 1 0 0 1 1 1v9.5L14.5 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z' />
      <path d='M14 20v-5a1 1 0 0 1 1-1h5M8 9h8M8 12.5h4' />
    </>
  ),
  undo: <path d='M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3' />,
  redo: <path d='M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3' />,
  pen: (
    <>
      <path d='M15.5 4.5l4 4L9 19l-5 1 1-5z' />
      <path d='M13.5 6.5l4 4M14 20h6' />
    </>
  ),
  upload: <path d='M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3' />,
  trash: (
    <>
      <path d='M4 7h16M10 11v6M14 11v6' />
      <path d='M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' />
    </>
  ),
  refresh: <path d='M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4' />,
  zap: <path d='M13 3L5 13.5h6L10 21l8-10.5h-6z' />,
  alertTriangle: (
    <>
      <path d='M10.3 4.2L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z' />
      <path d='M12 9.5v4M12 17h.01' />
    </>
  ),
  checkCircle: (
    <>
      <circle cx='12' cy='12' r='9' />
      <path d='M8.5 12.5l2.5 2.5 4.5-5' />
    </>
  ),
  xCircle: (
    <>
      <circle cx='12' cy='12' r='9' />
      <path d='M9.5 9.5l5 5M14.5 9.5l-5 5' />
    </>
  ),
  alert: (
    <>
      <circle cx='12' cy='12' r='9' />
      <path d='M12 7.5v5M12 16.5h.01' />
    </>
  ),
};

const Icon = ({ name, size = 18, className = '' }) => {
  const path = PATHS[name];
  if (!path) return null;

  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.75'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      {path}
    </svg>
  );
};

export default Icon;
