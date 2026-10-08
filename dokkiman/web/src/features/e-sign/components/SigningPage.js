/**
 * Signing Page (/sign/:token)
 * Where someone who was sent a document signs it, without an account. The
 * token in the address (from their email) identifies them to the server.
 * They adopt a signature (and initials, if asked), agree to sign
 * electronically, and finish; or decline with a reason.
 *
 * A guide bar (Start / Next, like DocuSign) takes them to each field they
 * need to fill, in page order, and then to Finish. Date and name fields fill
 * themselves, so the guide skips them.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist/webpack';
import { apiFetch, Icon, readApiError } from '../../../shared';
import LogoMark from '../../../shared/components/LogoMark';
import SignatureDialog from '../../sign-pdf/components/SignatureDialog';
import FieldStage from './FieldStage';
import { fieldLabel, formatDate } from '../fields';
import '../../../shared/styles/converter.scss';
import '../../sign-pdf/styles/sign-pdf.scss';
import '../styles/esign.scss';

const dataUrlToBlob = async (dataUrl) => (await fetch(dataUrl)).blob();

// Fields the signer has to fill themselves (date and name fill automatically)
const needsSigner = (field) => field.kind === 'signature' || field.kind === 'initials';
// Page by page, top to bottom, left to right: the order people read in
const readingOrder = (a, b) => a.page - b.page || a.y - b.y || a.x - b.x;

const scrollToElement = (element) => element?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });

const CLOSED = {
  signed: ['You’ve already signed', 'When everyone has signed, you’ll get the signed PDF by email.'],
  completed: ['This document is fully signed', 'Everyone has signed. The signed PDF was emailed to all signers.'],
  declined: ['This request was declined', 'Someone declined to sign, so the request has stopped.'],
  cancelled: ['This request was cancelled', 'The sender cancelled it. You don’t need to do anything.'],
  expired: ['This request has expired', 'Ask the sender to send it again.'],
  not_your_turn: ['It isn’t your turn yet', 'Others need to sign first. You’ll get an email when it’s your turn.'],
};

const Shell = ({ children }) => (
  <div className='esign-public'>
    <header className='esign-public__bar'>
      <Link to='/' className='esign-public__brand' aria-label='Dokkiman home'>
        <span className='esign-public__logo'><LogoMark size={18} /></span>
        Dokkiman
      </Link>
      <span className='esign-public__secure'><Icon name='lock' size={13} /> Secure signing</span>
    </header>
    <main className='esign-public__main'>{children}</main>
  </div>
);

const Message = ({ icon = 'alert', title, text }) => (
  <Shell>
    <div className='esign-done'>
      <span className='esign-done__icon'><Icon name={icon} size={28} /></span>
      <h1>{title}</h1>
      <p>{text}</p>
      <Link className='esign-link-btn' to='/'>What is Dokkiman?</Link>
    </div>
  </Shell>
);

const SigningPage = () => {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [pdf, setPdf] = useState(null);
  const [images, setImages] = useState({}); // { signature: {dataUrl, aspect}, initials: {...} }
  const [dialogKind, setDialogKind] = useState(null);
  const [consent, setConsent] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [isDeclining, setIsDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declined, setDeclined] = useState(false);
  // The guide: whether the signer pressed Start, and the field it points at
  const [started, setStarted] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const finishRef = useRef(null);

  useEffect(() => {
    document.title = 'Sign a document · Dokkiman';
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch(`/signing/${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error(await readApiError(response, 'This signing link couldn’t be opened.'));
      const data = await response.json();
      setInfo(data);
      if (data.can_sign) {
        const file = await apiFetch(`/signing/${encodeURIComponent(token)}/document`);
        if (!file.ok) throw new Error(await readApiError(file, 'The document couldn’t be loaded.'));
        setPdf(await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise);
      }
    } catch (err) {
      setLoadError(err.message);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const needed = useMemo(
    () => [...new Set((info?.fields || []).map((f) => f.kind).filter((k) => k === 'signature' || k === 'initials'))],
    [info]
  );
  const missing = needed.filter((kind) => !images[kind]);
  const today = new Date().toLocaleDateString(undefined, { dateStyle: 'medium' });

  // --- the guide --------------------------------------------------------------------------
  const todo = useMemo(() => (info?.fields || []).filter(needsSigner).sort(readingOrder), [info]);
  const isDone = useCallback((field) => Boolean(images[field.kind]), [images]);
  const doneCount = todo.filter(isDone).length;
  const nextField = todo.find((field) => !isDone(field)) || null;

  // Point at the first field to fill as soon as the document is there
  useEffect(() => {
    if (pdf && currentId === null && nextField) setCurrentId(nextField.id);
  }, [pdf, currentId, nextField]);

  const goTo = useCallback((field) => {
    if (!field) {
      setCurrentId(null);
      scrollToElement(finishRef.current);
      return;
    }
    setCurrentId(field.id);
    scrollToElement(document.querySelector(`[data-field-id="${field.id}"]`));
  }, []);

  const guideNext = () => {
    setStarted(true);
    goTo(nextField);
  };

  const sign = async () => {
    if (missing.length) {
      setError(`Add your ${missing[0]} first: tap a ${missing[0]} field.`);
      return;
    }
    if (!consent) {
      setError('Please agree to sign electronically.');
      return;
    }
    setIsSigning(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('consent', 'true');
      for (const kind of needed) {
        formData.append(kind, await dataUrlToBlob(images[kind].dataUrl), `${kind}.png`);
      }
      const response = await apiFetch(`/signing/${encodeURIComponent(token)}`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(await readApiError(response, 'Your signature couldn’t be saved.'));
      setResult(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSigning(false);
    }
  };

  const decline = async () => {
    setIsSigning(true);
    setError('');
    try {
      const response = await apiFetch(`/signing/${encodeURIComponent(token)}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason.trim() }),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'Couldn’t decline. Please try again.'));
      setDeclined(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSigning(false);
    }
  };

  if (loadError) return <Message title='This link can’t be used' text={loadError} />;
  if (!info) {
    return (
      <Shell>
        <p className='esign-empty'>Loading…</p>
      </Shell>
    );
  }
  if (declined) {
    return <Message icon='checkCircle' title='You declined to sign' text={`We’ve let ${info.sender} know.`} />;
  }
  if (result) {
    return (
      <Message
        icon='checkCircle'
        title='You’ve signed!'
        text={result.completed
          ? 'Everyone has signed. The signed PDF is on its way to your email.'
          : 'Thanks. When everyone has signed, you’ll get the signed PDF by email.'}
      />
    );
  }
  if (!info.can_sign) {
    const [title, text] = CLOSED[info.reason] || ['This request is closed', ''];
    return <Message title={title} text={text} />;
  }

  const pages = Array.from({ length: info.page_count }, (_, i) => i);
  const fieldsByPage = (page) => info.fields.filter((f) => f.page === page);

  return (
    <Shell>
      <section className='esign-intro'>
        <h1>{info.title}</h1>
        <p>
          <strong>{info.sender}</strong> asked you, {info.signer.name}, to sign this document.
        </p>
        {info.message && <blockquote className='esign-intro__message'>{info.message}</blockquote>}
        <p className='esign-intro__steps'>
          Press <strong>Start</strong> below to go to each place you need to sign, then finish at the end.
          {info.expires_at && ` This link works until ${formatDate(info.expires_at)}.`}
        </p>
      </section>

      {pdf ? (
        pages.map((page) => (
          <div key={page} className='esign-public__page'>
            <p className='esign-public__page-label'>Page {page + 1} of {info.page_count}</p>
            <FieldStage
              pdf={pdf}
              pageIndex={page}
              fields={fieldsByPage(page)}
              describeField={(f) => `${fieldLabel(f.kind)}${images[f.kind] ? ' (added)' : ''}, page ${f.page + 1}`}
              onActivate={(f) => {
                if (!needsSigner(f)) return;
                setStarted(true);
                setCurrentId(f.id);
                setDialogKind(f.kind);
              }}
              fieldStyle={(f) => ({ '--signer': '#2563eb', cursor: needsSigner(f) ? 'pointer' : 'default' })}
              fieldClassName={(f) => (f.id === currentId && !isDone(f) ? 'esign-field--current' : '')}
              renderField={(f) => {
                const flag = f.id === currentId && !isDone(f) && (
                  // Beside the field: on its left, or its right when it's near the page's left edge
                  <span className={`esign-field__flag ${f.x < 0.22 ? 'esign-field__flag--right' : ''}`} aria-hidden='true'>
                    {f.kind === 'initials' ? 'Initial' : 'Sign'}
                  </span>
                );
                if (images[f.kind]) return <img src={images[f.kind].dataUrl} alt='' draggable={false} />;
                if (f.kind === 'date') return <span className='esign-field__value'>{today}</span>;
                if (f.kind === 'name') return <span className='esign-field__value'>{info.signer.name}</span>;
                return (
                  <>
                    {flag}
                    <span className='esign-field__label esign-field__label--todo'>Tap to add {f.kind}</span>
                  </>
                );
              }}
            />
          </div>
        ))
      ) : (
        <p className='esign-empty'>Loading the document…</p>
      )}

      {pdf && todo.length > 0 && (
        // Sticks to the bottom of the screen while the pages scroll past
        <div className='esign-guide' role='region' aria-label='Signing guide'>
          <div className='esign-guide__progress'>
            <span className='esign-guide__count'>{doneCount} of {todo.length}</span>
            <span className='esign-guide__text'>
              {nextField
                ? `${todo.length === 1 ? 'field' : 'fields'} done · next: ${nextField.kind} on page ${nextField.page + 1}`
                : `${todo.length === 1 ? 'field' : 'fields'} done · ready to finish`}
            </span>
            <span className='esign-guide__bar' aria-hidden='true'>
              <span style={{ width: `${(doneCount / todo.length) * 100}%` }} />
            </span>
          </div>
          <button type='button' className='esign-guide__button' onClick={guideNext}>
            {!nextField ? 'Finish' : started ? 'Next' : 'Start'}
          </button>
        </div>
      )}

      {/* file-converter: the shared button and message styles */}
      <section className='file-converter esign-finish' aria-label='Finish signing' ref={finishRef}>
        {needed.map((kind) => (
          <button key={kind} type='button' className='sign-pdf__tool' onClick={() => setDialogKind(kind)}>
            <Icon name={images[kind] ? 'check' : 'pen'} size={16} />
            {images[kind] ? `Change ${kind}` : `Add your ${kind}`}
          </button>
        ))}
        <label className='esign-check'>
          <input type='checkbox' checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          I agree to sign this document electronically, and that my electronic signature is as valid as one
          on paper. I’ve read the document.
        </label>
        {error && (
          <div className='converter-message converter-message--error' role='alert'>
            <Icon name='alert' size={16} />
            <span>{error}</span>
          </div>
        )}
        <button type='button' className='convert-btn' onClick={sign} disabled={isSigning}>
          <span className='btn-icon' aria-hidden='true'>
            {isSigning ? <span className='btn-spinner' /> : <Icon name='pen' size={18} />}
          </span>
          {isSigning ? 'Signing…' : 'Finish signing'}
        </button>

        {isDeclining ? (
          <div className='esign-decline'>
            <label className='esign-label' htmlFor='esign-decline-reason'>Why are you declining? (optional)</label>
            <textarea id='esign-decline-reason' className='esign-input esign-input--wide' rows={2} maxLength={500}
              value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
            <div className='esign-decline__actions'>
              <button type='button' className='esign-action esign-action--danger' onClick={decline} disabled={isSigning}>
                Decline to sign
              </button>
              <button type='button' className='esign-link-btn' onClick={() => setIsDeclining(false)}>Back</button>
            </div>
          </div>
        ) : (
          <button type='button' className='esign-link-btn esign-link-btn--muted' onClick={() => setIsDeclining(true)}>
            I don’t want to sign this
          </button>
        )}
        <p className='esign-finish__legal'>
          Your name, email, the time and your network address are recorded in the document’s audit trail.
          See our <Link to='/privacy'>Privacy Policy</Link>.
        </p>
      </section>

      {dialogKind && (
        <SignatureDialog
          kind={dialogKind}
          onClose={() => setDialogKind(null)}
          onDone={(image) => {
            const kind = dialogKind;
            const nextImages = { ...images, [kind]: image };
            setImages(nextImages);
            setDialogKind(null);
            setError('');
            // On to the next field still to fill, or to Finish
            const following = todo.find((field) => !nextImages[field.kind]) || null;
            setTimeout(() => goTo(following), 150);
          }}
        />
      )}
    </Shell>
  );
};

export default SigningPage;
