import { createContext, useContext, useMemo, useState } from 'react';

const AuthContext = createContext(null);

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

export function AuthProvider({ children }) {
  // Token lives only in React state for the lifetime of the tab — never localStorage.
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  const login = (newToken) => {
    setToken(newToken);
    setUser(decodeJwt(newToken));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const value = useMemo(() => ({ token, user, login, logout }), [token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
