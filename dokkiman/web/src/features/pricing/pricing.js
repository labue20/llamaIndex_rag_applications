/**
 * Prices and the "upgrade to Pro" email, shared by the pricing page and the
 * Upgrade dialog. Prices come from the server (GET /plans).
 */

// $9, $7.50
export const formatPrice = (amount) =>
  `$${Number.isInteger(amount) ? amount : Number(amount).toFixed(2)}`;

// Yearly billing: the monthly equivalent and how much is saved against 12 monthly payments
export const yearlySavings = (monthly, yearly) => ({
  perMonth: Math.round((yearly / 12) * 100) / 100,
  saved: Math.round((monthly * 12 - yearly) * 100) / 100,
});

// Until online payments exist, upgrading is done by email (see manage_users.py)
export const proUpgradeMailto = ({ supportEmail, billing, monthly, yearly, accountEmail }) => {
  if (!supportEmail) return null;
  const price = billing === 'yearly' ? `${formatPrice(yearly)} a year` : `${formatPrice(monthly)} a month`;
  const subject = `Upgrade to Pro (${billing === 'yearly' ? 'yearly' : 'monthly'})`;
  const body = [
    `Please upgrade my account to Pro, billed ${billing === 'yearly' ? 'yearly' : 'monthly'} (${price}).`,
    `Account email: ${accountEmail || '(the Google account I sign in with)'}`,
  ].join('\n');
  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
