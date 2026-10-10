/**
 * Google Sign-In Button
 * Google's own button (Google Identity Services). When someone picks their
 * account, Google hands us an ID token that the server checks.
 */

import React, { useEffect, useRef, useState } from 'react';

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
let scriptPromise = null;

const loadGoogleScript = () => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error('No Google')));
      script.onerror = () => {
        scriptPromise = null; // let a later attempt try again
        reject(new Error('Google sign-in script failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
};

// text: 'signin_with' ("Sign in with Google") or 'signup_with' ("Sign up with Google")
const GoogleSignInButton = ({ clientId, text = 'continue_with', onCredential }) => {
  const containerRef = useRef(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    loadGoogleScript()
      .then((google) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => onCredentialRef.current(response.credential),
          ux_mode: 'popup',
          itp_support: true,
        });
        google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text,
          logo_alignment: 'center',
          width: Math.min(400, Math.max(220, container.clientWidth || 320)),
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  return (
    <div className='auth-google'>
      <div ref={containerRef} className='auth-google__button' data-testid='google-button' />
      {loadError && (
        <p className='auth-form__error' role='alert'>
          Google sign-in couldn&apos;t load. Check your connection (or allow accounts.google.com if you use a
          blocker), then reload the page.
        </p>
      )}
    </div>
  );
};

export default GoogleSignInButton;
