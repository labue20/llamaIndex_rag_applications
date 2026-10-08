/**
 * Sent Requests
 * The signature requests you've sent: who has signed, reminders, cancelling,
 * downloading the signed PDF, and each request's history.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, Icon, readApiError } from '../../../shared';
import { downloadRequestDocument } from '../requestsApi';
import { folderApi, folderPath } from '../../document-management/services/folderApi';
import { formatDate, REQUEST_STATUS, SIGNER_STATUS, signerColor } from '../fields';

const EVENT_TEXT = {
  created: () => 'Request created',
  sent: (e) => `Email sent to ${e.signer}`,
  reminded: (e) => `Reminder sent to ${e.signer}`,
  viewed: (e) => `${e.signer} opened the document`,
  signed: (e) => `${e.signer} signed`,
  declined: (e) => `${e.signer} declined${e.detail ? `: “${e.detail}”` : ''}`,
  completed: () => 'Everyone signed; the signed PDF and certificate were emailed to all',
  cancelled: () => 'Request cancelled',
  email_failed: (e) => `An email to ${e.detail} couldn’t be sent`,
};

// Status filter: value -> the request statuses it shows
const FILTERS = [
  { value: 'all', label: 'All', statuses: null },
  { value: 'waiting', label: 'Waiting', statuses: ['sent', 'completing'] },
  { value: 'completed', label: 'Completed', statuses: ['completed'] },
  { value: 'declined', label: 'Declined', statuses: ['declined'] },
  { value: 'closed', label: 'Cancelled or expired', statuses: ['cancelled', 'expired'] },
];

const matchesSearch = (request, query) => {
  if (!query) return true;
  const text = [request.title, request.file_name, ...request.signers.flatMap((s) => [s.name, s.email])]
    .join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => text.includes(word));
};

const RequestCard = ({ request, folderName, onChanged }) => {
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState(null);
  const status = request.status;
  const signed = request.signers.filter((s) => s.status === 'signed').length;

  const act = async (action, run) => {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      await run();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const call = async (path, options, fallback) => {
    const response = await apiFetch(path, options);
    if (!response.ok) throw new Error(await readApiError(response, fallback));
    return response;
  };

  const remind = () => act('remind', async () => {
    const response = await call(`/signature-requests/${request.id}/remind`, { method: 'POST' }, 'Couldn’t send reminders.');
    const { reminded } = await response.json();
    setNotice(`Reminder sent to ${reminded.join(', ')}.`);
    onChanged();
  });

  const cancel = () => act('cancel', async () => {
    if (!window.confirm(`Cancel “${request.title}”? Signers won’t be able to sign it anymore.`)) return;
    await call(`/signature-requests/${request.id}/cancel`, { method: 'POST' }, 'Couldn’t cancel the request.');
    onChanged();
  });

  const remove = () => act('delete', async () => {
    if (!window.confirm(`Delete “${request.title}” and its documents? This can’t be undone.`)) return;
    await call(`/signature-requests/${request.id}`, { method: 'DELETE' }, 'Couldn’t delete the request.');
    onChanged();
  });

  // part: 'signed' (or the original before completion), 'certificate' or 'combined'
  const download = (part = 'signed') => act(`download-${part}`, () => downloadRequestDocument(request, part));

  const toggleHistory = () => act('history', async () => {
    if (history) {
      setHistory(null);
      return;
    }
    const response = await call(`/signature-requests/${request.id}`, {}, 'Couldn’t load the history.');
    setHistory((await response.json()).request.events);
  });

  return (
    <li className='esign-card'>
      <div className='esign-card__head'>
        <div>
          <h4 className='esign-card__title'>{request.title}</h4>
          <p className='esign-card__meta'>
            Sent {formatDate(request.created_at)}
            {status === 'sent' && ` · ${signed} of ${request.signers.length} signed`}
            {status === 'completed' && request.completed_at && ` · Completed ${formatDate(request.completed_at)}`}
          </p>
          {folderName && (
            <p className='esign-card__folder'><Icon name='folder' size={13} /> {folderName}</p>
          )}
        </div>
        <span className={`esign-status esign-status--${status}`}>{REQUEST_STATUS[status] || status}</span>
      </div>

      <ul className='esign-card__signers'>
        {request.signers.map((signer, index) => (
          <li key={signer.id}>
            <span className='esign-signer__dot esign-signer__dot--small' style={{ background: signerColor(index) }}
              aria-hidden='true' />
            <span className='esign-card__signer-name'>{signer.name}</span>
            <span className='esign-card__signer-email'>{signer.email}</span>
            <span className={`esign-signer-status esign-signer-status--${signer.status}`}>
              {signer.status === 'signed' && <Icon name='check' size={13} />}
              {SIGNER_STATUS[signer.status] || signer.status}
            </span>
          </li>
        ))}
      </ul>

      <div className='esign-card__actions'>
        {status === 'completed' ? (
          <>
            <button type='button' className='esign-action' onClick={() => download('signed')} disabled={!!busy}>
              Signed PDF
            </button>
            <button type='button' className='esign-action' onClick={() => download('certificate')} disabled={!!busy}
              title='The audit trail: who signed, when, and the document’s fingerprint'>
              Certificate
            </button>
            <button type='button' className='esign-action' onClick={() => download('combined')} disabled={!!busy}>
              Both in one PDF
            </button>
          </>
        ) : (
          <button type='button' className='esign-action' onClick={() => download('signed')} disabled={!!busy}>
            Download original
          </button>
        )}
        {status === 'sent' && (
          <>
            <button type='button' className='esign-action' onClick={remind} disabled={!!busy}>
              {busy === 'remind' ? 'Sending…' : 'Remind'}
            </button>
            <button type='button' className='esign-action esign-action--danger' onClick={cancel} disabled={!!busy}>
              Cancel request
            </button>
          </>
        )}
        {status !== 'sent' && status !== 'completing' && (
          <button type='button' className='esign-action esign-action--danger' onClick={remove} disabled={!!busy}>
            Delete
          </button>
        )}
        <button type='button' className='esign-action esign-action--quiet' onClick={toggleHistory} disabled={!!busy}
          aria-expanded={!!history}>
          {history ? 'Hide history' : 'History'}
        </button>
      </div>

      {notice && <p className='esign-card__notice' role='status'>{notice}</p>}
      {error && <p className='esign-card__error' role='alert'>{error}</p>}
      {history && (
        <ol className='esign-history'>
          {history.map((event, index) => (
            <li key={index}>
              <span>{(EVENT_TEXT[event.event] || (() => event.event))(event)}</span>
              <time>{formatDate(event.at)}</time>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
};

const SentRequests = ({ active, onNew }) => {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState('');
  const [folders, setFolders] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const response = await apiFetch('/signature-requests');
      if (!response.ok) throw new Error(await readApiError(response, 'Couldn’t load your requests.'));
      setRequests((await response.json()).requests);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Refresh whenever the tab is shown
  useEffect(() => {
    if (!active) return;
    load();
    folderApi.list().then(setFolders).catch(() => setFolders([]));
  }, [active, load]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [
    f.value, (requests || []).filter((r) => !f.statuses || f.statuses.includes(r.status)).length,
  ])), [requests]);
  const statuses = FILTERS.find((f) => f.value === filter).statuses;
  const shown = (requests || []).filter((r) => (!statuses || statuses.includes(r.status)) && matchesSearch(r, query));

  if (error) {
    return (
      <div className='converter-message converter-message--error' role='alert'>
        <Icon name='alert' size={16} />
        <span>{error}</span>
      </div>
    );
  }
  if (requests === null) return <p className='esign-empty'>Loading…</p>;
  if (requests.length === 0) {
    return (
      <div className='esign-empty'>
        <p>You haven’t sent any documents for signature yet.</p>
        <button type='button' className='convert-btn' onClick={onNew}>Request signatures</button>
      </div>
    );
  }
  return (
    <div className='esign-sent'>
      <div className='esign-sent__tools'>
        <input
          type='search'
          className='esign-input esign-sent__search'
          placeholder='Search by document, signer name or email'
          aria-label='Search sent requests'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className='esign-sent__filters' role='group' aria-label='Show'>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type='button'
              className={`esign-chip esign-chip--plain ${filter === f.value ? 'esign-chip--active' : ''}`}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label} <span className='esign-chip__count'>{counts[f.value]}</span>
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className='esign-empty'>No requests match.</p>
      ) : (
        <ul className='esign-cards' aria-label='Sent for signature'>
          {shown.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              folderName={request.folder_id ? folderPath(folders, request.folder_id) : ''}
              onChanged={load}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

export default SentRequests;
