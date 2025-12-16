// src/pages/LoginPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

type FlashPayload = { type: "success" | "error"; message: string };

function readAndClearFlash(): FlashPayload | null {
  try {
    const raw = localStorage.getItem("bao_flash");
    if (!raw) return null;
    localStorage.removeItem("bao_flash");
    return JSON.parse(raw) as FlashPayload;
  } catch {
    return null;
  }
}

function SuccessModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-title">Success</div>
        <div className="modal-message">{message}</div>
        <button type="button" className="modal-button" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();

  const [email, setEmail] = useState("admin@baoride.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // success modal text (also used for logout flash)
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // store successful login payload until user clicks OK
  const [pendingAuth, setPendingAuth] = useState<{
    token: string;
    user: any;
  } | null>(null);

  useEffect(() => {
    // show logout success after App reroutes back to LoginPage
    const flash = readAndClearFlash();
    if (flash?.type === "success") {
      setSuccessMsg(flash.message);
    }
  }, []);

  const isBlocked = useMemo(() => loading || !!successMsg, [loading, successMsg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlocked) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await api.post("/auth/login", { email, password });
      const { token, user } = res.data;

      // Admin dashboard should only allow admin accounts
      if (!user || user.role !== "admin") {
        setErrorMsg("Only admin accounts can access this dashboard.");
        setLoading(false);
        return;
      }

      // show modal first; only login after user clicks OK
      setPendingAuth({ token, user });
      setSuccessMsg(`✅ Login successful. Welcome, ${user.name}!`);
    } catch (err: any) {
      console.error("Login failed", err);
      setErrorMsg(err?.response?.data?.error || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessClose = () => {
    setSuccessMsg(null);

    // if this was a login success, proceed to dashboard
    if (pendingAuth) {
      login(pendingAuth.token, pendingAuth.user);
      setPendingAuth(null);
    }
  };

  return (
    <div className="login-root">
      {successMsg && <SuccessModal message={successMsg} onClose={handleSuccessClose} />}

      <div className="login-card">
        <h1 className="logo-title" style={{ marginBottom: 4 }}>
          Bao Ride Admin
        </h1>
        <p className="logo-subtitle" style={{ color: "#6b7280" }}>
          Sign in to your dashboard
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            Email
            <input
              type="email"
              className="login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isBlocked}
            />
          </label>

          <label className="login-label">
            Password
            <input
              type="password"
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isBlocked}
            />
          </label>

          {errorMsg && <div className="login-error">{errorMsg}</div>}

          <button className="login-button" type="submit" disabled={isBlocked}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
