import React, { useState } from "react";
import HomePage from "./pages/HomePage";
import AboutPage from "./pages/AboutPage";
import ContactPage from "./pages/ContactPage";
import ServicesPage from "./pages/ServicesPage";
import DriversPage from "./pages/DriversPage";
import RidesPage from "./pages/RidesPage";   // 👈 new
import LoginPage from "./pages/LoginPage";
import "./App.css";
import { useAuth } from "./AuthContext";

type Tab = "home" | "rides" | "drivers" | "about" | "contact" | "services";

export default function App() {
  const { auth, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("home");

  if (!auth.token || !auth.user) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (tab) {
      case "rides":
        return <RidesPage />;
      case "drivers":
        return <DriversPage />;
      case "about":
        return <AboutPage />;
      case "contact":
        return <ContactPage />;
      case "services":
        return <ServicesPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="app-root">
      <header className="header">
        <div>
          <h1 className="logo-title">Bao Ride</h1>
          <p className="logo-subtitle">Mati City Operations Dashboard</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13 }}>
            {auth.user?.name} ({auth.user?.role})
          </span>
          <button
            onClick={logout}
            style={{
              borderRadius: 999,
              border: "none",
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <nav className="tabs">
        {[
          { id: "home", label: "Home" },
          { id: "rides", label: "Rides" },
          { id: "drivers", label: "Drivers" },
          { id: "about", label: "About" },
          { id: "contact", label: "Contact us" },
          { id: "services", label: "Service" },
        ].map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "tab-active" : ""}`}
            onClick={() => setTab(t.id as Tab)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="tab-underline-wrapper">
        <div className={`tab-underline tab-${tab}`} />
      </div>

      <main className="content">{renderPage()}</main>

      <footer className="footer">
        © 2025 BAO RIDE Admin. All Rights Reserved.
      </footer>
    </div>
  );
}
