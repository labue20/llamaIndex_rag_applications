/**
 * Logo Mark
 * The Dokkiman "D": a page with its top-right corner folded down. White, for
 * the blue logo tile; public/logo.svg is the same mark on the tile (favicon).
 */

import React from 'react';

const LogoMark = ({ size = 18 }) => (
  <svg viewBox='0 0 24 24' width={size} height={size} aria-hidden='true' focusable='false'>
    <path
      fill='currentColor'
      fillRule='evenodd'
      d='M5 3H13V7.2H17.2C18.8 8.7 19.5 10.7 19.5 12.7C19.5 17.5 16.2 21 11.2 21H5Z M8.6 8.4V17.2H11C13.9 17.2 15.8 15.5 15.8 12.7C15.8 10.1 14.4 8.4 12 8.4Z'
    />
    {/* The folded corner */}
    <path fill='currentColor' fillOpacity='0.6' d='M13 3L17.2 7.2H13Z' />
  </svg>
);

export default LogoMark;
