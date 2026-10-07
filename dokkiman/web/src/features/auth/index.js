/**
 * Authentication Feature Exports
 */

export { AuthProvider, useAuth } from './context/AuthContext';
export { default as AuthGate } from './components/AuthGate';
export { default as AuthPage } from './components/AuthPage';
export { default as TrialBadge } from './components/TrialBadge';
export { default as AccountMenu } from './components/AccountMenu';
export { default as GuestAccountPrompt } from './components/GuestAccountPrompt';
export { usePlanInfo } from './hooks/usePlanInfo';
export { useAuthConfig } from './hooks/useAuthConfig';
