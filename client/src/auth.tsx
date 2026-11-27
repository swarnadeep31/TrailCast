import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Credentials } from './api.ts';
import type { User } from './types.ts';

export interface Auth {
  // undefined while checking the session cookie, then null (logged out) or the user.
  user: User | null | undefined;
  loading: boolean;
  setUser: (user: User | null) => void;
  signup: (details: Credentials) => Promise<User>;
  login: (credentials: Credentials) => Promise<User>;
  loginWithGoogle: (credential: string) => Promise<{ user: User; existing: boolean; passwordRemoved: boolean }>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

// Knows who is logged in, for every page. Wraps the whole app in App.tsx.
export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined while checking the session cookie, then null (logged out) or the user.
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.me().then(
      (data) => setUser(data.user),
      () => setUser(null),
    );
  }, []);

  const value = useMemo(
    (): Auth => ({
      user,
      loading: user === undefined,
      setUser,
      async signup(details) {
        const created = await api.signup(details);
        setUser(created);
        return created;
      },
      async login(credentials) {
        const loggedIn = await api.login(credentials);
        setUser(loggedIn);
        return loggedIn;
      },
      // Returns { user, existing, passwordRemoved }: existing is true when the account
      // was already there; passwordRemoved when Google replaced its password.
      async loginWithGoogle(credential) {
        const result = await api.loginWithGoogle(credential);
        setUser(result.user);
        return result;
      },
      async logout() {
        await api.logout();
        setUser(null);
      },
      // Every device this account is logged in on, this one included.
      async logoutEverywhere() {
        await api.logoutEverywhere();
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): Auth {
  return useContext(AuthContext)!;
}
