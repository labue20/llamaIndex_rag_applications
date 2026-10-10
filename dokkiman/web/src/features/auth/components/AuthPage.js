/**
 * Auth Page
 * Sign in / start the free trial with Google, or with an email and password
 * (when the server allows it). A new email account is confirmed through an
 * emailed link before it exists; forgotten passwords are reset by email.
 */

import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import LogoMark from '../../../shared/components/LogoMark';
import { useAuth } from '../context/AuthContext';
import { useAuthConfig } from '../hooks/useAuthConfig';
import { usePlanInfo } from '../hooks/usePlanInfo';
import GoogleSignInButton from './GoogleSignInButton';
import PasswordInput, { PasswordChecklist } from './PasswordInput';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../passwordRules';
import '../styles/auth.scss';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Forgot password: email a reset link (the answer is the same whether or not there's an account)
const ForgotPasswordForm = ({ initialEmail }) => {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);

  const send = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter the email address you signed up with.');
      return;
    }
    setIsSending(true);
    setError('');
    try {
      await requestPasswordReset(trimmed);
      setSentTo(trimmed);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  if (sentTo) {
    return (
      <div className='auth-form__help' role='status'>
        If there&apos;s an account for <strong>{sentTo}</strong>, we&apos;ve emailed it a link to choose a new
        password. The link works for 60 minutes. Check your spam folder if it doesn&apos;t arrive.
      </div>
    );
  }
  return (
    <div className='auth-form__help auth-forgot' role='group' aria-label='Reset your password'>
      <span>We&apos;ll email you a link to choose a new password.</span>
      <div className='auth-forgot__row'>
        <input
          type='email'
          className='auth-form__input'
          aria-label='Email for the reset link'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder='you@example.com'
          maxLength={254}
        />
        <button type='button' className='auth-forgot__send' onClick={send} disabled={isSending}>
          {isSending ? 'Sending…' : 'Email me a link'}
        </button>
      </div>
      {error && <span className='auth-forgot__error' role='alert'>{error}</span>}
    </div>
  );
};

// After signing up with an email: the account is made once the emailed link is used
const CheckYourEmail = ({ email, onResend, onChangeEmail }) => {
  const [note, setNote] = useState('');
  const [isResending, setIsResending] = useState(false);
  const resend = async () => {
    setIsResending(true);
    setNote('');
    try {
      await onResend();
      setNote('Sent again. It can take a minute to arrive.');
    } catch (err) {
      setNote(err.message);
    } finally {
      setIsResending(false);
    }
  };
  return (
    <div className='auth-check' role='status'>
      <span className='auth-check__icon' aria-hidden='true'><Icon name='check' size={22} /></span>
      <h2 className='auth-check__title'>Check your email</h2>
      <p>
        We sent a link to <strong>{email}</strong>. Click it to confirm your email and finish creating your
        account. The link works for 24 hours.
      </p>
      <p className='auth-check__small'>Can&apos;t find it? Check your spam or promotions folder.</p>
      <div className='auth-check__actions'>
        <button type='button' className='auth-form__link' onClick={resend} disabled={isResending}>
          {isResending ? 'Sending…' : 'Send it again'}
        </button>
        <button type='button' className='auth-form__link' onClick={onChangeEmail}>Use a different email</button>
      </div>
      {note && <p className='auth-check__small'>{note}</p>}
    </div>
  );
};

const ErrorMessage = ({ error, onSignInInstead }) => (
  <div className='auth-form__error' role='alert'>
    <Icon name='alert' size={16} />
    <span>
      {error.message}
      {error.code === 'email_taken' && (
        <>
          {' '}
          <button type='button' className='auth-form__inline-link' onClick={onSignInInstead}>
            Sign in instead
          </button>
        </>
      )}
    </span>
  </div>
);

// Email + password (only when the server has PASSWORD_LOGIN_ENABLED)
const PasswordForm = ({ isSignup, switchMode }) => {
  const { login, signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null); // { message, code }
  const [showForgot, setShowForgot] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState(''); // a sign-up waiting for its email to be confirmed
  const passwordRef = useRef(null);

  // "This email already has an account": keep the email and move to Sign in
  const signInInstead = () => {
    switchMode('login');
    setError(null);
    setPassword('');
    passwordRef.current?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError({ message: 'Enter a valid email address, like you@example.com.' });
      return;
    }
    const problem = isSignup && passwordProblem(password, trimmedEmail);
    if (problem) {
      setError({ message: problem });
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignup) {
        const result = await signup(trimmedEmail, password);
        if (result.verificationSent) {
          setSentTo(result.email);
          setIsSubmitting(false);
        }
      } else {
        await login(trimmedEmail, password);
      }
    } catch (err) {
      setError({ message: err.message, code: err.code });
      setIsSubmitting(false);
    }
  };

  if (isSignup && sentTo) {
    return (
      <CheckYourEmail
        email={sentTo}
        onResend={() => signup(sentTo, password)}
        onChangeEmail={() => {
          setSentTo('');
          setPassword('');
        }}
      />
    );
  }

  return (
    <>
      <div className='auth-card__tabs' role='tablist'>
        <button
          type='button'
          role='tab'
          aria-selected={!isSignup}
          className={`auth-card__tab ${!isSignup ? 'auth-card__tab--active' : ''}`}
          onClick={() => { setError(null); setShowForgot(false); switchMode('login'); }}
        >
          Sign in
        </button>
        <button
          type='button'
          role='tab'
          aria-selected={isSignup}
          className={`auth-card__tab ${isSignup ? 'auth-card__tab--active' : ''}`}
          onClick={() => { setError(null); setShowForgot(false); switchMode('signup'); }}
        >
          Create account
        </button>
      </div>

      <form className='auth-form' onSubmit={handleSubmit} noValidate>
        <div className='auth-form__field'>
          <label className='auth-form__label' htmlFor='auth-email'>Email</label>
          <input
            id='auth-email'
            type='email'
            className='auth-form__input'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete={isSignup ? 'email' : 'username'}
            placeholder='you@example.com'
            maxLength={254}
            required
          />
        </div>

        <div className='auth-form__field'>
          <div className='auth-form__label-row'>
            <label className='auth-form__label' htmlFor='auth-password'>Password</label>
            {!isSignup && (
              <button
                type='button'
                className='auth-form__link'
                aria-expanded={showForgot}
                onClick={() => setShowForgot((shown) => !shown)}
              >
                Forgot password?
              </button>
            )}
          </div>
          <PasswordInput
            id='auth-password'
            inputRef={passwordRef}
            value={password}
            onChange={setPassword}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            placeholder={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
            describedBy={isSignup ? 'auth-password-checks' : undefined}
          />
          {isSignup && <PasswordChecklist id='auth-password-checks' password={password} email={email} />}
          {!isSignup && showForgot && <ForgotPasswordForm initialEmail={email.trim()} />}
        </div>

        {error && <ErrorMessage error={error} onSignInInstead={signInInstead} />}

        <button
          type='submit'
          className='auth-form__submit'
          disabled={isSubmitting || !email.trim() || !password}
        >
          {isSubmitting && <span className='auth-form__spinner' aria-hidden='true' />}
          {isSignup ? 'Start free trial' : 'Sign in'}
        </button>
      </form>
    </>
  );
};

const AuthPage = ({ initialMode = 'login', onBack, onModeChange }) => {
  const { loginWithGoogle } = useAuth();
  const { trial_days: trialDays } = usePlanInfo();
  const authConfig = useAuthConfig();
  const [mode, setMode] = useState(initialMode);
  const [googleError, setGoogleError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  const isSignup = mode === 'signup';
  const hasGoogle = Boolean(authConfig.google_client_id);
  const noSignInMethod = authConfig.loaded && !hasGoogle && !authConfig.password_login;

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setGoogleError('');
    onModeChange?.(nextMode);
  };

  const handleGoogleCredential = async (credential) => {
    setGoogleError('');
    setIsSigningIn(true);
    try {
      await loginWithGoogle(credential);
    } catch (err) {
      setGoogleError(err.message);
      setIsSigningIn(false);
    }
  };

  return (
    <div className='auth-page'>
      <div className='auth-card'>
        {onBack && (
          <button type='button' className='auth-card__back' onClick={onBack}>
            <Icon name='arrowLeft' size={16} />
            Back to home
          </button>
        )}
        <div className='auth-card__brand'>
          <span className='auth-card__logo'>
            <LogoMark size={20} />
          </span>
          <span className='auth-card__product'>Dokkiman</span>
        </div>

        <h1 className='auth-card__title'>
          {isSignup ? 'Start your free trial' : 'Welcome back'}
        </h1>
        <p className='auth-card__subtitle'>
          {isSignup
            ? `Full access for ${trialDays} days. No credit card needed.`
            : 'Sign in to chat with your documents.'}
        </p>

        {hasGoogle && (
          <div className='auth-sso'>
            {isSigningIn ? (
              <p className='auth-sso__busy' role='status'>
                <span className='auth-form__spinner' aria-hidden='true' />
                Signing you in…
              </p>
            ) : (
              <GoogleSignInButton
                clientId={authConfig.google_client_id}
                text={isSignup ? 'signup_with' : 'signin_with'}
                onCredential={handleGoogleCredential}
              />
            )}
            {googleError && <ErrorMessage error={{ message: googleError }} />}
            <p className='auth-sso__note'>
              {isSignup
                ? 'Use your Google account. No new password to remember.'
                : 'Use the Google account you signed up with.'}
            </p>
            <p className='auth-sso__legal'>
              By continuing, you agree to our <Link to='/terms'>Terms of Service</Link> and{' '}
              <Link to='/privacy'>Privacy Policy</Link>.
            </p>
          </div>
        )}

        {noSignInMethod && (
          <div className='auth-form__error' role='alert'>
            <Icon name='alert' size={16} />
            <span>
              {authConfig.unreachable
                ? "Can't reach the server. Check your connection, then reload the page."
                : 'Sign-in isn’t available right now. Please try again later.'}
            </span>
          </div>
        )}

        {authConfig.password_login && (
          <>
            {hasGoogle && <div className='auth-sso__divider'><span>or use email</span></div>}
            <PasswordForm isSignup={isSignup} switchMode={switchMode} />
          </>
        )}

        <p className='auth-card__switch'>
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type='button' onClick={() => switchMode(isSignup ? 'login' : 'signup')}>
            {isSignup ? 'Sign in' : 'Start a free trial'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
