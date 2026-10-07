/**
 * Auth Page
 * Sign in / create account screen shown when nobody is logged in
 */

import React, { useRef, useState } from 'react';
import Icon from '../../../shared/components/Icon';
import { useAuth } from '../context/AuthContext';
import { usePlanInfo } from '../hooks/usePlanInfo';
import PasswordInput, { PasswordChecklist } from './PasswordInput';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../passwordRules';
import '../styles/auth.scss';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ForgotPasswordHelp = ({ supportEmail }) => (
  <div className='auth-form__help' role='note'>
    {supportEmail ? (
      <>
        Email <a href={`mailto:${supportEmail}?subject=Password%20reset`}>{supportEmail}</a> from the address
        you signed up with, and we&apos;ll send you a temporary password.
      </>
    ) : (
      <>Contact the person who runs this site and they can give you a temporary password.</>
    )}
  </div>
);

const AuthPage = ({ initialMode = 'login', onBack, onModeChange }) => {
  const { login, signup } = useAuth();
  const { trial_days: trialDays, support_email: supportEmail } = usePlanInfo();
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null); // { message, code }
  const [showForgot, setShowForgot] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef(null);

  const isSignup = mode === 'signup';

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
    setShowForgot(false);
    onModeChange?.(nextMode);
  };

  // "This email already has an account": keep the email and move to Sign in
  const signInInstead = () => {
    switchMode('login');
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
      await (isSignup ? signup : login)(trimmedEmail, password);
    } catch (err) {
      setError({ message: err.message, code: err.code });
      setIsSubmitting(false);
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
            <Icon name='layers' size={20} />
          </span>
          <span className='auth-card__product'>RAG Web Application</span>
        </div>

        <h1 className='auth-card__title'>
          {isSignup ? 'Start your free trial' : 'Welcome back'}
        </h1>
        <p className='auth-card__subtitle'>
          {isSignup
            ? `Full access for ${trialDays} days. No credit card needed.`
            : 'Sign in to chat with your documents.'}
        </p>

        <div className='auth-card__tabs' role='tablist'>
          <button
            type='button'
            role='tab'
            aria-selected={!isSignup}
            className={`auth-card__tab ${!isSignup ? 'auth-card__tab--active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Sign in
          </button>
          <button
            type='button'
            role='tab'
            aria-selected={isSignup}
            className={`auth-card__tab ${isSignup ? 'auth-card__tab--active' : ''}`}
            onClick={() => switchMode('signup')}
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
              autoFocus
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
            {!isSignup && showForgot && <ForgotPasswordHelp supportEmail={supportEmail} />}
          </div>

          {error && (
            <div className='auth-form__error' role='alert'>
              <Icon name='alert' size={16} />
              <span>
                {error.message}
                {error.code === 'email_taken' && (
                  <>
                    {' '}
                    <button type='button' className='auth-form__inline-link' onClick={signInInstead}>
                      Sign in instead
                    </button>
                  </>
                )}
              </span>
            </div>
          )}

          <button
            type='submit'
            className='auth-form__submit'
            disabled={isSubmitting || !email.trim() || !password}
          >
            {isSubmitting && <span className='auth-form__spinner' aria-hidden='true' />}
            {isSignup ? 'Start free trial' : 'Sign in'}
          </button>
        </form>

        <p className='auth-card__switch'>
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type='button' onClick={() => switchMode(isSignup ? 'login' : 'signup')}>
            {isSignup ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
