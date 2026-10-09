/**
 * Admin Overview
 * Sign-ups, plans, revenue, E-Sign and documents at a glance (GET /admin/stats).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, Icon, readApiError } from '../../../shared';
import {
  ACTION_LABELS, count, formatDate, formatDateTime, money, REQUEST_STATUS_LABELS, STATE_LABELS,
} from '../format';

const Stat = ({ label, value, note }) => (
  <div className='admin-stat'>
    <span className='admin-stat__label'>{label}</span>
    <span className='admin-stat__value'>{value}</span>
    {note && <span className='admin-stat__note'>{note}</span>}
  </div>
);

const SignupChart = ({ days }) => {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((sum, d) => sum + d.count, 0);
  return (
    <figure className='admin-chart'>
      <div className='admin-chart__bars' role='img' aria-label={`${total} sign-ups in the last ${days.length} days`}>
        {days.map((d) => (
          <span
            key={d.day}
            className='admin-chart__bar'
            style={{ height: `${(d.count / max) * 100}%` }}
            title={`${formatDate(`${d.day}T12:00:00`)}: ${d.count}`}
          />
        ))}
      </div>
      <figcaption className='admin-chart__axis'>
        <span>{formatDate(`${days[0].day}T12:00:00`)}</span>
        <span>Today</span>
      </figcaption>
    </figure>
  );
};

const Breakdown = ({ rows }) => (
  <ul className='admin-breakdown'>
    {rows.map(([label, value]) => (
      <li key={label}>
        <span>{label}</span>
        <strong>{count(value)}</strong>
      </li>
    ))}
  </ul>
);

const AdminOverview = ({ onOpenUser }) => {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiFetch('/admin/stats');
      if (!response.ok) throw new Error(await readApiError(response, 'Couldn’t load the stats.'));
      setStats(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!stats) {
    return error ? (
      <p className='admin-error' role='alert'>{error}</p>
    ) : (
      <p className='admin-loading'>Loading stats…</p>
    );
  }

  const { users, revenue, signature_requests: requests, documents } = stats;
  const statusRows = Object.entries(REQUEST_STATUS_LABELS)
    .filter(([status]) => requests.by_status[status])
    .map(([status, label]) => [label, requests.by_status[status]]);

  return (
    <div className='admin-overview'>
      <div className='admin-toolbar'>
        <span className='admin-muted'>Updated {formatDateTime(stats.generated_at)}</span>
        <button type='button' className='admin-btn' onClick={load} disabled={isLoading}>
          <Icon name='refresh' size={14} /> {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <p className='admin-error' role='alert'>{error}</p>}

      <section aria-labelledby='admin-accounts'>
        <h2 id='admin-accounts' className='admin-heading'>Accounts</h2>
        <div className='admin-stats'>
          <Stat label='Total accounts' value={count(users.total)} />
          <Stat label='New today' value={count(users.new_today)} />
          <Stat label='New, last 7 days' value={count(users.new_7_days)} note={`${count(users.new_30_days)} in 30 days`} />
          <Stat label='Active, last 7 days' value={count(users.active_7_days)} note='Used the app' />
        </div>
        <div className='admin-panels'>
          <div className='admin-panel'>
            <h3 className='admin-panel__title'>Sign-ups, last 30 days</h3>
            <SignupChart days={stats.signups_by_day} />
          </div>
          <div className='admin-panel'>
            <h3 className='admin-panel__title'>Plans</h3>
            <Breakdown rows={Object.entries(STATE_LABELS).map(([state, label]) => [label, users.by_state[state] ?? 0])} />
          </div>
        </div>
      </section>

      <section aria-labelledby='admin-revenue'>
        <h2 id='admin-revenue' className='admin-heading'>Revenue</h2>
        <div className='admin-stats'>
          <Stat label='Monthly revenue' value={money(revenue.mrr)} note='From active subscriptions' />
          <Stat label='Paying accounts' value={count(revenue.paying_total)}
            note={`${revenue.paying.basic} Basic · ${revenue.paying.pro} Pro`} />
          <Stat label='Cancelling' value={count(revenue.cancelling)} note='Ends at period end' />
          <Stat label='Payment problems' value={count(revenue.past_due)} note='Card being retried' />
        </div>
        {revenue.granted > 0 && (
          <p className='admin-muted'>
            Plus {revenue.granted} account{revenue.granted === 1 ? '' : 's'} on a granted (free) paid plan.
          </p>
        )}
      </section>

      <section aria-labelledby='admin-esign'>
        <h2 id='admin-esign' className='admin-heading'>E-Sign and documents</h2>
        <div className='admin-stats'>
          <Stat label='Signature requests' value={count(requests.total)} note={`${count(requests.this_month)} this month`} />
          <Stat label='Senders' value={count(requests.senders)} />
          <Stat label='PDFs signed (Sign PDF)' value={count(documents.signed_pdfs)} />
          <Stat label='Stored documents' value={count(documents.total)} />
        </div>
        <div className='admin-panels'>
          <div className='admin-panel'>
            <h3 className='admin-panel__title'>Requests by status</h3>
            {statusRows.length ? <Breakdown rows={statusRows} /> : <p className='admin-muted'>None yet.</p>}
          </div>
          <div className='admin-panel'>
            <h3 className='admin-panel__title'>AI use</h3>
            <Breakdown rows={[
              ['Chat questions, last 30 days', documents.ai_questions_30_days],
              ['Signing summaries made', requests.ai_summaries],
              ['Signer questions asked', requests.ai_questions],
            ]} />
          </div>
        </div>
      </section>

      <section aria-labelledby='admin-actions'>
        <h2 id='admin-actions' className='admin-heading'>Recent admin actions</h2>
        {stats.recent_actions.length === 0 ? (
          <p className='admin-muted'>No changes made yet.</p>
        ) : (
          <ul className='admin-log'>
            {stats.recent_actions.map((a, i) => (
              <li key={i}>
                <span className='admin-muted'>{formatDateTime(a.created_at)}</span>
                <span>
                  <strong>{ACTION_LABELS[a.action] || a.action}</strong>{' '}
                  {a.user_id ? (
                    <button type='button' className='admin-link' onClick={() => onOpenUser(a.user_id)}>
                      {a.user_email}
                    </button>
                  ) : a.user_email}
                  {a.detail && <span className='admin-muted'> · {a.detail}</span>}
                </span>
                <span className='admin-muted'>by {a.admin_email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default AdminOverview;
