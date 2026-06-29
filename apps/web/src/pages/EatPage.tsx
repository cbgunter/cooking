import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Rating } from "@cooking/core";
import * as api from "../api.js";
import type { EatMeal } from "../api.js";
import { getCurrentUserEmail, getNameForEmail } from "../auth.js";

const MEAL_COLORS: Record<string, string> = {
  breakfast: "#F5E8DE",
  lunch:     "#EFE9DC",
  dinner:    "#DCE8D4",
};

function formatWeekRange(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const mon = new Date(y!, m! - 1, d!);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

function Stars({ count }: { count: number }) {
  return (
    <span style={{ fontSize: "0.95rem", letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} style={{ opacity: s <= count ? 1 : 0.2 }}>⭐</span>
      ))}
    </span>
  );
}

function RatingBlock({ rating }: { rating: Rating }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 12px",
        background: "var(--oat)",
        borderRadius: 8,
        fontSize: "0.82rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 600, color: "var(--slate)", fontSize: "0.75rem" }}>
          {rating.ratedBy ? getNameForEmail(rating.ratedBy) : "Anonymous"}
        </span>
        <Stars count={rating.stars} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontSize: "0.7rem",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 10,
            background: rating.makeAgain ? "#DCE8D4" : "#F5DEDA",
            color: rating.makeAgain ? "#42532F" : "#7A2E22",
          }}
        >
          {rating.makeAgain ? "Make again" : "Pass next time"}
        </span>
      </div>
      {rating.notes && (
        <p style={{ margin: 0, color: "var(--stone)", lineHeight: 1.5, fontStyle: "italic" }}>
          "{rating.notes}"
        </p>
      )}
    </div>
  );
}

function MealCard({
  meal,
  currentUserEmail,
  onOpen,
  onRated,
}: {
  meal: EatMeal;
  currentUserEmail: string;
  onOpen: () => void;
  onRated: () => void;
}) {
  const { recipe, ratings, weekStart } = meal;
  const [showForm, setShowForm] = useState(false);
  const [stars, setStars] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [makeAgain, setMakeAgain] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hasMyRating = ratings.some((r) => r.ratedBy === currentUserEmail);

  const handleSubmit = async (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (stars === 0) return;
    setSubmitting(true);
    try {
      await api.submitRating(recipe.id, stars as 1 | 2 | 3 | 4 | 5, makeAgain, notes || undefined, weekStart);
      onRated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer" }}
        onClick={onOpen}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: MEAL_COLORS[recipe.mealType] ?? "#F5F5F5",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: "0.9rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {recipe.title}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--stone)", textTransform: "capitalize", marginTop: 2 }}>
            {recipe.mealType} · {recipe.cuisine}
          </div>
        </div>
        {!hasMyRating && !showForm && (
          <button
            className="btn btn-outline"
            style={{ fontSize: "0.72rem", padding: "4px 10px", flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); setShowForm(true); }}
          >
            Rate
          </button>
        )}
      </div>

      {ratings.length > 0 && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 14px 12px" }}
          onClick={(e) => e.stopPropagation()}
        >
          {ratings.map((r) => (
            <RatingBlock key={r.id} rating={r} />
          ))}
        </div>
      )}

      {showForm && (
        <div
          style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", gap: 4 }}>
            {([1, 2, 3, 4, 5] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStars(s)}
                style={{ fontSize: "1.5rem", opacity: s <= stars ? 1 : 0.3, background: "none", border: "none", cursor: "pointer", padding: 2 }}
              >
                ⭐
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              onClick={() => setMakeAgain(true)}
              style={{
                flex: 1, fontSize: "0.82rem",
                background: makeAgain ? "var(--clay)" : "#fff",
                color: makeAgain ? "#fff" : "var(--slate)",
                border: `1.5px solid ${makeAgain ? "var(--clay)" : "var(--border)"}`,
              }}
            >
              Make again
            </button>
            <button
              className="btn"
              onClick={() => setMakeAgain(false)}
              style={{
                flex: 1, fontSize: "0.82rem",
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
            rows={2}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1.5px solid var(--border)",
              borderRadius: 8,
              fontFamily: "inherit",
              fontSize: "0.85rem",
              resize: "none",
              boxSizing: "border-box",
            }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              onClick={handleSubmit}
              disabled={stars === 0 || submitting}
            >
              {submitting ? "Saving…" : "Save rating"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EatPage() {
  const [meals, setMeals] = useState<EatMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const currentUserEmail = getCurrentUserEmail() ?? "";

  const loadMeals = () => {
    api.getEatMeals().then(({ meals: m }) => setMeals(m)).finally(() => setLoading(false));
  };

  const refreshMeals = () => {
    api.getEatMeals().then(({ meals: m }) => setMeals(m));
  };

  useEffect(() => {
    loadMeals();
  }, []);

  // Group consecutive meals by weekStart, preserving server order (most recent first)
  const grouped: Array<{ weekStart: string; meals: EatMeal[] }> = [];
  for (const meal of meals) {
    const last = grouped[grouped.length - 1];
    if (last && last.weekStart === meal.weekStart) {
      last.meals.push(meal);
    } else {
      grouped.push({ weekStart: meal.weekStart, meals: [meal] });
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "28px 20px 16px" }}>
        <h1 style={{ margin: 0, fontSize: "1.8rem" }}>Eat</h1>
        <p style={{ marginTop: 4, color: "var(--stone)", fontSize: "0.9rem" }}>
          Everything you've cooked, with your ratings.
        </p>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner />
        </div>
      ) : grouped.length === 0 ? (
        <div style={{ padding: "48px 20px", textAlign: "center" }}>
          <p style={{ color: "var(--stone)" }}>Nothing cooked yet. Head to Cook to get started.</p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => navigate("/cook")}
          >
            Go to Cook
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "0 16px 40px" }}>
          {grouped.map(({ weekStart, meals: weekMeals }) => (
            <section key={weekStart}>
              <h2
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--stone)",
                  margin: "0 0 10px 2px",
                }}
              >
                {formatWeekRange(weekStart)}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {weekMeals.map((meal) => (
                  <MealCard
                    key={`${meal.weekStart}-${meal.recipe.id}`}
                    meal={meal}
                    currentUserEmail={currentUserEmail}
                    onOpen={() =>
                      navigate(`/recipes/${meal.recipe.id}`, {
                        state: { weekStart: meal.weekStart },
                      })
                    }
                    onRated={refreshMeals}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
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
  );
}

if (typeof document !== "undefined" && !document.getElementById("spin-kf")) {
  const s = document.createElement("style");
  s.id = "spin-kf";
  s.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(s);
}
