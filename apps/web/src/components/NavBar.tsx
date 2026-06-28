import { NavLink } from "react-router-dom";
import { signOut } from "../auth.js";

const nav: { label: string; path: string; icon: string }[] = [
  { label: "Week", path: "/week", icon: "▦" },
  { label: "List", path: "/shopping", icon: "≡" },
  { label: "Settings", path: "/preferences", icon: "◎" },
];

export default function NavBar({ onSignOut }: { onSignOut: () => void }) {
  const handleSignOut = () => {
    signOut();
    onSignOut();
  };

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "var(--paper)",
        borderTop: "1px solid var(--line)",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        height: 60,
        paddingBottom: "env(safe-area-inset-bottom)",
        zIndex: 100,
      }}
    >
      {nav.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          style={({ isActive }) => ({
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            padding: "4px 16px",
            fontSize: "0.7rem",
            fontWeight: 600,
            color: isActive ? "var(--clay)" : "var(--slate-light)",
          })}
        >
          <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
      <button
        onClick={handleSignOut}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          padding: "4px 16px",
          fontSize: "0.7rem",
          fontWeight: 600,
          color: "var(--slate-light)",
          cursor: "pointer",
          background: "none",
          border: "none",
        }}
      >
        <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>→</span>
        Sign out
      </button>
    </nav>
  );
}
