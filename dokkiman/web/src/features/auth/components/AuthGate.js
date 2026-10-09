/**
 * Auth Gate
 * The site's routes:
 *   /              homepage
 *   /login         sign in
 *   /signup        create an account
 *   /app/<tool>    the app (the tools work for guests too; see routes.js)
 *   /pricing       Free, Basic and Pro plans
 *   /privacy       Privacy Policy
 *   /terms         Terms of Service
 *   /admin         Admin portal (admins only; the server checks)
 */

import React from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthPage from './AuthPage';
import UpgradeDialog from './UpgradeDialog';
import UpgradeReturnNotice from './UpgradeReturnNotice';
import { HomePage } from '../../home';
import { LegalPage } from '../../legal';
import { PricingPage } from '../../pricing';
import { HOME_AFTER_LOGIN } from '../../../routes';
import { SigningPage } from '../../e-sign';
import { AdminPage } from '../../admin';

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
      <Route
        path='/pricing'
        element={
          <PricingPage
            onLogin={() => showAuth('login')}
            onSignup={() => showAuth('signup')}
            onTryTool={tryTool}
            onOpenApp={() => navigate(HOME_AFTER_LOGIN)}
          />
        }
      />
      <Route path='/privacy' element={<LegalPage doc='privacy' />} />
      <Route path='/terms' element={<LegalPage doc='terms' />} />
      {/* Signing a document someone sent: no account needed */}
      <Route path='/sign/:token' element={<SigningPage />} />
      <Route path='/admin' element={user?.is_admin ? <AdminPage /> : <Navigate to='/' replace />} />
      <Route path='/login' element={authPage('login')} />
      <Route path='/signup' element={authPage('signup')} />
      <Route
        path='/app/*'
        element={
          // Keyed by user (or guest) so switching accounts starts from a clean app state
          <React.Fragment key={user ? user.id : 'guest'}>
            {children}
            <UpgradeReturnNotice />
            <UpgradeDialog />
          </React.Fragment>
        }
      />
      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  );
};

export default AuthGate;
