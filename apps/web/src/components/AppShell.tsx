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

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Which top-level section is active
  const activeSection = NAV_LINKS.find(
    (l) => location.pathname === l.path || location.pathname.startsWith(l.path + "/")
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        background: "var(--oat)",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: 60,
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
            fontSize: "0.8rem",
            color: "var(--stone)",
            letterSpacing: "0.02em",
            padding: "4px 0",
            minWidth: 60,
          }}
        >
          Sign out
        </button>

        {/* Wordmark (center) */}
        <button
          onClick={() => navigate("/choose")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            lineHeight: 0,
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <img src="/logo.png" alt="Cooking" style={{ height: 36, display: "block" }} />
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
            minWidth: 60,
            alignItems: "flex-end",
          }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                display: "block",
                width: i === 1 ? 16 : 22,
                height: 2,
                background: "var(--ink)",
                borderRadius: 2,
              }}
            />
          ))}
        </button>
      </header>

      {/* Section tab strip (when inside a named section) */}
      {activeSection && (
        <div
          style={{
            display: "flex",
            gap: 0,
            padding: "0 20px",
            background: "var(--paper)",
            borderBottom: "1px solid var(--line)",
            flexShrink: 0,
          }}
        >
          {NAV_LINKS.slice(0, 3).map(({ label, path }) => {
            const active = location.pathname === path || location.pathname.startsWith(path + "/");
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "10px 16px 9px",
                  fontSize: "0.82rem",
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--garden)" : "var(--stone)",
                  borderBottom: `2px solid ${active ? "var(--garden)" : "transparent"}`,
                  letterSpacing: "0.01em",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Page content */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </main>

      {/* Overlay */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(35,38,30,0.4)",
            zIndex: 40,
          }}
        />
      )}

      {/* Drawer */}
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
          transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 32px rgba(35,38,30,0.14)",
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 20px 16px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--stone)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 2 }}>
              Signed in as
            </div>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--ink)" }}>{name}</div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.1rem",
              color: "var(--stone)",
              lineHeight: 1,
              padding: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: "8px 0" }}>
          {NAV_LINKS.map(({ label, path }) => {
            const active = location.pathname === path || location.pathname.startsWith(path + "/");
            return (
              <button
                key={path}
                onClick={() => goTo(path)}
                style={{
                  display: "flex",
                  alignItems: "center",
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
                <span style={{ flex: 1 }}>{label}</span>
                {active && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--garden)" }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Sign out */}
        <div style={{ padding: "16px 24px 24px", borderTop: "1px solid var(--line)" }}>
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
