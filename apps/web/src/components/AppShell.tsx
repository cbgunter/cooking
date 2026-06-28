import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { signOut, getDisplayName } from "../auth.js";

interface AppShellProps {
  children: React.ReactNode;
  onSignOut: () => void;
}

const NAV_LINKS = [
  { label: "Choose", path: "/choose" },
  { label: "Shop", path: "/shop" },
  { label: "Cook", path: "/cook" },
  { label: "Settings", path: "/preferences" },
];

export default function AppShell({ children, onSignOut }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const name = getDisplayName();

  const handleSignOut = () => {
    signOut();
    onSignOut();
  };

  const goTo = (path: string) => {
    setDrawerOpen(false);
    navigate(path);
  };

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "var(--paper)" }}>
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          height: 56,
          background: "var(--paper)",
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Sign out (left) */}
        <button
          onClick={handleSignOut}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "0.78rem",
            color: "var(--stone)",
            letterSpacing: "0.03em",
            padding: "6px 0",
          }}
        >
          Sign out
        </button>

        {/* Wordmark (center) */}
        <button
          onClick={() => navigate("/choose")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
        >
          <img src="/logo.png" alt="Cooking" style={{ height: 28, display: "block" }} />
        </button>

        {/* Hamburger (right) */}
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "6px 0",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                display: "block",
                width: 22,
                height: 2,
                background: "var(--ink)",
                borderRadius: 2,
              }}
            />
          ))}
        </button>
      </header>

      {/* Page content */}
      <main style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {children}
      </main>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(35,38,30,0.35)",
            zIndex: 40,
          }}
        />
      )}

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 260,
          background: "var(--paper)",
          zIndex: 50,
          transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.22s ease",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(35,38,30,0.12)",
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "var(--stone)" }}>
            Hi, {name}
          </span>
          <button
            onClick={() => setDrawerOpen(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.2rem",
              color: "var(--stone)",
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: "12px 0" }}>
          {NAV_LINKS.map(({ label, path }) => {
            const active = location.pathname === path || location.pathname.startsWith(path + "/");
            return (
              <button
                key={path}
                onClick={() => goTo(path)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: active ? "var(--oat)" : "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "14px 24px",
                  fontSize: "1rem",
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--garden)" : "var(--ink)",
                  letterSpacing: "0.01em",
                }}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Sign out at bottom */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--line)" }}>
          <button
            onClick={handleSignOut}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              color: "var(--stone)",
              padding: 0,
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
