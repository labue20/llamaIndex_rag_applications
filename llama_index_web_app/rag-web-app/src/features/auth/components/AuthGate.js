/**
 * Auth Gate
 * Renders the app only for a logged-in user; otherwise the homepage,
 * which leads to the sign-in / create-account page
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AuthPage from './AuthPage';
import UpgradeDialog from './UpgradeDialog';
import { HomePage } from '../../home';

const AuthGate = ({ children }) => {
  const { user, isCheckingSession } = useAuth();
  // 'home' | 'login' | 'signup'
  const [view, setView] = useState('home');

  // After logging out (or the session expiring) start again from the homepage
  useEffect(() => {
    if (user) setView('home');
  }, [user]);

  if (isCheckingSession) {
    return (
      <div className='auth-page'>
        <span className='auth-form__spinner auth-form__spinner--large' aria-label='Loading' />
      </div>
    );
  }

  if (!user) {
    if (view === 'home') {
      return <HomePage onLogin={() => setView('login')} onSignup={() => setView('signup')} />;
    }
    return <AuthPage key={view} initialMode={view} onBack={() => setView('home')} />;
  }

  // Keyed by user so switching accounts starts from a clean app state
  return (
    <React.Fragment key={user.id}>
      {children}
      <UpgradeDialog />
    </React.Fragment>
  );
};

export default AuthGate;
