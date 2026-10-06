/**
 * Auth Gate
 * Renders the app only for a logged-in user; otherwise the sign-in page
 */

import React from 'react';
import { useAuth } from '../context/AuthContext';
import AuthPage from './AuthPage';

const AuthGate = ({ children }) => {
  const { user, isCheckingSession } = useAuth();

  if (isCheckingSession) {
    return (
      <div className='auth-page'>
        <span className='auth-form__spinner auth-form__spinner--large' aria-label='Loading' />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  // Keyed by user so switching accounts starts from a clean app state
  return <React.Fragment key={user.id}>{children}</React.Fragment>;
};

export default AuthGate;
