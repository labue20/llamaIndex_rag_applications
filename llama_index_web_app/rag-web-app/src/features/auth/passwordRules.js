/**
 * Password rules shared by sign-up and Change password.
 * The server checks the same rules, and also rejects common passwords.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// Live checks shown under a new password
export const passwordChecks = (password, email = '') => {
  const lowered = password.toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const isEmail = Boolean(normalizedEmail) && [normalizedEmail, normalizedEmail.split('@')[0]].includes(lowered);
  return [
    { id: 'length', label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: password.length >= MIN_PASSWORD_LENGTH },
    { id: 'email', label: 'Not your email address', ok: password.length > 0 && !isEmail },
  ];
};

// The message for the first unmet rule, or null
export const passwordProblem = (password, email = '') => {
  const unmet = passwordChecks(password, email).find((check) => !check.ok);
  if (!unmet) return null;
  return unmet.id === 'length'
    ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    : "Your password can't be your email address.";
};
