import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Recipe, Week, WeekSelection, MealType } from "@cooking/core";
import * as api from "../api.js";

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

function formatWeekDate(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function WeekDetailPage() {
  const { weekStart } = useParams<{ weekStart: string }>();
  const navigate = useNavigate();
  const [week, setWeek] = useState<Week | null>(null);
  const [candidates, setCandidates] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<WeekSelection[]>([]);
  const [filter, setFilter] = useState<MealType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!weekStart) return;
    api
      .getWeekByStart(weekStart)
      .then(({ week: w, candidates: c }) => {
        setWeek(w);
        setCandidates(c);
        if (w) setSelected(w.selections);
      })
      .finally(() => setLoading(false));
  }, [weekStart]);

  // Poll while pending
  useEffect(() => {
    if (week?.status !== "pending") return;
    const id = setInterval(async () => {
      if (!weekStart) return;
      const { week: w, candidates: c } = await api.getWeekByStart(weekStart);
      if (w && w.status !== "pending") {
        setWeek(w);
        setCandidates(c);
        setSelected(w.selections);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [week?.status, weekStart]);

  const handleConfirm = async () => {
    if (!week || !weekStart) return;
    setSaving(true);
    try {
      const { week: updated } = await api.selectMealsForWeek(weekStart, selected, week.daysPerWeek);
      setWeek(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!weekStart) return;
    setSaving(true);
    try {
      const { week: updated } = await api.skipWeekByStart(weekStart);
      setWeek(updated);
    } finally {
      setSaving(false);
    }
  };

  const toggleRecipe = (recipe: Recipe) => {
    const already = selected.find((s) => s.recipeId === recipe.id);
    setSelected(
      already
        ? selected.filter((s) => s.recipeId !== recipe.id)
        : [...selected, { recipeId: recipe.id, mealType: recipe.mealType }]
    );
  };

  const label = weekStart ? formatWeekDate(weekStart) : "";
  const back = () => navigate("/week");

  if (loading) {
    return (
      <PageShell title={label} onBack={back}>
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner />
        </div>
      </PageShell>
    );
  }

  if (week?.status === "pending") {
    return (
      <PageShell title={label} onBack={back}>
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <Spinner />
          <p className="text-muted" style={{ marginTop: 16 }}>
            Chef Claude is crafting your menu…
          </p>
        </div>
      </PageShell>
    );
  }

  if (week?.status === "shopping" || week?.status === "cooking") {
    const cookedSet = new Set(week.cookedRecipeIds);
    const remaining = candidates.filter(
      (r) => week.selections.some((s) => s.recipeId === r.id) && !cookedSet.has(r.id)
    );
    const cooked = candidates.filter((r) => cookedSet.has(r.id));

    return (
      <PageShell title={label} onBack={back}>
        {remaining.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ padding: "0 16px 10px" }}>Up next</h2>
            <div className="stack gap-3" style={{ padding: "0 16px" }}>
              {remaining.map((r) => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  onClick={() => navigate(`/recipes/${r.id}`, { state: { weekStart } })}
                />
              ))}
            </div>
          </section>
        )}
        {cooked.length > 0 && (
          <section style={{ marginBottom: 16 }}>
            <h2 style={{ padding: "0 16px 10px", color: "var(--slate-light)" }}>Done</h2>
            <div className="stack gap-3" style={{ padding: "0 16px", opacity: 0.5 }}>
              {cooked.map((r) => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  onClick={() => navigate(`/recipes/${r.id}`, { state: { weekStart } })}
                />
              ))}
            </div>
          </section>
        )}
        {remaining.length === 0 && cooked.length > 0 && (
          <div style={{ textAlign: "center", padding: "8px 16px 24px" }}>
            <p style={{ color: "var(--green)", fontWeight: 600, marginBottom: 12 }}>
              All meals cooked this week!
            </p>
          </div>
        )}
        <div style={{ padding: "4px 16px 16px" }}>
          <button
            className="btn btn-outline"
            style={{ width: "100%" }}
            onClick={() => navigate(`/shopping?week=${weekStart}`)}
          >
            View shopping list
          </button>
        </div>
      </PageShell>
    );
  }

  if (!week || week.status === "done" || week.status === "skipped") {
    return (
      <PageShell title={label} onBack={back}>
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <p className="text-muted">
            {week?.status === "skipped" ? "You skipped this week." : "Nothing here yet."}
          </p>
          <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={back}>
            Back to weeks
          </button>
        </div>
      </PageShell>
    );
  }

  // selecting
  const shown = filter === "all" ? candidates : candidates.filter((r) => r.mealType === filter);
  const isSelected = (r: Recipe) => selected.some((s) => s.recipeId === r.id);

  return (
    <PageShell title={`Week of ${label}`} onBack={back}>
      <div className="row gap-2" style={{ padding: "0 16px 12px", overflowX: "auto" }}>
        {(["all", ...MEAL_ORDER] as const).map((m) => (
          <button
            key={m}
            onClick={() => setFilter(m)}
            className="btn"
            style={{
              padding: "6px 14px",
              fontSize: "0.8rem",
              background: filter === m ? "var(--clay)" : "#fff",
              color: filter === m ? "#fff" : "var(--slate)",
              border: `1.5px solid ${filter === m ? "var(--clay)" : "var(--border)"}`,
              borderRadius: 20,
              flexShrink: 0,
            }}
          >
            {m === "all" ? "All" : m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <div className="stack gap-3" style={{ padding: "0 16px" }}>
        {shown.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            selected={isSelected(r)}
            onClick={() => toggleRecipe(r)}
            showCheckbox
          />
        ))}
      </div>

      <div
        className="stack gap-2"
        style={{
          padding: "20px 16px",
          position: "sticky",
          bottom: 72,
          background: "linear-gradient(transparent, var(--ivory) 20%)",
        }}
      >
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={selected.length === 0 || saving}
        >
          {saving ? "Saving…" : `Confirm ${selected.length} meal${selected.length !== 1 ? "s" : ""}`}
        </button>
        <button className="btn btn-ghost text-sm" onClick={handleSkip} disabled={saving}>
          Skip this week
        </button>
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
    <div className="stack" style={{ flex: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "20px 16px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            fontSize: "1.3rem",
            cursor: "pointer",
            padding: "0 4px",
            color: "var(--slate)",
            lineHeight: 1,
          }}
        >
          ←
        </button>
        <h1 style={{ margin: 0 }}>{title}</h1>
      </div>
      <div style={{ flex: 1, padding: "16px 0", overflowY: "auto" }}>{children}</div>
    </div>
  );
}

function RecipeCard({
  recipe,
  selected,
  onClick,
  showCheckbox,
}: {
  recipe: Recipe;
  selected?: boolean;
  onClick: () => void;
  showCheckbox?: boolean;
}) {
  const totalMin = recipe.prepMinutes + recipe.cookMinutes;
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        cursor: "pointer",
        border: selected ? "2px solid var(--clay)" : "2px solid transparent",
        transition: "border-color 0.15s",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="tag badge-clay" style={{ textTransform: "capitalize" }}>
          {recipe.mealType}
        </span>
        {showCheckbox && (
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: selected ? "none" : "2px solid var(--border)",
              background: selected ? "var(--clay)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "0.7rem",
            }}
          >
            {selected ? "✓" : ""}
          </span>
        )}
      </div>
      <h3 style={{ marginBottom: 4 }}>{recipe.title}</h3>
      <p className="text-sm text-muted" style={{ marginBottom: 10, lineHeight: 1.4 }}>
        {recipe.description}
      </p>
      <div className="row gap-3 text-xs text-muted">
        <span>{recipe.cuisine}</span>
        <span>·</span>
        <span>{totalMin} min</span>
        <span>·</span>
        <span>{recipe.nutrition.calories} cal</span>
        <span>·</span>
        <span>${recipe.costPerServing.toFixed(2)}/person</span>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        border: "3px solid var(--border)",
        borderTopColor: "var(--clay)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        margin: "0 auto",
      }}
    />
  );
}

if (typeof document !== "undefined" && !document.getElementById("spin-kf")) {
  const s = document.createElement("style");
  s.id = "spin-kf";
  s.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(s);
}
