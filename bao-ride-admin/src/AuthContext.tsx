// src/AuthContext.tsx
import React, { createContext, useContext, useState } from "react";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type AuthState = {
  token: string | null;
  user: User | null;
};

type AuthContextType = {
  auth: AuthState;
  login: (token: string, user: User) => void;
  logout: () => void;
};

type FlashPayload = { type: "success" | "error"; message: string };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function setFlash(payload: FlashPayload) {
  try {
    localStorage.setItem("bao_flash", JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [auth, setAuth] = useState<AuthState>(() => {
    const token = localStorage.getItem("bao_token");
    const userRaw = localStorage.getItem("bao_user");
    return {
      token,
      user: userRaw ? (JSON.parse(userRaw) as User) : null,
    };
  });

  const login = (token: string, user: User) => {
    localStorage.setItem("bao_token", token);
    localStorage.setItem("bao_user", JSON.stringify(user));
    setAuth({ token, user });
  };

  const logout = () => {
    // one-time success message that LoginPage will show after App reroutes to it
    setFlash({ type: "success", message: "✅ Logged out successfully." });

    localStorage.removeItem("bao_token");
    localStorage.removeItem("bao_user");
    setAuth({ token: null, user: null });
  };

  const value: AuthContextType = { auth, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
