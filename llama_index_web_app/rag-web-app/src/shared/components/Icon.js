/**
 * Icon Component
 * Small set of outline icons (24x24, stroke-based) used across the app
 */

import React from 'react';

const PATHS = {
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
