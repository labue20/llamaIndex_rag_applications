/**
 * Prices and the "upgrade" email, shared by the pricing page and the
 * Upgrade dialog. Prices come from the server (GET /plans).
 */

// $9, $7.50, $1.99
export const formatPrice = (amount) =>
  `$${Number.isInteger(amount) ? amount : Number(amount).toFixed(2)}`;

// Yearly billing: the monthly equivalent and how much is saved against 12 monthly payments
export const yearlySavings = (monthly, yearly) => ({
  perMonth: Math.round((yearly / 12) * 100) / 100,
  saved: Math.round((monthly * 12 - yearly) * 100) / 100,
});

// Yearly saving in whole months ($90 instead of 12 x $9: 2 months free)
export const monthsFree = (monthly, yearly) =>
  (monthly > 0 ? Math.round((monthly * 12 - yearly) / monthly) : 0);

// Without online payments, upgrading is done by email (see manage_users.py).
// planName: 'Basic' | 'Pro'
export const upgradeMailto = ({ supportEmail, planName = 'Pro', billing, monthly, yearly, accountEmail }) => {
  if (!supportEmail) return null;
  const price = billing === 'yearly' ? `${formatPrice(yearly)} a year` : `${formatPrice(monthly)} a month`;
  const subject = `Upgrade to ${planName} (${billing === 'yearly' ? 'yearly' : 'monthly'})`;
  const body = [
    `Please upgrade my account to ${planName}, billed ${billing === 'yearly' ? 'yearly' : 'monthly'} (${price}).`,
    `Account email: ${accountEmail || '(the Google account I sign in with)'}`,
  ].join('\n');
  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
