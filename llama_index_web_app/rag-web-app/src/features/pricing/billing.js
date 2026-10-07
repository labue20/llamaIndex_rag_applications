/**
 * Stripe checkout and customer portal. The server creates the session and we
 * send the browser to Stripe's page; card details never touch this app.
 */

import { apiFetch } from '../../shared/services/apiClient';

// Leaving the app for Stripe (kept in an object so tests can stub it)
export const browser = {
  go: (url) => window.location.assign(url),
};

const postForUrl = async (path, body, fallbackMessage) => {
  let response;
  try {
    response = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    const error = new Error(data.error || fallbackMessage);
    error.code = data.code;
    throw error;
  }
  browser.go(data.url);
};

// billing: 'monthly' | 'yearly'
export const startCheckout = async (billing) => {
  try {
    await postForUrl('/billing/checkout', { billing }, "Couldn't start checkout. Please try again.");
  } catch (err) {
    // Already subscribed: open billing management instead
    if (err.code === 'already_subscribed') return openBillingPortal();
    throw err;
  }
};

export const openBillingPortal = () =>
  postForUrl('/billing/portal', {}, "Couldn't open billing. Please try again.");
