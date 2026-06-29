import { useNavigate } from "react-router-dom";
import { getDisplayName } from "../auth.js";

const PRODUCTS = [
  {
    label: "Choose",
    description: "Plan your week's meals",
    path: "/choose",
    accent: "var(--garden)",
  },
  {
    label: "Shop",
    description: "Build your grocery list",
    path: "/shop",
    accent: "var(--apricot)",
  },
  {
    label: "Cook",
    description: "Follow your weekly menu",
    path: "/cook",
    accent: "var(--sprout)",
  },
  {
    label: "Eat",
    description: "Rate what you've made",
    path: "/eat",
    accent: "var(--cream)",
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const name = getDisplayName();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 20px 32px",
        flex: 1,
      }}
    >
      <p
        style={{
          margin: "0 0 40px",
          fontSize: "0.9rem",
          color: "var(--stone)",
          letterSpacing: "0.01em",
        }}
      >
        Hello, {name}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          width: "100%",
          maxWidth: 520,
        }}
      >
        {PRODUCTS.map(({ label, description, path, accent }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            style={{
              background: "var(--paper)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow)",
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
              overflow: "hidden",
              transition: "box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 2px 8px rgba(35,38,30,0.12), 0 0 0 1px rgba(35,38,30,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "var(--shadow)";
            }}
          >
            <div style={{ height: 4, background: accent }} />
            <div style={{ padding: "20px 20px 22px" }}>
              <div
                style={{
                  fontFamily: "Newsreader, Georgia, serif",
                  fontSize: "1.35rem",
                  fontWeight: 500,
                  color: "var(--ink)",
                  marginBottom: 6,
                  letterSpacing: "-0.01em",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "var(--stone)",
                  lineHeight: 1.4,
                }}
              >
                {description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
