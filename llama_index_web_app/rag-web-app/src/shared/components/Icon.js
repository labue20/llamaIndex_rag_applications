/**
 * Icon Component
 * Small set of outline icons (24x24, stroke-based) used across the app
 */

import React from 'react';

const PATHS = {
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
