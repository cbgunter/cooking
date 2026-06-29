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
  { label: "Eat", path: "/eat" },
  { label: "Settings", path: "/preferences" },
];

export default function AppShell({ children, onSignOut }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const name = getDisplayName();

  const handleSignOut = () => {
    signOut();
    onSignOut();
  };

  // Which top-level section is active (controls whether the tab strip shows)
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
          background: "var(--paper)",
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
            height: 60,
            maxWidth: 1100,
            margin: "0 auto",
            position: "relative",
          }}
        >
          {/* Signed-in name (left) */}
          <span
            style={{
              fontSize: "0.8rem",
              color: "var(--stone)",
              letterSpacing: "0.02em",
              minWidth: 70,
              textAlign: "left",
            }}
          >
            {name}
          </span>

          {/* Wordmark (center) — crisp serif text, not the image */}
          <button
            onClick={() => navigate("/choose")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              fontFamily: "Newsreader, Georgia, serif",
              fontSize: "1.5rem",
              fontWeight: 500,
              letterSpacing: "-0.01em",
              color: "var(--garden)",
              lineHeight: 1,
            }}
          >
            Cooking
          </button>

          {/* Sign out (right) */}
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
              minWidth: 70,
              textAlign: "right",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Section tab strip */}
      {activeSection && (
        <div
          style={{
            background: "var(--paper)",
            borderBottom: "1px solid var(--line)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 0,
              padding: "0 20px",
              maxWidth: 1100,
              margin: "0 auto",
            }}
          >
            {NAV_LINKS.map(({ label, path }) => {
              const active =
                location.pathname === path || location.pathname.startsWith(path + "/");
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
    </div>
  );
}
