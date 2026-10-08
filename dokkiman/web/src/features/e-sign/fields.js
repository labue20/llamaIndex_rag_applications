/**
 * Signers and fields for signature requests
 */

// One color per signer, so everyone can tell whose field is whose
export const SIGNER_COLORS = [
  '#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed',
  '#0891b2', '#dc2626', '#4d7c0f', '#9333ea', '#0f766e',
];

export const signerColor = (index) => SIGNER_COLORS[index % SIGNER_COLORS.length];

// Field kinds, with their default size as fractions of the page's width and height
export const FIELD_KINDS = [
  { kind: 'signature', label: 'Signature', width: 0.3, height: 0.055 },
  { kind: 'initials', label: 'Initials', width: 0.11, height: 0.045 },
  { kind: 'date', label: 'Date', width: 0.18, height: 0.026 },
  { kind: 'name', label: 'Name', width: 0.26, height: 0.026 },
];

export const fieldLabel = (kind) => FIELD_KINDS.find((f) => f.kind === kind)?.label || kind;

export const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Signer';

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// "Waiting for signatures", "Completed"...
export const REQUEST_STATUS = {
  sent: 'Waiting for signatures',
  completing: 'Finishing…',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const SIGNER_STATUS = {
  waiting: 'Waiting for their turn',
  sent: 'Email sent',
  viewed: 'Opened',
  signed: 'Signed',
  declined: 'Declined',
};

export const formatDate = (value) => {
  if (!value) return '';
  // Server times are UTC, either ISO or "YYYY-MM-DD HH:MM:SS"
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
