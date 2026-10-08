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
