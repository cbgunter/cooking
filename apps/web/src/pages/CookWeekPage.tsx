import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Recipe, Week, MealType } from "@cooking/core";
import * as api from "../api.js";

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

function formatWeekDate(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const MEAL_BG: Record<MealType, string> = {
  breakfast: "#F5E8DE",
  lunch: "#EFE9DC",
  dinner: "#DCE8D4",
};

export default function CookWeekPage() {
  const { weekStart } = useParams<{ weekStart: string }>();
  const navigate = useNavigate();
  const [week, setWeek] = useState<Week | null>(null);
  const [candidates, setCandidates] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!weekStart) return;
    api.getWeekByStart(weekStart).then(({ week: w, candidates: c }) => {
      setWeek(w);
      setCandidates(c);
      setLoading(false);
    });
  }, [weekStart]);

  const label = weekStart ? formatWeekDate(weekStart) : "";
  const back = () => navigate("/cook");

  if (loading) {
    return (
      <PageShell title={`Week of ${label}`} onBack={back}>
        <Spinner />
      </PageShell>
    );
  }

  if (!week) {
    return (
      <PageShell title={`Week of ${label}`} onBack={back}>
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <p style={{ color: "var(--stone)" }}>Week not found.</p>
          <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={back}>
            Back to Cook
          </button>
        </div>
      </PageShell>
    );
  }

  // Build ordered list: breakfast first, then lunch, then dinner; collapse duplicates
  const mealRows: Array<{ recipe: Recipe; type: MealType; quantity: number }> = [];
  for (const type of MEAL_ORDER) {
    const typeSels = week.selections.filter((s) => {
      const recipe = candidates.find((r) => r.id === s.recipeId);
      return recipe?.mealType === type;
    });
    for (const sel of typeSels) {
      const recipe = candidates.find((r) => r.id === sel.recipeId);
      if (!recipe) continue;
      const existing = mealRows.find((r) => r.recipe.id === recipe.id);
      if (existing) {
        existing.quantity += sel.quantity ?? 1;
      } else {
        mealRows.push({ recipe, type, quantity: sel.quantity ?? 1 });
      }
    }
  }

  const grouped = MEAL_ORDER.map((type) => ({
    type,
    rows: mealRows.filter((m) => m.type === type),
  })).filter((g) => g.rows.length > 0);

  const cookedSet = new Set(week.cookedRecipeIds);

  return (
    <PageShell title={`Week of ${label}`} onBack={back}>
      <div style={{ padding: "0 16px 32px" }}>
        {grouped.map(({ type, rows }) => (
          <section key={type} style={{ marginBottom: 28 }}>
            <h2
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--stone)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 10,
              }}
            >
              {type}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map(({ recipe, quantity }) => {
                const cooked = cookedSet.has(recipe.id);
                return (
                  <button
                    key={recipe.id}
                    onClick={() => navigate(`/recipes/${recipe.id}`, { state: { weekStart } })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      background: cooked ? "transparent" : MEAL_BG[type],
                      border: `1.5px solid ${cooked ? "var(--line)" : "transparent"}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      cursor: "pointer",
                      textAlign: "left",
                      opacity: cooked ? 0.55 : 1,
                      width: "100%",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--ink)" }}>
                        {recipe.title}
                        {quantity > 1 && (
                          <span style={{ fontWeight: 400, color: "var(--stone)", marginLeft: 6 }}>
                            ×{quantity}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--stone)", marginTop: 2 }}>
                        {recipe.cuisine} · {recipe.prepMinutes + recipe.cookMinutes} min
                      </div>
                    </div>
                    {cooked && (
                      <span style={{ color: "var(--garden)", fontSize: "1rem" }}>✓</span>
                    )}
                    <span style={{ color: "var(--stone)", fontSize: "0.9rem" }}>›</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <button
            className="btn btn-outline"
            style={{ width: "100%" }}
            onClick={() => navigate(`/shopping?week=${weekStart}`)}
          >
            View shopping list
          </button>
        </div>
      </div>
    </PageShell>
  );
}

function PageShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "16px 16px 14px",
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            fontSize: "1.2rem",
            cursor: "pointer",
            padding: "0 4px",
            color: "var(--stone)",
            lineHeight: 1,
          }}
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: "1.1rem" }}>{title}</h1>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 0" }}>{children}</div>
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
