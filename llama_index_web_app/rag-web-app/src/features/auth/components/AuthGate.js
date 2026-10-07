/**
 * Auth Gate
 * The site's routes:
 *   /              homepage
 *   /login         sign in
 *   /signup        create an account
 *   /app/<tool>    the app (the tools work for guests too; see routes.js)
 */

import React from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthPage from './AuthPage';
import UpgradeDialog from './UpgradeDialog';
import { HomePage } from '../../home';
import { HOME_AFTER_LOGIN } from '../../../routes';

const AuthGate = ({ children }) => {
  const { user, isCheckingSession, showHome, showAuth, tryTool, pathAfterAuth } = useAuth();
  const navigate = useNavigate();

  if (isCheckingSession) {
    return (
      <div className='auth-page'>
        <span className='auth-form__spinner auth-form__spinner--large' aria-label='Loading' />
      </div>
    );
  }

  const authPage = (mode) =>
    user ? (
      <Navigate to={pathAfterAuth()} replace />
    ) : (
      <AuthPage
        initialMode={mode}
        onBack={showHome}
        // Keep the address in step with the Sign in / Create account tabs
        onModeChange={(nextMode) => navigate(`/${nextMode}`, { replace: true })}
      />
    );

  return (
    <Routes>
      <Route
        path='/'
        element={
          <HomePage
            onLogin={() => showAuth('login')}
            onSignup={() => showAuth('signup')}
            onTryTool={tryTool}
            isLoggedIn={!!user}
            onOpenApp={() => navigate(HOME_AFTER_LOGIN)}
          />
        }
      />
      <Route path='/login' element={authPage('login')} />
      <Route path='/signup' element={authPage('signup')} />
      <Route
        path='/app/*'
        element={
          // Keyed by user (or guest) so switching accounts starts from a clean app state
          <React.Fragment key={user ? user.id : 'guest'}>
            {children}
            <UpgradeDialog />
          </React.Fragment>
        }
      />
      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  );
};

export default AuthGate;
