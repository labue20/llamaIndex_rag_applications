/**
 * Sent Requests
 * The signature requests you've sent: who has signed, reminders, cancelling,
 * downloading the signed PDF, and each request's history.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, downloadBlob, Icon, readApiError } from '../../../shared';
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

const RequestCard = ({ request, onChanged }) => {
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
  const download = (part = 'signed') => act(`download-${part}`, async () => {
    const response = await call(`/signature-requests/${request.id}/document?part=${part}`, {},
      'Couldn’t download the document.');
    const stem = request.file_name.replace(/\.pdf$/i, '');
    const names = { signed: `${stem}_signed.pdf`, certificate: `${stem}_certificate.pdf`,
      combined: `${stem}_signed_with_certificate.pdf` };
    downloadBlob(await response.blob(), status === 'completed' ? names[part] : request.file_name);
  });

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
    if (active) load();
  }, [active, load]);

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
    <ul className='esign-cards' aria-label='Sent for signature'>
      {requests.map((request) => <RequestCard key={request.id} request={request} onChanged={load} />)}
    </ul>
  );
};

export default SentRequests;
