import type { AuthUser, LoginRequest } from '@gnomon/shared';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  accessToken: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export async function parseAuthResponse(response: Response): Promise<AuthResponse> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `The API returned ${contentType || 'an unexpected response'} instead of JSON. Check that /api requests are routed to the API server.`,
    );
  }

  let body: AuthResponse & { error?: { message?: string } };
  try {
    body = (await response.json()) as AuthResponse & {
      error?: { message?: string };
    };
  } catch {
    throw new Error('The API returned invalid JSON. Check the API server and /api proxy.');
  }

  if (!response.ok) {
    throw new Error(body.error?.message ?? 'The request could not be completed');
  }

  return body;
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(body.error?.message ?? 'The request could not be completed');
  }

  return body;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyAuth = useCallback((auth: AuthResponse) => {
    setAccessToken(auth.accessToken);
    setUser(auth.user);
  }, []);

  const refreshSession = useCallback(async () => {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    const auth = await parseAuthResponse(response);
    applyAuth(auth);
    return auth;
  }, [applyAuth]);

  useEffect(() => {
    let active = true;

    void refreshSession()
      .catch(() => {
        if (active) {
          setAccessToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshSession]);

  const login = useCallback(
    async (input: LoginRequest) => {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      applyAuth(await parseAuthResponse(response));
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const send = (token: string | null) => {
        const headers = new Headers(init.headers);
        if (token) headers.set('authorization', `Bearer ${token}`);
        if (init.body && !headers.has('content-type')) {
          headers.set('content-type', 'application/json');
        }

        return fetch(path, {
          ...init,
          credentials: 'include',
          headers,
        });
      };

      let response = await send(accessToken);
      if (response.status === 401) {
        try {
          const refreshed = await refreshSession();
          response = await send(refreshed.accessToken);
        } catch {
          setAccessToken(null);
          setUser(null);
          throw new Error('Your session has expired. Please sign in again.');
        }
      }

      return parseApiResponse<T>(response);
    },
    [accessToken, refreshSession],
  );

  const value = useMemo(
    () => ({ accessToken, user, isLoading, login, logout, request }),
    [accessToken, isLoading, login, logout, request, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
