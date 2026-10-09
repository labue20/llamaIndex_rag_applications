/**
 * Formatting for the admin portal
 */

export const STATE_LABELS = { trial: 'Trial', free: 'Free', basic: 'Basic', pro: 'Pro' };

export const REQUEST_STATUS_LABELS = {
  sent: 'Waiting',
  completing: 'Finishing',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const ACTION_LABELS = {
  extend_trial: 'Extended trial',
  grant_plan: 'Granted plan',
  end_plan: 'Ended granted plan',
  sign_out: 'Signed out everywhere',
};

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

/** "just now", "3 h ago", "5 days ago" */
export const timeAgo = (iso, now = Date.now()) => {
  if (!iso) return 'Never';
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return minutes <= 1 ? 'Just now' : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
};

export const money = (amount) => `$${Number(amount || 0).toFixed(2)}`;

export const count = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString());
