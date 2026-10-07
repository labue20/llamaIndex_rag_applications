/**
 * Auth Page
 * Sign in / create account screen shown when nobody is logged in
 */

import React, { useState } from 'react';
import Icon from '../../../shared/components/Icon';
import { useAuth } from '../context/AuthContext';
import { usePlanInfo } from '../hooks/usePlanInfo';
import '../styles/auth.scss';

const MIN_PASSWORD_LENGTH = 8;

const AuthPage = ({ initialMode = 'login', onBack, onModeChange }) => {
  const { login, signup } = useAuth();
  const { trial_days: trialDays } = usePlanInfo();
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    onModeChange?.(nextMode);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await (isSignup ? signup : login)(email.trim(), password);
    } catch (err) {
      setError(err.message);
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
              autoComplete='email'
              placeholder='you@example.com'
              required
              autoFocus
            />
          </div>

          <div className='auth-form__field'>
            {/* The Show/Hide button sits outside the label so the field is announced as just "Password" */}
            <label className='auth-form__label' htmlFor='auth-password'>Password</label>
            <div className='auth-form__password'>
              <input
                id='auth-password'
                type={showPassword ? 'text' : 'password'}
                className='auth-form__input'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
                required
              />
              <button
                type='button'
                className='auth-form__toggle'
                onClick={() => setShowPassword((shown) => !shown)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <div className='auth-form__error' role='alert'>
              <Icon name='alert' size={16} />
              <span>{error}</span>
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
