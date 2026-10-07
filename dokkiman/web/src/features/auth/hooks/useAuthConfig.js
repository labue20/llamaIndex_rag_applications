/**
 * How people can sign in (from GET /auth/config): the Google client ID, and
 * whether email + password is allowed (local development only).
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../shared/services/apiClient';

// unreachable: the server couldn't be contacted (so we don't know how to sign in)
const DEFAULT_CONFIG = { google_client_id: '', password_login: false, loaded: false, unreachable: false };

let cachedConfig = null;

export const resetAuthConfigCache = () => {
  cachedConfig = null;
};

export const useAuthConfig = () => {
  const [config, setConfig] = useState(cachedConfig || DEFAULT_CONFIG);

  useEffect(() => {
    if (cachedConfig) return undefined;
    let cancelled = false;
    apiFetch('/auth/config')
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => 'unreachable')
      .then((data) => {
        if (cancelled) return;
        if (data === 'unreachable') {
          setConfig({ ...DEFAULT_CONFIG, loaded: true, unreachable: true });
          return;
        }
        const next = { ...DEFAULT_CONFIG, ...(data || {}), loaded: true };
        if (data) cachedConfig = next;
        setConfig(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
};
