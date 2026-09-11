import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, getToken, setToken, type User } from './api';

interface AuthValue {
  user: User | null;
  loading: boolean;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /* Credits change on every generation; this keeps the header honest. */
  setCredits: (credits: number) => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      // Expired or invalid token: drop it rather than looping on 401s.
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      async signup(email, password, displayName) {
        const { token, user } = await api.signup(email, password, displayName);
        setToken(token);
        setUser(user);
      },
      async login(email, password) {
        const { token, user } = await api.login(email, password);
        setToken(token);
        setUser(user);
      },
      async logout() {
        try {
          await api.logout();
        } catch {
          // Already invalid server-side; clearing locally is still correct.
        }
        setToken(null);
        setUser(null);
      },
      setCredits(credits) {
        // Bail out when the value has not changed. Returning a fresh object
        // every poll changes `user`'s identity, which cascades into every
        // hook that depends on it and re-triggers their fetches ~once a
        // second. That churn is what made polled results flicker back to
        // a stale status.
        setUser(current => (current && current.credits !== credits ? { ...current, credits } : current));
      },
      refresh,
    }),
    [user, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
