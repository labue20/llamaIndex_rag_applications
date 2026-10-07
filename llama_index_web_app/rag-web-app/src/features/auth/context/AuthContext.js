/**
 * Auth Context
 * Holds the logged-in user and exposes login / signup / logout
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HOME_AFTER_LOGIN, TOOL_PATHS } from '../../../routes';
import {
  apiFetch,
  setPlanRequiredHandler,
  setUnauthorizedHandler,
} from '../../../shared/services/apiClient';

const AuthContext = createContext(null);

const postCredentials = async (path, email, password) => {
  let response;
  try {
    response = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new Error("Can't reach the server. Make sure the backend is running.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data.user;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  // useNavigate() returns a new function after every navigation; keep the latest
  // in a ref so the callbacks below (and the session check) stay stable
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // Whether someone was logged in, to tell an expired session from a guest
  const userRef = useRef(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Re-read the user (including plan status and usage) from the server
  const refreshUser = useCallback(async () => {
    try {
      const response = await apiFetch('/auth/me');
      const data = response.ok ? await response.json() : null;
      setUser(data?.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // A 401 for a logged-in user means their session expired: ask them to sign in again
    setUnauthorizedHandler(() => {
      if (userRef.current) {
        setUser(null);
        navigateRef.current('/login');
      }
    });
    // A 402 means the free trial has ended: refresh the plan and offer an upgrade
    setPlanRequiredHandler(() => {
      refreshUser();
      setIsUpgradeOpen(true);
    });

    refreshUser().finally(() => setIsCheckingSession(false));

    return () => {
      setUnauthorizedHandler(null);
      setPlanRequiredHandler(null);
    };
  }, [refreshUser]);

  const login = useCallback(async (email, password) => {
    setUser(await postCredentials('/auth/login', email, password));
    navigateRef.current(HOME_AFTER_LOGIN);
  }, []);

  const signup = useCallback(async (email, password) => {
    setUser(await postCredentials('/auth/signup', email, password));
    navigateRef.current(HOME_AFTER_LOGIN);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setIsUpgradeOpen(false);
      navigateRef.current('/');
    }
  }, []);

  const openUpgrade = useCallback(() => setIsUpgradeOpen(true), []);
  const closeUpgrade = useCallback(() => setIsUpgradeOpen(false), []);

  const showHome = useCallback(() => navigateRef.current('/'), []);
  // mode: 'login' | 'signup'
  const showAuth = useCallback((mode) => {
    setIsUpgradeOpen(false);
    navigateRef.current(`/${mode}`);
  }, []);
  // Open a tool from the homepage ('chat' | 'pdf-word' | 'word-pdf' | 'split' | 'manager');
  // visitors without an account use it as guests
  const tryTool = useCallback((tool) => navigateRef.current(TOOL_PATHS[tool] || TOOL_PATHS.chat), []);

  const value = useMemo(
    () => ({
      user,
      isCheckingSession,
      login,
      signup,
      logout,
      refreshUser,
      isUpgradeOpen,
      openUpgrade,
      closeUpgrade,
      showHome,
      showAuth,
      tryTool,
    }),
    [user, isCheckingSession, login, signup, logout, refreshUser, isUpgradeOpen, openUpgrade, closeUpgrade,
      showHome, showAuth, tryTool]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
};
