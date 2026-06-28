import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Week, Recipe } from "@cooking/core";
import * as api from "../api.js";

function formatWeekRange(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const mon = new Date(y!, m! - 1, d!);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  shopping: { bg: "#DCE8D4", color: "#42532F", label: "Ready to cook" },
  cooking:  { bg: "#F5E8DE", color: "#A8623C", label: "In progress" },
  done:     { bg: "#DCE8D4", color: "#566A46", label: "Complete" },
};

interface WeekSummary {
  week: Week;
  selectedRecipes: Recipe[];
}

export default function CookPage() {
  const [items, setItems] = useState<WeekSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { weeks } = await api.getWeeks();
      const cookable = weeks.filter(
        (w) => w.week.status === "shopping" || w.week.status === "cooking" || w.week.status === "done"
      );
      setItems(cookable.map((w) => ({ week: w.week, selectedRecipes: w.selectedRecipes })));
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <PageLayout>
        <Spinner />
      </PageLayout>
    );
  }

  if (items.length === 0) {
    return (
      <PageLayout>
        <div style={{ padding: "48px 20px", textAlign: "center" }}>
          <p style={{ color: "var(--stone)" }}>
            No weeks ready to cook yet. Choose and confirm meals first.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate("/choose")}>
            Go to Choose
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 16px 32px" }}>
        {items.map((item) => {
          const badge = STATUS_BADGE[item.week.status];
          const cookedCount = item.week.cookedRecipeIds.length;
          const totalCount = item.week.selections.reduce((sum, s) => sum + (s.quantity ?? 1), 0);
          return (
            <div key={item.week.weekStart} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                    Week of {formatWeekRange(item.week.weekStart).split("–")[0]?.trim()}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--stone)", marginTop: 1 }}>
                    {formatWeekRange(item.week.weekStart)}
                  </div>
                </div>
                {badge && (
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 600,
                      padding: "3px 9px",
                      borderRadius: 12,
                      background: badge.bg,
                      color: badge.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {badge.label}
                  </span>
                )}
              </div>
              <div style={{ padding: "12px 16px 14px" }}>
                <p style={{ fontSize: "0.82rem", color: "var(--stone)", marginBottom: 12 }}>
                  {cookedCount}/{totalCount} meal{totalCount !== 1 ? "s" : ""} cooked
                </p>
                <button
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  onClick={() => navigate(`/cook/${item.week.weekStart}`)}
                >
                  {item.week.status === "done" ? "View week" : "Cook"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </PageLayout>
  );
}

function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "28px 20px 16px" }}>
        <h1 style={{ margin: 0, fontSize: "1.8rem" }}>Cook</h1>
        <p style={{ marginTop: 4, color: "var(--stone)", fontSize: "0.9rem" }}>
          Your weekly menus and recipes.
        </p>
      </div>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <div
        style={{
          width: 32,
          height: 32,
          border: "3px solid var(--line)",
          borderTopColor: "var(--garden)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
    </div>
  );
}

if (typeof document !== "undefined" && !document.getElementById("spin-kf")) {
  const s = document.createElement("style");
  s.id = "spin-kf";
  s.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(s);
}
