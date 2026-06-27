import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import type { Recipe } from "@cooking/core";
import * as api from "../api.js";

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const weekStart = (location.state as { weekStart?: string } | null)?.weekStart;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [step, setStep] = useState(0);
  const [cooked, setCooked] = useState(false);
  const [stars, setStars] = useState<1 | 2 | 3 | 4 | 5 | 0>(0);
  const [makeAgain, setMakeAgain] = useState(true);
  const [notes, setNotes] = useState("");
  const [showRating, setShowRating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getRecipe(id).then(setRecipe);
  }, [id]);

  if (!recipe) return null;

  const totalMin = recipe.prepMinutes + recipe.cookMinutes;
  const isLastStep = step === recipe.steps.length - 1;
  const stepText = recipe.steps[step] ?? "";

  const handleMarkCooked = async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      await api.markCooked(id, weekStart);
      setCooked(true);
      setShowRating(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!id || stars === 0) return;
    setSubmitting(true);
    try {
      await api.submitRating(id, stars, makeAgain, notes || undefined, weekStart);
      navigate(weekStart ? `/weeks/${weekStart}` : "/week");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack" style={{ flex: 1 }}>
      {/* Header */}
      <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
        <button
          className="btn btn-ghost text-sm"
          onClick={() => navigate(-1)}
          style={{ marginBottom: 8 }}
        >
          ← Back
        </button>
        <div className="row gap-2" style={{ marginBottom: 6 }}>
          <span className="tag badge-clay" style={{ textTransform: "capitalize" }}>
            {recipe.mealType}
          </span>
          <span className="tag">{recipe.cuisine}</span>
        </div>
        <h1 style={{ marginBottom: 6 }}>{recipe.title}</h1>
        <p className="text-sm text-muted">{recipe.description}</p>
      </div>

      {/* Stats */}
      <div
        className="row"
        style={{
          padding: "12px 16px",
          gap: 0,
          borderBottom: "1px solid var(--border)",
          justifyContent: "space-around",
        }}
      >
        <Stat label="Time" value={`${totalMin} min`} />
        <Stat label="Calories" value={`${recipe.nutrition.calories}`} />
        <Stat label="Sodium" value={`${recipe.nutrition.sodiumMg}mg`} />
        <Stat label="Cost" value={`$${recipe.costPerServing.toFixed(2)}`} />
      </div>

      {/* Ingredients */}
      <section style={{ padding: "16px" }}>
        <h2 style={{ marginBottom: 12 }}>Ingredients</h2>
        <div className="stack gap-2">
          {recipe.ingredients.map((ing, i) => (
            <div
              key={i}
              className="row"
              style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}
            >
              <span className="fw-medium">{ing.name}</span>
              <span className="text-sm text-muted">
                {ing.quantity} {ing.unit}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Step-by-step instructions */}
      <section style={{ padding: "16px" }}>
        <h2 style={{ marginBottom: 4 }}>Instructions</h2>
        <p className="text-xs text-muted" style={{ marginBottom: 16 }}>
          Step {step + 1} of {recipe.steps.length}
        </p>

        <div
          className="card"
          style={{ minHeight: 120, display: "flex", alignItems: "center", marginBottom: 16 }}
        >
          <p style={{ lineHeight: 1.6, fontSize: "1rem" }}>{stepText}</p>
        </div>

        <div className="row gap-2">
          <button
            className="btn btn-outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{ flex: 1 }}
          >
            ← Prev
          </button>
          {isLastStep ? (
            <button
              className="btn btn-primary"
              onClick={handleMarkCooked}
              disabled={cooked || submitting}
              style={{ flex: 2 }}
            >
              {cooked ? "Marked cooked ✓" : submitting ? "Saving…" : "Mark as cooked"}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setStep((s) => s + 1)}
              style={{ flex: 1 }}
            >
              Next →
            </button>
          )}
        </div>

        {/* Jump to step */}
        <div className="row gap-2" style={{ marginTop: 12, flexWrap: "wrap" }}>
          {recipe.steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "2px solid " + (i === step ? "var(--clay)" : "var(--border)"),
                background: i === step ? "var(--clay)" : "transparent",
                color: i === step ? "#fff" : "var(--slate-light)",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </section>

      {/* Rating panel */}
      {showRating && (
        <section style={{ padding: "16px", borderTop: "1px solid var(--border)" }}>
          <h2 style={{ marginBottom: 12 }}>How was it?</h2>

          <div className="row gap-3" style={{ marginBottom: 16 }}>
            {([1, 2, 3, 4, 5] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStars(s)}
                style={{ fontSize: "1.8rem", opacity: s <= stars ? 1 : 0.3, background: "none", border: "none", cursor: "pointer" }}
              >
                ⭐
              </button>
            ))}
          </div>

          <div className="row gap-3" style={{ marginBottom: 16 }}>
            <button
              onClick={() => setMakeAgain(true)}
              className="btn"
              style={{
                flex: 1,
                background: makeAgain ? "var(--clay)" : "#fff",
                color: makeAgain ? "#fff" : "var(--slate)",
                border: `1.5px solid ${makeAgain ? "var(--clay)" : "var(--border)"}`,
              }}
            >
              Make again
            </button>
            <button
              onClick={() => setMakeAgain(false)}
              className="btn"
              style={{
                flex: 1,
                background: !makeAgain ? "#e53e3e" : "#fff",
                color: !makeAgain ? "#fff" : "var(--slate)",
                border: `1.5px solid ${!makeAgain ? "#e53e3e" : "var(--border)"}`,
              }}
            >
              Pass next time
            </button>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
            rows={3}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1.5px solid var(--border)",
              borderRadius: 10,
              fontFamily: "inherit",
              fontSize: "0.9rem",
              resize: "none",
              marginBottom: 12,
            }}
          />

          <button
            className="btn btn-primary"
            onClick={handleSubmitRating}
            disabled={stars === 0 || submitting}
            style={{ width: "100%" }}
          >
            {submitting ? "Saving…" : "Save & done"}
          </button>
        </section>
      )}

      {recipe.reuseNotes && (
        <section style={{ padding: "0 16px 16px" }}>
          <p className="text-xs text-muted">
            Tip: {recipe.reuseNotes}
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stack" style={{ alignItems: "center", gap: 2 }}>
      <span style={{ fontWeight: 700, fontSize: "1rem" }}>{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
