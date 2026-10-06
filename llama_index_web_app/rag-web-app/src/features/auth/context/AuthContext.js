/**
 * Auth Context
 * Holds the logged-in user and exposes login / signup / logout
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, setUnauthorizedHandler } from '../../../shared/services/apiClient';

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

  useEffect(() => {
    // Any 401 from the API means the session is gone: show the login page
    setUnauthorizedHandler(() => setUser(null));

    apiFetch('/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setIsCheckingSession(false));

    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email, password) => {
    setUser(await postCredentials('/auth/login', email, password));
  }, []);

  const signup = useCallback(async (email, password) => {
    setUser(await postCredentials('/auth/signup', email, password));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isCheckingSession, login, signup, logout }),
    [user, isCheckingSession, login, signup, logout]
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
