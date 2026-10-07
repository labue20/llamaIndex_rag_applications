/**
 * Password Input
 * Password field with a Show/Hide toggle and a Caps Lock warning
 */

import React, { useState } from 'react';
import Icon from '../../../shared/components/Icon';
import { MAX_PASSWORD_LENGTH, passwordChecks } from '../passwordRules';

const PasswordInput = ({ id, value, onChange, autoComplete, placeholder, describedBy, inputRef }) => {
  const [isShown, setIsShown] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const checkCapsLock = (e) => setCapsLock(Boolean(e.getModifierState?.('CapsLock')));

  return (
    <>
      {/* The Show/Hide button sits outside the label so the field is announced as just its label */}
      <div className='auth-form__password'>
        <input
          id={id}
          ref={inputRef}
          type={isShown ? 'text' : 'password'}
          className='auth-form__input'
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={checkCapsLock}
          onKeyUp={checkCapsLock}
          onBlur={() => setCapsLock(false)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          maxLength={MAX_PASSWORD_LENGTH}
          aria-describedby={describedBy}
          required
        />
        <button
          type='button'
          className='auth-form__toggle'
          onClick={() => setIsShown((shown) => !shown)}
          aria-label={isShown ? 'Hide password' : 'Show password'}
        >
          {isShown ? 'Hide' : 'Show'}
        </button>
      </div>
      {capsLock && <p className='auth-form__caps' role='status'>Caps Lock is on</p>}
    </>
  );
};

export const PasswordChecklist = ({ id, password, email }) => (
  <ul id={id} className='auth-form__checks' aria-label='Password requirements'>
    {passwordChecks(password, email).map((check) => (
      <li key={check.id} className={check.ok ? 'auth-form__check auth-form__check--ok' : 'auth-form__check'}>
        <Icon name={check.ok ? 'checkCircle' : 'alert'} size={14} />
        <span>{check.label}</span>
        <span className='sr-only'>{check.ok ? ' (done)' : ' (not yet)'}</span>
      </li>
    ))}
  </ul>
);

export default PasswordInput;
