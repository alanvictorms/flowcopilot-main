import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = anon
  const [token, setToken] = useState(() => localStorage.getItem("mfa_token"));

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const t = localStorage.getItem("mfa_token");
      if (!t) {
        setUser(null);
        return;
      }
      try {
        const { data } = await api.get("/auth/me");
        if (!cancelled) setUser(data);
      } catch {
        if (!cancelled) {
          localStorage.removeItem("mfa_token");
          localStorage.removeItem("mfa_user");
          setUser(null);
        }
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const signin = (nextUser, nextToken) => {
    localStorage.setItem("mfa_token", nextToken);
    localStorage.setItem("mfa_user", JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  };

  const signout = () => {
    localStorage.removeItem("mfa_token");
    localStorage.removeItem("mfa_user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, signin, signout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
