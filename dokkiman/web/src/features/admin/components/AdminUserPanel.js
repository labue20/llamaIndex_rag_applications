/**
 * Admin User Panel
 * One account's plan, billing, usage and recent signature requests, and the
 * changes an admin can make: extend the trial, grant or end a plan (not for
 * Stripe subscribers), and sign the account out everywhere.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch, readApiError } from '../../../shared';
import {
  ACTION_LABELS, count, formatDate, formatDateTime, REQUEST_STATUS_LABELS, STATE_LABELS, timeAgo,
} from '../format';

const Row = ({ label, children }) => (
  <div className='admin-detail__row'>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

const planText = (user) => {
  const { plan } = user;
  if (plan.state === 'trial') return `Trial, ${plan.trial_days_left} day${plan.trial_days_left === 1 ? '' : 's'} left (ends ${formatDate(plan.trial_ends_at)})`;
  if (plan.state === 'free') return `Free (trial ended ${formatDate(plan.trial_ends_at)})`;
  const name = STATE_LABELS[plan.state];
  return plan.pro_until ? `${name} until ${formatDate(plan.pro_until)}` : `${name}, no end date`;
};

const AdminUserPanel = ({ userId, onClose, onChanged }) => {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [trialDays, setTrialDays] = useState('14');
  const [grantPlan, setGrantPlan] = useState('pro');
  const [grantMonths, setGrantMonths] = useState('1');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch(`/admin/users/${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error(await readApiError(response, 'Couldn’t load this account.'));
        const data = await response.json();
        if (!cancelled) setUser(data.user);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, busy]);

  const act = async (action, body, done) => {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(`/admin/users/${encodeURIComponent(userId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'That didn’t work.'));
      setUser((await response.json()).user);
      setNotice(done);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const subscribed = user?.billing?.has_subscription && ['active', 'trialing', 'past_due'].includes(user.billing.status);
  const granted = user && ['basic', 'pro'].includes(user.state) && !subscribed;

  return createPortal(
    <div className='upgrade-overlay' onClick={() => !busy && onClose()}>
      <div
        className='upgrade-dialog admin-detail'
        role='dialog'
        aria-modal='true'
        aria-labelledby='admin-detail-title'
        onClick={(e) => e.stopPropagation()}
      >
        <button type='button' className='upgrade-dialog__close' onClick={onClose} aria-label='Close' disabled={!!busy}>
          ×
        </button>
        <h2 id='admin-detail-title' className='upgrade-dialog__title admin-detail__title'>
          {user ? user.email : 'Account'}
        </h2>
        {!user && !error && <p className='admin-loading'>Loading…</p>}
        {error && <p className='admin-error' role='alert'>{error}</p>}
        {notice && <p className='admin-notice' role='status'>{notice}</p>}

        {user && (
          <>
            <dl className='admin-detail__list'>
              <Row label='Plan'>{planText(user)}</Row>
              <Row label='Billing'>
                {user.billing
                  ? `${user.billing.status || 'no subscription'}${user.billing.interval ? `, ${user.billing.interval}` : ''}`
                    + (user.billing.cancel_at_period_end ? ', cancelling' : '')
                    + (user.billing.period_end ? ` · renews or ends ${formatDate(user.billing.period_end)}` : '')
                  : 'Never paid'}
              </Row>
              <Row label='Signs in with'>{user.sign_in === 'google' ? 'Google' : 'Email and password'}</Row>
              <Row label='Joined'>{formatDateTime(user.created_at)}</Row>
              <Row label='Last active'>{timeAgo(user.last_seen_at)}</Row>
              <Row label='Documents'>{count(user.documents)} stored · {count(user.folders)} folders</Row>
              <Row label='AI chat questions'>
                {count(user.ai_questions_total)} in total · {count(user.plan.usage?.questions_today ?? 0)} today
              </Row>
              <Row label='E-Sign'>
                {count(user.signature_request_usage.used)} requests this month
                {user.signature_request_usage.limit !== null && ` of ${user.signature_request_usage.limit}`}
                {' '}· {count(user.signed_pdfs)} PDFs signed
              </Row>
              <Row label='Account ID'><code>{user.id}</code></Row>
            </dl>

            {user.recent_signature_requests.length > 0 && (
              <section className='admin-detail__section'>
                <h3 className='admin-panel__title'>Recent signature requests</h3>
                <ul className='admin-log'>
                  {user.recent_signature_requests.map((r) => (
                    <li key={r.id}>
                      <span className='admin-muted'>{formatDateTime(r.created_at)}</span>
                      <span>{REQUEST_STATUS_LABELS[r.status] || r.status} · {r.signers} signer{r.signers === 1 ? '' : 's'}</span>
                      <code className='admin-muted'>{r.id}</code>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className='admin-detail__section'>
              <h3 className='admin-panel__title'>Make a change</h3>
              <form
                className='admin-action'
                onSubmit={(e) => {
                  e.preventDefault();
                  act('extend-trial', { days: Number(trialDays) }, `Trial extended by ${trialDays} days.`);
                }}
              >
                <label>
                  Extend the trial by
                  <input type='number' min='1' max='365' className='admin-input admin-input--short' value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)} aria-label='Days to add to the trial' />
                  days
                </label>
                <button type='submit' className='admin-btn' disabled={!!busy}>
                  {busy === 'extend-trial' ? 'Saving…' : 'Extend trial'}
                </button>
              </form>

              {subscribed ? (
                <p className='admin-muted'>
                  This account pays through Stripe; change or cancel its plan in the Stripe Dashboard.
                </p>
              ) : (
                <form
                  className='admin-action'
                  onSubmit={(e) => {
                    e.preventDefault();
                    act('grant-plan', { plan: grantPlan, months: Number(grantMonths) },
                      `${STATE_LABELS[grantPlan]} granted for ${grantMonths} month${grantMonths === '1' ? '' : 's'}.`);
                  }}
                >
                  <label>
                    Give
                    <select className='admin-input admin-input--select' value={grantPlan} aria-label='Plan to give'
                      onChange={(e) => setGrantPlan(e.target.value)}>
                      <option value='basic'>Basic</option>
                      <option value='pro'>Pro</option>
                    </select>
                    free for
                    <input type='number' min='1' max='24' className='admin-input admin-input--short' value={grantMonths}
                      onChange={(e) => setGrantMonths(e.target.value)} aria-label='Months' />
                    months
                  </label>
                  <button type='submit' className='admin-btn' disabled={!!busy}>
                    {busy === 'grant-plan' ? 'Saving…' : 'Give plan'}
                  </button>
                </form>
              )}

              <div className='admin-action admin-action--buttons'>
                {granted && (
                  <button type='button' className='admin-btn' disabled={!!busy}
                    onClick={() => act('end-plan', {}, 'Granted plan ended.')}>
                    {busy === 'end-plan' ? 'Saving…' : 'End granted plan'}
                  </button>
                )}
                <button type='button' className='admin-btn admin-btn--danger' disabled={!!busy}
                  onClick={() => act('sign-out', {}, 'Signed out on every device.')}>
                  {busy === 'sign-out' ? 'Signing out…' : 'Sign out everywhere'}
                </button>
              </div>
            </section>

            {user.admin_actions.length > 0 && (
              <section className='admin-detail__section'>
                <h3 className='admin-panel__title'>Changes by admins</h3>
                <ul className='admin-log'>
                  {user.admin_actions.map((a, i) => (
                    <li key={i}>
                      <span className='admin-muted'>{formatDateTime(a.created_at)}</span>
                      <span><strong>{ACTION_LABELS[a.action] || a.action}</strong>{a.detail && ` · ${a.detail}`}</span>
                      <span className='admin-muted'>by {a.admin_email}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default AdminUserPanel;
