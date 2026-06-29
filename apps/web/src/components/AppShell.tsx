import { useNavigate, useLocation } from "react-router-dom";
import { signOut, getDisplayName } from "../auth.js";

interface AppShellProps {
  children: React.ReactNode;
  onSignOut: () => void;
}

const FLOW_LINKS = [
  { label: "Home", path: "/" },
  { label: "Choose", path: "/choose" },
  { label: "Shop", path: "/shop" },
  { label: "Cook", path: "/cook" },
  { label: "Eat", path: "/eat" },
];

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function AppShell({ children, onSignOut }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const name = getDisplayName();

  const handleSignOut = () => {
    signOut();
    onSignOut();
  };

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

  // Show the flow nav on product pages only (not home or preferences)
  const showFlowNav =
    location.pathname !== "/" && location.pathname !== "/preferences";

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

          {/* Wordmark (center) — navigates to home */}
          <button
            onClick={() => navigate("/")}
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

          {/* Right cluster: gear + sign out */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              minWidth: 70,
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={() => navigate("/preferences")}
              title="Settings"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--stone)",
                padding: "4px 6px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <GearIcon />
            </button>
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
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Flow nav strip: Home → Choose → Shop → Cook → Eat */}
      {showFlowNav && (
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
              alignItems: "center",
              padding: "0 20px",
              maxWidth: 1100,
              margin: "0 auto",
            }}
          >
            {FLOW_LINKS.map(({ label, path }, i) => {
              const active = isActive(path);
              return (
                <div key={path} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 && (
                    <span
                      style={{
                        color: "var(--line)",
                        fontSize: "0.75rem",
                        margin: "0 2px",
                        userSelect: "none",
                      }}
                    >
                      ›
                    </span>
                  )}
                  <button
                    onClick={() => navigate(path)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "10px 10px 9px",
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
                </div>
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
