import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Recipe, Week, WeekSelection, MealType } from "@cooking/core";
import * as api from "../api.js";

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

export default function WeekPage() {
  const [week, setWeek] = useState<Week | null>(null);
  const [candidates, setCandidates] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<WeekSelection[]>([]);
  const [filter, setFilter] = useState<MealType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .getCurrentWeek()
      .then(({ week: w, candidates: c }) => {
        setWeek(w);
        setCandidates(c);
        if (w) setSelected(w.selections);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { week: w } = await api.triggerGenerate();
      setWeek(w);
      // Poll until status changes from "pending"
      const poll = setInterval(async () => {
        const { week: updated, candidates: c } = await api.getCurrentWeek();
        if (updated && updated.status !== "pending") {
          clearInterval(poll);
          setWeek(updated);
          setCandidates(c);
          setSelected(updated.selections);
          setGenerating(false);
        }
      }, 5000);
    } catch (e) {
      setGenerating(false);
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const toggleRecipe = (recipe: Recipe) => {
    const already = selected.find((s) => s.recipeId === recipe.id);
    if (already) {
      setSelected(selected.filter((s) => s.recipeId !== recipe.id));
    } else {
      setSelected([...selected, { recipeId: recipe.id, mealType: recipe.mealType }]);
    }
  };

  const handleConfirm = async () => {
    if (!week) return;
    setSaving(true);
    try {
      const { week: updated } = await api.selectMeals(selected, week.daysPerWeek);
      setWeek(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      const { week: updated } = await api.skipWeek();
      setWeek(updated);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageShell title="This week"><Spinner /></PageShell>;

  const errorBanner = error && (
    <div style={{ margin: "0 16px 16px", padding: "12px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, color: "#991b1b", fontSize: "0.85rem" }}>
      {error}
    </div>
  );

  if (!week || week.status === "done" || week.status === "skipped") {
    return (
      <PageShell title="This week">
        {errorBanner}
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <p className="text-muted" style={{ marginBottom: 20 }}>
            {week?.status === "skipped"
              ? "You skipped this week."
              : "No meals planned yet."}
          </p>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? "Generating…" : "Generate next week's menu"}
          </button>
        </div>
      </PageShell>
    );
  }

  if (week.status === "pending" || generating) {
    return (
      <PageShell title="This week">
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <Spinner />
          <p className="text-muted" style={{ marginTop: 16 }}>
            Claude is crafting your weekly menu…
          </p>
        </div>
      </PageShell>
    );
  }

  if (week.status === "shopping" || week.status === "cooking") {
    const cookedSet = new Set(week.cookedRecipeIds);
    const remaining = candidates.filter(
      (r) => week.selections.some((s) => s.recipeId === r.id) && !cookedSet.has(r.id)
    );
    const cooked = candidates.filter((r) => cookedSet.has(r.id));

    return (
      <PageShell title="This week">
        {remaining.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ padding: "0 16px 10px" }}>Up next</h2>
            <div className="stack gap-3" style={{ padding: "0 16px" }}>
              {remaining.map((r) => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  onClick={() => navigate(`/recipes/${r.id}`)}
                />
              ))}
            </div>
          </section>
        )}
        {cooked.length > 0 && (
          <section>
            <h2 style={{ padding: "0 16px 10px", color: "var(--slate-light)" }}>
              Done
            </h2>
            <div className="stack gap-3" style={{ padding: "0 16px", opacity: 0.5 }}>
              {cooked.map((r) => (
                <RecipeCard key={r.id} recipe={r} onClick={() => navigate(`/recipes/${r.id}`)} />
              ))}
            </div>
          </section>
        )}
        {remaining.length === 0 && cooked.length > 0 && (
          <div style={{ textAlign: "center", padding: "24px 16px" }}>
            <p style={{ color: "var(--green)", fontWeight: 600, marginBottom: 12 }}>
              All meals cooked this week!
            </p>
            <button className="btn btn-outline" onClick={handleGenerate} disabled={generating}>
              Plan next week
            </button>
          </div>
        )}
      </PageShell>
    );
  }

  // "selecting" / "shopping" — show chooser
  const shown = filter === "all" ? candidates : candidates.filter((r) => r.mealType === filter);
  const isSelected = (r: Recipe) => selected.some((s) => s.recipeId === r.id);

  return (
    <PageShell title={`Week of ${week.weekStart}`}>
      {/* Meal type filter tabs */}
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

      {/* Confirm / skip actions */}
      <div
        className="stack gap-2"
        style={{ padding: "20px 16px", position: "sticky", bottom: 72, background: "linear-gradient(transparent, var(--ivory) 20%)" }}
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

// ── Sub-components ─────────────────────────────────────────────────────────

function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="stack" style={{ flex: 1 }}>
      <div style={{ padding: "24px 16px 16px", borderBottom: "1px solid var(--border)" }}>
        <h1>{title}</h1>
      </div>
      <div style={{ flex: 1, padding: "16px 0" }}>{children}</div>
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

// Inject keyframe via style tag once
if (typeof document !== "undefined" && !document.getElementById("spin-kf")) {
  const style = document.createElement("style");
  style.id = "spin-kf";
  style.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(style);
}
