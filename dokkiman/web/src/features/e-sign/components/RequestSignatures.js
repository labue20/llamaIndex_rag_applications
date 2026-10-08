/**
 * Request Signatures
 * Send a PDF to other people to sign: add signers, place each signer's fields
 * (signature, initials, date, name), then send. Each signer gets an email with
 * a private link (POST /signature-requests).
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/webpack';
import { apiFetch, DocumentPicker, Icon, readApiError } from '../../../shared';
import { useAuth } from '../../auth/context/AuthContext';
import FieldStage from './FieldStage';
import { FIELD_KINDS, fieldLabel, firstName, signerColor } from '../fields';

const isPdf = (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
const EMAIL_RE = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;
const MAX_SIGNERS = 10;

let nextId = 1;
const newSigner = () => ({ key: nextId++, name: '', email: '' });

const RequestSignatures = forwardRef(({ onStatusChange, onSent, onShowSent, allowDocumentManager = true }, ref) => {
  const { user, refreshUser } = useAuth();
  const [file, setFile] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [signers, setSigners] = useState(() => [newSigner()]);
  const [activeSigner, setActiveSigner] = useState(0);
  const [sequential, setSequential] = useState(false);
  const [fields, setFields] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);

  const reset = useCallback(() => {
    setFile(null);
    setPdf(null);
    setPageCount(0);
    setCurrentPage(0);
    setSigners([newSigner()]);
    setActiveSigner(0);
    setSequential(false);
    setFields([]);
    setSelectedId(null);
    setTitle('');
    setMessage('');
    setError('');
    setSent(null);
  }, []);

  const loadFile = useCallback(async (selected) => {
    if (!isPdf(selected)) {
      alert('Please select a valid PDF file');
      return;
    }
    reset();
    setFile(selected);
    setTitle(selected.name.replace(/\.pdf$/i, ''));
    try {
      const doc = await pdfjsLib.getDocument({ data: await selected.arrayBuffer() }).promise;
      setPdf(doc);
      setPageCount(doc.numPages);
    } catch (err) {
      console.error('Could not open PDF:', err);
      setError('This PDF couldn’t be opened. It may be damaged or password-protected.');
    }
  }, [reset]);

  useImperativeHandle(ref, () => ({ selectFile: loadFile, reset }));

  useEffect(() => {
    onStatusChange?.({ hasFile: !!file, isBusy: isSending });
  }, [onStatusChange, file, isSending]);

  // --- signers ------------------------------------------------------------------------
  const updateSigner = (index, changes) =>
    setSigners((prev) => prev.map((s, i) => (i === index ? { ...s, ...changes } : s)));

  const addSigner = () => {
    setSigners((prev) => [...prev, newSigner()]);
    setActiveSigner(signers.length);
  };

  const removeSigner = (index) => {
    setSigners((prev) => prev.filter((_, i) => i !== index));
    // Their fields go too; later signers' fields move up one
    setFields((prev) => prev
      .filter((f) => f.signer !== index)
      .map((f) => (f.signer > index ? { ...f, signer: f.signer - 1 } : f)));
    setActiveSigner((current) => Math.max(0, current >= index ? current - 1 : current));
  };

  const signerName = (index) => firstName(signers[index]?.name) || `Signer ${index + 1}`;

  // --- fields -------------------------------------------------------------------------
  const addField = (kind) => {
    const spec = FIELD_KINDS.find((f) => f.kind === kind);
    // A little lower for each field already on this page, so they don't stack exactly
    const onPage = fields.filter((f) => f.page === currentPage).length;
    const field = {
      id: nextId++, kind, signer: activeSigner, page: currentPage,
      width: spec.width, height: spec.height,
      x: 0.5 - spec.width / 2, y: Math.min(0.4 + onPage * 0.06, 0.9 - spec.height),
    };
    setFields((prev) => [...prev, field]);
    setSelectedId(field.id);
  };

  const changeField = (id, changes) => setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)));
  const removeField = (id) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedId(null);
  };

  // --- sending ------------------------------------------------------------------------
  const problem = () => {
    for (const [index, signer] of signers.entries()) {
      const label = signer.name.trim() || `Signer ${index + 1}`;
      if (!signer.name.trim()) return `Add a name for signer ${index + 1}.`;
      if (!EMAIL_RE.test(signer.email.trim())) return `Add a valid email address for ${label}.`;
      if (!fields.some((f) => f.signer === index && f.kind === 'signature')) {
        return `Place a signature field for ${label}.`;
      }
    }
    const emails = signers.map((s) => s.email.trim().toLowerCase());
    const duplicate = emails.find((e, i) => emails.indexOf(e) !== i);
    if (duplicate) return `${duplicate} is added twice.`;
    return '';
  };

  const send = async () => {
    const issue = problem();
    if (issue) {
      setError(issue);
      return;
    }
    setIsSending(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('data', JSON.stringify({
        title: title.trim(),
        message: message.trim(),
        sequential,
        signers: signers.map((s) => ({ name: s.name.trim(), email: s.email.trim() })),
        fields: fields.map(({ signer, kind, page, x, y, width, height }) => ({ signer, kind, page, x, y, width, height })),
      }));
      const response = await apiFetch('/signature-requests', { method: 'POST', body: formData });
      if (!response.ok) throw new Error(await readApiError(response, 'The request couldn’t be sent.'));
      const { request } = await response.json();
      setSent(request);
      refreshUser?.();
      onSent?.(request);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  const usage = user?.plan?.signature_requests;
  const usageNote = usage && usage.limit !== null && usage.limit !== undefined
    ? `${Math.max(0, usage.limit - usage.used)} of ${usage.limit} signature requests left this month`
    : null;

  if (sent) {
    const names = sent.signers.map((s) => s.name);
    return (
      <div className='esign-done'>
        <span className='esign-done__icon'><Icon name='checkCircle' size={28} /></span>
        <h3>Sent for signature</h3>
        <p>
          {sent.sequential
            ? `${names[0]} has been emailed a link to sign. Everyone else gets theirs in turn.`
            : `${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} been emailed a link to sign.`}
          {' '}When everyone has signed, you’ll all get the signed PDF by email.
        </p>
        <div className='esign-done__actions'>
          <button type='button' className='convert-btn' onClick={onShowSent}>Track it in Sent</button>
          <button type='button' className='esign-link-btn' onClick={reset}>Send another document</button>
        </div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className='file-input-section'>
        <div className='upload-area'>
          <input type='file' accept='.pdf' id='esign-request-file-input'
            onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) loadFile(f); }} />
          <div className='upload-actions'>
            <label htmlFor='esign-request-file-input' className='upload-label'>Choose PDF File</label>
            {allowDocumentManager && (
              <DocumentPicker acceptedExtensions={['.pdf']} onSelect={(picked) => picked && loadFile(picked)} />
            )}
          </div>
          <p className='upload-hint'>Send a PDF to others to sign by email • No account needed for signers</p>
          {usageNote && <p className='esign-usage'>{usageNote}</p>}
        </div>
      </div>
    );
  }

  const pageFields = fields.filter((f) => f.page === currentPage);

  return (
    <div className='esign-compose'>
      <section className='esign-panel' aria-labelledby='esign-signers-title'>
        <h3 id='esign-signers-title' className='esign-panel__title'>Who needs to sign?</h3>
        <ol className='esign-signers'>
          {signers.map((signer, index) => (
            <li key={signer.key} className='esign-signer'>
              <span className='esign-signer__dot' style={{ background: signerColor(index) }} aria-hidden='true'>
                {index + 1}
              </span>
              <input
                className='esign-input'
                placeholder='Full name'
                aria-label={`Signer ${index + 1} name`}
                value={signer.name}
                maxLength={100}
                onChange={(e) => updateSigner(index, { name: e.target.value })}
              />
              <input
                className='esign-input'
                type='email'
                placeholder='Email'
                aria-label={`Signer ${index + 1} email`}
                value={signer.email}
                maxLength={254}
                onChange={(e) => updateSigner(index, { email: e.target.value })}
              />
              {signers.length > 1 && (
                <button type='button' className='esign-icon-btn' aria-label={`Remove signer ${index + 1}`}
                  onClick={() => removeSigner(index)}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
        <div className='esign-panel__row'>
          {signers.length < MAX_SIGNERS && (
            <button type='button' className='esign-link-btn' onClick={addSigner}>+ Add signer</button>
          )}
          {user?.email && !signers.some((s) => s.email.trim().toLowerCase() === user.email) && (
            <button type='button' className='esign-link-btn'
              onClick={() => {
                const empty = signers.findIndex((s) => !s.name.trim() && !s.email.trim());
                if (empty >= 0) updateSigner(empty, { email: user.email });
                else setSigners((prev) => [...prev, { ...newSigner(), email: user.email }]);
              }}>
              + Add myself
            </button>
          )}
          {signers.length > 1 && (
            <label className='esign-check'>
              <input type='checkbox' checked={sequential} onChange={(e) => setSequential(e.target.checked)} />
              Sign in order (each person gets the email after the one before signs)
            </label>
          )}
        </div>
      </section>

      <section className='esign-panel' aria-labelledby='esign-fields-title'>
        <h3 id='esign-fields-title' className='esign-panel__title'>Place their fields</h3>
        <div className='esign-for' role='group' aria-label='Add fields for'>
          <span>Fields for:</span>
          {signers.map((signer, index) => (
            <button
              key={signer.key}
              type='button'
              className={`esign-chip ${activeSigner === index ? 'esign-chip--active' : ''}`}
              style={{ '--signer': signerColor(index) }}
              aria-pressed={activeSigner === index}
              onClick={() => setActiveSigner(index)}
            >
              {signerName(index)}
            </button>
          ))}
        </div>
        <div className='sign-pdf__toolbar' role='toolbar' aria-label='Add a field'>
          {FIELD_KINDS.map(({ kind, label }) => (
            <button key={kind} type='button' className='sign-pdf__tool' onClick={() => addField(kind)} disabled={isSending}>
              <Icon name={kind === 'date' ? 'check' : 'pen'} size={16} /> {label}
            </button>
          ))}
        </div>
        <p className='sign-pdf__hint'>
          Add a field, then drag it into place and drag its corner to resize. Each signer needs at least one signature.
        </p>

        {pageCount > 1 && (
          <div className='sign-pdf__pager'>
            <button type='button' onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 0}>← Previous</button>
            <span>Page {currentPage + 1} of {pageCount}</span>
            <button type='button' onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage >= pageCount - 1}>
              Next →
            </button>
          </div>
        )}

        <FieldStage
          pdf={pdf}
          pageIndex={currentPage}
          fields={pageFields}
          editable
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChange={changeField}
          onRemove={removeField}
          fieldStyle={(field) => ({ '--signer': signerColor(field.signer) })}
          describeField={(field) => `${fieldLabel(field.kind)} for ${signerName(field.signer)} on page ${field.page + 1}`}
          renderField={(field) => (
            <span className='esign-field__label'>{fieldLabel(field.kind)} · {signerName(field.signer)}</span>
          )}
        />
      </section>

      <section className='esign-panel' aria-labelledby='esign-email-title'>
        <h3 id='esign-email-title' className='esign-panel__title'>The email</h3>
        <label className='esign-label' htmlFor='esign-title'>Document name</label>
        <input id='esign-title' className='esign-input esign-input--wide' value={title} maxLength={200}
          onChange={(e) => setTitle(e.target.value)} />
        <label className='esign-label' htmlFor='esign-message'>Message (optional)</label>
        <textarea id='esign-message' className='esign-input esign-input--wide' rows={3} maxLength={2000}
          placeholder='Hi, please review and sign this.' value={message} onChange={(e) => setMessage(e.target.value)} />
      </section>

      {error && (
        <div className='converter-message converter-message--error' role='alert'>
          <Icon name='alert' size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className='conversion-action esign-send'>
        {usageNote && <p className='esign-usage'>{usageNote}</p>}
        <button type='button' className='convert-btn' onClick={send} disabled={isSending}>
          <span className='btn-icon' aria-hidden='true'>
            {isSending ? <span className='btn-spinner' /> : <Icon name='pen' size={18} />}
          </span>
          {isSending ? 'Sending…' : 'Send for signature'}
        </button>
      </div>
    </div>
  );
});

export default RequestSignatures;
