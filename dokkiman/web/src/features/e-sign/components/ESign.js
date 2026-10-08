/**
 * E-Sign
 * Three tabs: sign a PDF yourself, request signatures from others by email,
 * and track the requests you've sent. The header's New document / Close
 * document buttons act on the tab that's open.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { SignPdf } from '../../sign-pdf';
import { useAuth } from '../../auth/context/AuthContext';
import { Icon } from '../../../shared';
import RequestSignatures from './RequestSignatures';
import SentRequests from './SentRequests';
import '../../sign-pdf/styles/sign-pdf.scss';
import '../styles/esign.scss';

const TABS = [
  { id: 'self', label: 'Sign yourself' },
  { id: 'request', label: 'Request signatures' },
  { id: 'sent', label: 'Sent' },
];

const AccountNeeded = () => {
  const { showAuth } = useAuth();
  return (
    <div className='guest-prompt'>
      <span className='guest-prompt__icon' aria-hidden='true'><Icon name='pen' size={24} /></span>
      <h3 className='guest-prompt__title'>Send documents for signature</h3>
      <p className='guest-prompt__text'>
        Email a PDF to others to sign. They sign online without an account, and everyone gets the signed copy
        with an audit trail. Create a free account to start.
      </p>
      <div className='guest-prompt__actions'>
        <button type='button' className='guest-prompt__primary' onClick={() => showAuth('signup')}>
          Create free account
        </button>
        <button type='button' className='guest-prompt__secondary' onClick={() => showAuth('login')}>Log in</button>
      </div>
    </div>
  );
};

const ESign = forwardRef(({ onStatusChange, allowDocumentManager = true, isGuest = false }, ref) => {
  const [tab, setTab] = useState('self');
  const selfRef = useRef(null);
  const requestRef = useRef(null);
  const [statuses, setStatuses] = useState({ self: {}, request: {} });

  const reportSelf = useCallback((status) => setStatuses((prev) => ({ ...prev, self: status })), []);
  const reportRequest = useCallback((status) => setStatuses((prev) => ({ ...prev, request: status })), []);

  useEffect(() => {
    const current = statuses[tab] || {};
    onStatusChange?.({ hasFile: !!current.hasFile, isBusy: !!current.isBusy });
  }, [onStatusChange, statuses, tab]);

  useImperativeHandle(ref, () => ({
    selectFile: (file) => {
      if (tab === 'self') {
        selfRef.current?.selectFile(file);
      } else if (!isGuest) {
        setTab('request');
        requestRef.current?.selectFile(file);
      }
    },
    reset: () => (tab === 'self' ? selfRef : requestRef).current?.reset(),
  }), [tab, isGuest]);

  return (
    <div className='esign'>
      <div className='esign-tabs' role='tablist' aria-label='E-Sign'>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type='button'
            role='tab'
            id={`esign-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`esign-panel-${id}`}
            className={`esign-tab ${tab === id ? 'esign-tab--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* All tabs stay mounted, so switching doesn't lose work in progress */}
      <div role='tabpanel' id='esign-panel-self' aria-labelledby='esign-tab-self' hidden={tab !== 'self'}>
        <SignPdf ref={selfRef} onStatusChange={reportSelf} allowDocumentManager={allowDocumentManager} />
      </div>
      <div role='tabpanel' id='esign-panel-request' aria-labelledby='esign-tab-request' hidden={tab !== 'request'}>
        {isGuest ? <AccountNeeded /> : (
          <RequestSignatures
            ref={requestRef}
            onStatusChange={reportRequest}
            allowDocumentManager={allowDocumentManager}
            onShowSent={() => setTab('sent')}
          />
        )}
      </div>
      <div role='tabpanel' id='esign-panel-sent' aria-labelledby='esign-tab-sent' hidden={tab !== 'sent'}>
        {isGuest ? <AccountNeeded /> : <SentRequests active={tab === 'sent'} onNew={() => setTab('request')} />}
      </div>
    </div>
  );
});

export default ESign;
