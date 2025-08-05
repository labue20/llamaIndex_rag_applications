/**
 * Authentication Hook
 * Custom hook for managing user authentication state
 * (Example template for future authentication feature)
 */

import { useState, useCallback, useEffect } from 'react';
import { authApi } from '../services/authApi';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  /**
   * Login user
   * @param {string} email - User email
   * @param {string} password - User password
   */
  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authApi.login(email, password);
      setUser(result.user);
      setIsAuthenticated(true);
      
      // Store token in localStorage or secure storage
      localStorage.setItem('authToken', result.token);
      
      return { success: true, user: result.user };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Logout user
   */
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.warn('Logout API call failed:', err);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem('authToken');
    }
  }, []);

  /**
   * Register new user
   * @param {Object} userData - User registration data
   */
  const register = useCallback(async (userData) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authApi.register(userData);
      return { success: true, user: result.user };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Check if user is authenticated on app start
   */
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      // Verify token with server
      authApi.verifyToken(token)
        .then((result) => {
          if (result.valid) {
            setUser(result.user);
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem('authToken');
          }
        })
        .catch(() => {
          localStorage.removeItem('authToken');
        });
    }
  }, []);

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    login,
    logout,
    register,
  };
};
