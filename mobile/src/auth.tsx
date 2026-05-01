import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, getToken, setToken, type AuthResult, type User } from './api';

type AppleAuthResponse = {
  needs_handle: boolean;
  suggested_display_name: string | null;
  apple_email: string | null;
  access_token: string | null;
  user: User | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, handle: string) => Promise<void>;
  signInWithApple: (
    identityToken: string,
    displayName?: string | null,
    handle?: string,
  ) => Promise<AppleAuthResponse>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) {
        setLoading(false);
        return;
      }
      try {
        const me = await api<User>('/auth/me');
        setUser(me);
      } catch {
        await setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function signIn(email: string, password: string) {
    const res = await api<AuthResult>('/auth/login', {
      form: { username: email, password },
      auth: false,
    });
    await setToken(res.access_token);
    setUser(res.user);
  }

  async function signUp(email: string, password: string, displayName: string, handle: string) {
    const res = await api<AuthResult>('/auth/register', {
      body: { email, password, display_name: displayName, handle },
      auth: false,
    });
    await setToken(res.access_token);
    setUser(res.user);
  }

  async function signInWithApple(
    identityToken: string,
    displayName?: string | null,
    handle?: string,
  ): Promise<AppleAuthResponse> {
    const res = await api<AppleAuthResponse>('/auth/apple', {
      body: {
        identity_token: identityToken,
        display_name: displayName ?? null,
        handle: handle ?? null,
      },
      auth: false,
    });
    if (res.access_token && res.user) {
      await setToken(res.access_token);
      setUser(res.user);
    }
    return res;
  }

  async function signOut() {
    await setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    try {
      const me = await api<User>('/auth/me');
      setUser(me);
    } catch {
      /* no-op: 期限切れ等は次回ガードで処理 */
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, signInWithApple, signOut, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
