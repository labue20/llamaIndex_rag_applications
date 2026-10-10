/**
 * Page Grid
 * A preview of every page of the PDF being split. Pages are drawn as they
 * scroll into view, so long PDFs open quickly. Clicking a page picks it (or
 * unpicks it); each page shows where it's going: which file, or picked.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../shared';

const THUMB_WIDTH = 120;

const Thumbnail = ({ pdf, pageNumber }) => {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);
  const [isVisible, setIsVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [aspect, setAspect] = useState(1.294); // US Letter until the page says otherwise

  // Draw only once the page is (nearly) on screen
  useEffect(() => {
    if (isVisible || !holderRef.current) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setIsVisible(true);
    }, { rootMargin: '300px' });
    observer.observe(holderRef.current);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || !pdf) return undefined;
    let cancelled = false;
    let task = null;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvasRef.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (THUMB_WIDTH / base.width) * (window.devicePixelRatio || 1) });
      setAspect(base.height / base.width);
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      task = page.render({ canvasContext: context, viewport });
      try {
        await task.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') console.error('Page preview failed:', err);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [isVisible, pdf, pageNumber]);

  return (
    <span className='split-page__paper' ref={holderRef} style={{ aspectRatio: `1 / ${aspect}` }}>
      {isVisible && <canvas ref={canvasRef} aria-hidden='true' />}
    </span>
  );
};

const PageGrid = ({ pdf, pageCount, mode, parts, disabled, onToggle }) => (
  <ol className='split-pages' aria-label='Page previews'>
    {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNumber) => {
      const part = parts.get(pageNumber);
      const picked = mode !== 'every' && !!part;
      let tag = null;
      if (mode === 'every') tag = `File ${pageNumber}`;
      else if (mode === 'ranges' && part) tag = `File ${part}`;
      return (
        <li key={pageNumber}>
          <button
            type='button'
            className={`split-page ${picked ? 'split-page--picked' : ''} ${mode !== 'every' && !picked ? 'split-page--left-out' : ''}`}
            aria-pressed={mode === 'every' ? undefined : picked}
            aria-label={`Page ${pageNumber}`}
            onClick={() => onToggle(pageNumber)}
            disabled={disabled}
          >
            <Thumbnail pdf={pdf} pageNumber={pageNumber} />
            {picked && mode === 'extract' && (
              <span className='split-page__check' aria-hidden='true'><Icon name='check' size={14} /></span>
            )}
            {tag && <span className='split-page__tag'>{tag}</span>}
            <span className='split-page__number'>{pageNumber}</span>
          </button>
        </li>
      );
    })}
  </ol>
);

export default PageGrid;
