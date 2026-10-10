/**
 * Email Link Pages
 * Where the links in our emails lead:
 *   /verify-email?token=...    confirm a new account's email (and sign in)
 *   /reset-password?token=...  choose a new password (and sign in)
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import LogoMark from '../../../shared/components/LogoMark';
import { useAuth } from '../context/AuthContext';
import PasswordInput, { PasswordChecklist } from './PasswordInput';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../passwordRules';
import '../styles/auth.scss';

const Card = ({ title, children }) => (
  <div className='auth-page'>
    <div className='auth-card'>
      <div className='auth-card__brand'>
        <span className='auth-card__logo'><LogoMark size={20} /></span>
        <span className='auth-card__product'>Dokkiman</span>
      </div>
      <h1 className='auth-card__title'>{title}</h1>
      {children}
    </div>
  </div>
);

const Problem = ({ children }) => (
  <div className='auth-form__error' role='alert'>
    <Icon name='alert' size={16} />
    <span>{children}</span>
  </div>
);

export const VerifyEmailPage = () => {
  const { verifyEmail } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState('checking'); // checking | password | invalid
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const started = useRef(false);

  // Opened in the browser that signed up, the link alone finishes the sign-up
  useEffect(() => {
    if (started.current) return; // once, even when React runs effects twice
    started.current = true;
    if (!token) {
      setState('invalid');
      return;
    }
    verifyEmail(token).catch((err) => {
      if (err.code === 'password_needed') {
        setState('password');
      } else {
        setError(err.message);
        setState('invalid');
      }
    });
  }, [token, verifyEmail]);

  const finish = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      await verifyEmail(token, password);
    } catch (err) {
      setError(err.message);
      if (err.code === 'link_invalid') setState('invalid');
      setIsSubmitting(false);
    }
  };

  if (state === 'checking') {
    return (
      <Card title='Confirming your email…'>
        <p className='auth-sso__busy' role='status'>
          <span className='auth-form__spinner' aria-hidden='true' />
          One moment.
        </p>
      </Card>
    );
  }
  if (state === 'invalid') {
    return (
      <Card title='This link doesn’t work'>
        <Problem>{error || 'This link is incomplete. Open the link from the email again.'}</Problem>
        <p className='auth-card__switch'>
          <Link to='/signup'>Sign up again</Link> to get a new link, or <Link to='/login'>sign in</Link>.
        </p>
      </Card>
    );
  }
  return (
    <Card title='Finish creating your account'>
      <p className='auth-card__subtitle'>
        You opened the link in a different browser. Enter the password you chose when you signed up.
      </p>
      <form className='auth-form' onSubmit={finish} noValidate>
        <div className='auth-form__field'>
          <label className='auth-form__label' htmlFor='verify-password'>Password</label>
          <PasswordInput id='verify-password' value={password} onChange={setPassword}
            autoComplete='current-password' placeholder='The password you chose' />
        </div>
        {error && <Problem>{error}</Problem>}
        <button type='submit' className='auth-form__submit' disabled={isSubmitting || !password}>
          {isSubmitting && <span className='auth-form__spinner' aria-hidden='true' />}
          Confirm and sign in
        </button>
      </form>
    </Card>
  );
};

export const ResetPasswordPage = () => {
  const { resetPassword } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null); // { message, code }
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      setError({ message: problem });
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await resetPassword(token, password);
    } catch (err) {
      setError({ message: err.message, code: err.code });
      setIsSubmitting(false);
    }
  };

  return (
    <Card title='Choose a new password'>
      <p className='auth-card__subtitle'>You&apos;ll be signed in, and signed out on your other devices.</p>
      <form className='auth-form' onSubmit={submit} noValidate>
        <div className='auth-form__field'>
          <label className='auth-form__label' htmlFor='reset-password'>New password</label>
          <PasswordInput id='reset-password' value={password} onChange={setPassword} autoComplete='new-password'
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} describedBy='reset-password-checks' />
          <PasswordChecklist id='reset-password-checks' password={password} email='' />
        </div>
        {error && (
          <Problem>
            {error.message}
            {error.code === 'link_invalid' && <> <Link to='/login'>Ask for a new link</Link>.</>}
          </Problem>
        )}
        <button type='submit' className='auth-form__submit' disabled={isSubmitting || !password || !token}>
          {isSubmitting && <span className='auth-form__spinner' aria-hidden='true' />}
          Save new password
        </button>
      </form>
    </Card>
  );
};
