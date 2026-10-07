/**
 * Signature Dialog
 * Create a signature (or initials) by drawing, typing or uploading an image.
 * Calls onDone({ dataUrl, aspect }) with a PNG trimmed to the ink, where
 * aspect = height / width.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../../shared';

const SCRIPT_FONT = '"Dancing Script", "Segoe Script", "Brush Script MT", cursive';
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const INK = '#1e293b';

// Crop a canvas to its non-transparent pixels (plus a little padding)
const trimToInk = (canvas, padding = 8) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null; // nothing drawn
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);

  const out = document.createElement('canvas');
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext('2d').drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return { dataUrl: out.toDataURL('image/png'), aspect: out.height / out.width };
};

const DrawPad = ({ onChange }) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Size the canvas to its on-screen size (sharp on high-density screens)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round((rect.width || 480) * ratio));
    canvas.height = Math.max(1, Math.round((rect.height || 160) * ratio));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
    }
  }, []);

  const point = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e) => {
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  };

  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    onChange(() => trimToInk(canvasRef.current));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className='sig-dialog__pad-wrap'>
      <canvas
        ref={canvasRef}
        className='sig-dialog__pad'
        aria-label='Draw your signature here'
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className='sig-dialog__pad-line' aria-hidden='true' />
      {!hasInk && <span className='sig-dialog__pad-hint'>Draw here with your mouse or finger</span>}
      <button type='button' className='sig-dialog__link' onClick={clear} disabled={!hasInk}>
        Clear
      </button>
    </div>
  );
};

const TypedSignature = ({ onChange, kind }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (!name.trim()) {
      onChange(null);
      return;
    }
    onChange(async () => {
      await document.fonts?.load?.(`64px ${SCRIPT_FONT}`);
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.font = `600 120px ${SCRIPT_FONT}`;
      ctx.fillStyle = INK;
      ctx.textBaseline = 'middle';
      ctx.fillText(name.trim(), 20, 120, 1160);
      return trimToInk(canvas);
    });
  }, [name, onChange]);

  return (
    <div className='sig-dialog__typed'>
      <label className='sig-dialog__label' htmlFor='sig-typed-name'>
        {kind === 'initials' ? 'Your initials' : 'Your full name'}
      </label>
      <input
        id='sig-typed-name'
        className='sig-dialog__input'
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        placeholder={kind === 'initials' ? 'e.g. W.L.' : 'e.g. Jane Smith'}
        autoFocus
      />
      <div className='sig-dialog__preview' style={{ fontFamily: SCRIPT_FONT }} aria-label='Preview'>
        {name.trim() || <span className='sig-dialog__preview-empty'>Preview</span>}
      </div>
    </div>
  );
};

const UploadedSignature = ({ onChange }) => {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const handleFile = (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    setError('');
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setError('Use a PNG or JPEG image.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('The image is too large (2 MB at most).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        setPreview(reader.result);
        onChange(() => ({ dataUrl: reader.result, aspect: image.height / image.width }));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className='sig-dialog__upload'>
      <label className='sig-dialog__upload-btn' htmlFor='sig-upload-input'>
        <Icon name='upload' size={16} /> Choose an image
      </label>
      <input id='sig-upload-input' type='file' accept='image/png,image/jpeg' onChange={handleFile} hidden />
      <p className='sig-dialog__hint'>A photo or scan of your signature on white or transparent background works best.</p>
      {error && <p className='sig-dialog__error' role='alert'>{error}</p>}
      {preview && <img className='sig-dialog__upload-preview' src={preview} alt='Uploaded signature' />}
    </div>
  );
};

const SignatureDialog = ({ kind = 'signature', onDone, onClose }) => {
  const [tab, setTab] = useState('type');
  // A function that produces the signature image (so drawing stays cheap)
  const [produce, setProduce] = useState(null);
  const [error, setError] = useState('');

  const setProducer = React.useCallback((fn) => setProduce(() => fn), []);

  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const switchTab = (next) => {
    setTab(next);
    setProduce(null);
    setError('');
  };

  const done = async () => {
    const result = produce && (await produce());
    if (!result) {
      setError(tab === 'draw' ? 'Draw your signature first.' : 'Add your signature first.');
      return;
    }
    onDone(result);
  };

  const title = kind === 'initials' ? 'Create your initials' : 'Create your signature';
  const tabs = [
    { id: 'type', label: 'Type' },
    { id: 'draw', label: 'Draw' },
    { id: 'upload', label: 'Upload' },
  ];

  return createPortal(
    <div className='sig-dialog-overlay' onClick={onClose}>
      <div
        className='sig-dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby='sig-dialog-title'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='sig-dialog__header'>
          <h2 id='sig-dialog-title' className='sig-dialog__title'>{title}</h2>
          <button type='button' className='sig-dialog__close' onClick={onClose} aria-label='Close'>×</button>
        </div>

        <div className='sig-dialog__tabs' role='tablist'>
          {tabs.map((t) => (
            <button
              key={t.id}
              type='button'
              role='tab'
              aria-selected={tab === t.id}
              className={`sig-dialog__tab ${tab === t.id ? 'sig-dialog__tab--active' : ''}`}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className='sig-dialog__body'>
          {tab === 'type' && <TypedSignature onChange={setProducer} kind={kind} />}
          {tab === 'draw' && <DrawPad onChange={setProducer} />}
          {tab === 'upload' && <UploadedSignature onChange={setProducer} />}
          {error && <p className='sig-dialog__error' role='alert'>{error}</p>}
        </div>

        <div className='sig-dialog__footer'>
          <p className='sig-dialog__consent'>
            By adding it, you agree this is your electronic {kind === 'initials' ? 'initials' : 'signature'}.
          </p>
          <div className='sig-dialog__actions'>
            <button type='button' className='sig-dialog__secondary' onClick={onClose}>Cancel</button>
            <button type='button' className='sig-dialog__primary' onClick={done} disabled={!produce}>
              Add {kind === 'initials' ? 'initials' : 'signature'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SignatureDialog;
