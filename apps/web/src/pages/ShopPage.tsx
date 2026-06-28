import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Week, Recipe, ShoppingList } from "@cooking/core";
import * as api from "../api.js";

function formatWeekRange(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const mon = new Date(y!, m! - 1, d!);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

interface WeekSummary {
  week: Week;
  selectedRecipes: Recipe[];
  shoppingList?: ShoppingList;
  loading?: boolean;
}

export default function ShopPage() {
  const [items, setItems] = useState<WeekSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { weeks } = await api.getWeeks();
      const shoppable = weeks.filter(
        (w) => w.week.status === "shopping" || w.week.status === "cooking" || w.week.status === "done"
      );
      setItems(shoppable.map((w) => ({ week: w.week, selectedRecipes: w.selectedRecipes })));
      setLoading(false);
    })();
  }, []);

  const openList = async (item: WeekSummary) => {
    navigate(`/shopping?week=${item.week.weekStart}`);
  };

  if (loading) {
    return (
      <PageLayout title="Shop">
        <Spinner />
      </PageLayout>
    );
  }

  if (items.length === 0) {
    return (
      <PageLayout title="Shop">
        <div style={{ padding: "48px 20px", textAlign: "center" }}>
          <p style={{ color: "var(--stone)" }}>
            No weeks ready to shop yet. Choose and confirm meals first.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate("/choose")}>
            Go to Choose
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Shop">
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 16px 32px" }}>
        {items.map((item) => (
          <div key={item.week.weekStart} className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                Week of {formatWeekRange(item.week.weekStart).split("–")[0]?.trim()}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--stone)", marginTop: 1 }}>
                {formatWeekRange(item.week.weekStart)}
              </div>
            </div>
            <div style={{ padding: "12px 16px 14px" }}>
              {item.selectedRecipes.length > 0 && (
                <p style={{ fontSize: "0.82rem", color: "var(--stone)", marginBottom: 12 }}>
                  {item.selectedRecipes.length} meal{item.selectedRecipes.length !== 1 ? "s" : ""} planned
                  {item.week.mealCounts
                    ? ` (${item.week.mealCounts.breakfast}B · ${item.week.mealCounts.lunch}L · ${item.week.mealCounts.dinner}D)`
                    : ""}
                </p>
              )}
              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                onClick={() => openList(item)}
              >
                Shop now
              </button>
            </div>
          </div>
        ))}
      </div>
    </PageLayout>
  );
}

function PageLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "28px 20px 16px" }}>
        <h1 style={{ margin: 0, fontSize: "1.8rem" }}>{title}</h1>
        <p style={{ marginTop: 4, color: "var(--stone)", fontSize: "0.9rem" }}>
          Your grocery lists by week.
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
