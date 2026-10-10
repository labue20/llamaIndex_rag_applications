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
 *   /verify-email, /reset-password  where the links in account emails lead
 *   /support       quick answers and a form to contact us
 *   /solutions, /solutions/<who>  how Dokkiman helps each kind of user (src/seo/solutionPages.json)
 *   /compress-pdf, /edit-pdf...  a public page for each tool (src/seo/toolPages.json)
 */

import React from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthPage from './AuthPage';
import { ResetPasswordPage, VerifyEmailPage } from './EmailLinkPages';
import UpgradeDialog from './UpgradeDialog';
import UpgradeReturnNotice from './UpgradeReturnNotice';
import { HomePage } from '../../home';
import { LegalPage } from '../../legal';
import { PricingPage } from '../../pricing';
import { HOME_AFTER_LOGIN, appPath } from '../../../routes';
import { SigningPage } from '../../e-sign';
import { AdminPage } from '../../admin';
import usePageMeta from '../../../seo/usePageMeta';
import TOOL_PAGES from '../../../seo/toolPages.json';
import { ToolPage } from '../../tool-pages';
import { SupportPage } from '../../support';
import { SolutionPage, SolutionsIndexPage } from '../../solutions';
import SOLUTION_PAGES from '../../../seo/solutionPages.json';
import { handFilesToTool } from '../../../shared/utils/toolHandOff';
import { sendForSignature } from '../../e-sign';

const AuthGate = ({ children }) => {
  const { user, isCheckingSession, showHome, showAuth, tryTool, pathAfterAuth } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  usePageMeta();

  // Tool pages arrive with their content already in the HTML: show it at once,
  // rather than a spinner while the session is checked
  const isToolPage = [...TOOL_PAGES, ...SOLUTION_PAGES].some((page) => page.path === pathname) || pathname === '/solutions';
  if (isCheckingSession && !isToolPage) {
    return (
      <div className='auth-page'>
        <span className='auth-form__spinner auth-form__spinner--large' aria-label='Loading' />
      </div>
    );
  }

  const publicPageProps = {
    isLoggedIn: !!user,
    onLogin: () => showAuth('login'),
    onSignup: () => showAuth('signup'),
    onOpenManager: () => showAuth('signup'),
    onOpenApp: () => navigate(HOME_AFTER_LOGIN),
  };

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
      {TOOL_PAGES.map((page) => (
        <Route
          key={page.path}
          path={page.path}
          element={
            <ToolPage
              page={page}
              isLoggedIn={!!user}
              onLogin={() => showAuth('login')}
              onSignup={() => showAuth('signup')}
              onOpenManager={() => showAuth('signup')}
              onOpenApp={() => navigate(HOME_AFTER_LOGIN)}
              // Open the tool, with the files chosen here
              onOpen={(files) => {
                // Request Signatures opens E-Sign's Request signatures tab with the file
                if (files.length && page.mode === 'request') sendForSignature(files[0]);
                else if (files.length) handFilesToTool(page.app, files);
                navigate(appPath(page.app));
              }}
            />
          }
        />
      ))}
      {/* Public pages share these */}
      <Route path='/solutions' element={<SolutionsIndexPage {...publicPageProps} />} />
      {SOLUTION_PAGES.map((page) => (
        <Route key={page.path} path={page.path} element={<SolutionPage page={page} {...publicPageProps} />} />
      ))}
      <Route
        path='/support'
        element={
          <SupportPage
            isLoggedIn={!!user}
            onLogin={() => showAuth('login')}
            onSignup={() => showAuth('signup')}
            onOpenManager={() => showAuth('signup')}
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
      <Route path='/verify-email' element={<VerifyEmailPage />} />
      <Route path='/reset-password' element={<ResetPasswordPage />} />
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
