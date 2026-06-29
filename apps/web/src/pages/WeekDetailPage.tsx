import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Recipe, Week, WeekSelection, MealType, MealCounts } from "@cooking/core";
import * as api from "../api.js";
import { getCurrentUserEmail } from "../auth.js";

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

function formatWeekDate(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function draftKey(weekStart: string) {
  return `week-draft-${weekStart}`;
}

function saveDraft(weekStart: string, quantities: Map<string, number>) {
  sessionStorage.setItem(draftKey(weekStart), JSON.stringify(Object.fromEntries(quantities)));
}

function loadDraft(weekStart: string): Map<string, number> | null {
  try {
    const raw = sessionStorage.getItem(draftKey(weekStart));
    if (!raw) return null;
    return new Map(Object.entries(JSON.parse(raw) as Record<string, number>));
  } catch {
    return null;
  }
}

function clearDraft(weekStart: string) {
  sessionStorage.removeItem(draftKey(weekStart));
}

export default function WeekDetailPage() {
  const { weekStart } = useParams<{ weekStart: string }>();
  const navigate = useNavigate();
  const [week, setWeek] = useState<Week | null>(null);
  const [candidates, setCandidates] = useState<Recipe[]>([]);
  // Map: recipeId → quantity chosen (0 = not selected)
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [myEmail] = useState<string | null>(getCurrentUserEmail);
  // Quantities for top-up candidates not yet added to confirmed selections
  const [topUpQuantities, setTopUpQuantities] = useState<Map<string, number>>(new Map());

  const loadWeek = useCallback(async () => {
    if (!weekStart) return;
    const { week: w, candidates: c } = await api.getWeekByStart(weekStart);
    setWeek(w);
    setCandidates(c);
    if (w) {
      // While the user is picking (selecting status, no confirmed selections yet),
      // prefer any in-progress draft over stale server data so navigation to a
      // recipe detail page doesn't wipe out unsaved quantity choices.
      const draft = w.status === "selecting" ? loadDraft(weekStart) : null;
      const qMap = draft ?? new Map<string, number>();
      if (!draft) {
        for (const sel of w.selections) {
          qMap.set(sel.recipeId, (qMap.get(sel.recipeId) ?? 0) + (sel.quantity ?? 1));
        }
      }
      setQuantities(qMap);
    }
  }, [weekStart]);

  useEffect(() => {
    loadWeek().finally(() => setLoading(false));
  }, [loadWeek]);

  // Poll while pending or while a top-up is in flight
  useEffect(() => {
    const isPending = week?.status === "pending";
    const isTopUp = !!week?.topUpMealCounts;
    if (!isPending && !isTopUp) return;
    const id = setInterval(async () => {
      const { week: w, candidates: c } = await api.getWeekByStart(weekStart!);
      if (!w) return;
      setWeek(w);
      setCandidates(c);
      if (isPending && w.status !== "pending") {
        const qMap = new Map<string, number>();
        for (const sel of w.selections) {
          qMap.set(sel.recipeId, (qMap.get(sel.recipeId) ?? 0) + (sel.quantity ?? 1));
        }
        setQuantities(qMap);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [week?.status, week?.topUpMealCounts, weekStart]);

  const buildSelections = (): WeekSelection[] => {
    const sel: WeekSelection[] = [];
    for (const [recipeId, qty] of quantities) {
      if (qty === 0) continue;
      const recipe = candidates.find((r) => r.id === recipeId);
      if (!recipe) continue;
      sel.push({ recipeId, mealType: recipe.mealType, quantity: qty });
    }
    return sel;
  };

  const totalSelected = Array.from(quantities.values()).reduce((sum, q) => sum + q, 0);

  const handleConfirm = async () => {
    if (!week || !weekStart) return;
    setSaving(true);
    try {
      const { week: updated } = await api.selectMealsForWeek(weekStart, buildSelections());
      clearDraft(weekStart);
      setWeek(updated);
      setEditing(false);
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

  const handleRevert = async () => {
    if (!weekStart) return;
    setSaving(true);
    try {
      const { week: updated } = await api.revertWeek(weekStart);
      setWeek(updated);
      const qMap = new Map<string, number>();
      for (const sel of updated.selections) {
        qMap.set(sel.recipeId, (qMap.get(sel.recipeId) ?? 0) + (sel.quantity ?? 1));
      }
      setQuantities(qMap);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleTopUp = async (mealCounts: MealCounts) => {
    if (!weekStart) return;
    const { week: updated } = await api.topUpWeek(weekStart, mealCounts);
    setWeek(updated);
  };

  const handleAddTopUp = async () => {
    if (!week || !weekStart) return;
    setSaving(true);
    try {
      const newSelections: WeekSelection[] = [];
      for (const [recipeId, qty] of topUpQuantities) {
        if (qty === 0) continue;
        const recipe = candidates.find((r) => r.id === recipeId);
        if (!recipe) continue;
        newSelections.push({ recipeId, mealType: recipe.mealType, quantity: qty });
      }
      const merged = [...week.selections, ...newSelections];
      const { week: updated } = await api.selectMealsForWeek(weekStart, merged);
      clearDraft(weekStart);
      setTopUpQuantities(new Map());
      setWeek(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleVote = useCallback(
    async (recipeId: string, vote: "up" | "down" | null) => {
      if (!weekStart) return;
      try {
        const { week: updated } = await api.voteOnRecipe(weekStart, recipeId, vote);
        setWeek(updated);
      } catch (err) {
        console.error("Vote failed:", err);
      }
    },
    [weekStart]
  );

  const setQty = (recipeId: string, qty: number) => {
    setQuantities((prev) => {
      const next = new Map(prev);
      next.set(recipeId, Math.max(0, qty));
      if (weekStart) saveDraft(weekStart, next);
      return next;
    });
  };

  const enterEditMode = () => {
    if (week) {
      const qMap = new Map<string, number>();
      for (const sel of week.selections) {
        qMap.set(sel.recipeId, (qMap.get(sel.recipeId) ?? 0) + (sel.quantity ?? 1));
      }
      setQuantities(qMap);
    }
    setEditing(true);
  };

  const label = weekStart ? formatWeekDate(weekStart) : "";
  const back = () => navigate("/choose");

  if (loading) {
    return (
      <PageShell title={`Week of ${label}`} onBack={back}>
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner />
        </div>
      </PageShell>
    );
  }

  if (week?.status === "pending") {
    return (
      <PageShell title={`Week of ${label}`} onBack={back}>
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <Spinner />
          <p style={{ marginTop: 16, color: "var(--stone)", fontSize: "0.9rem" }}>
            Chef Claude is crafting your menu…
          </p>
        </div>
      </PageShell>
    );
  }

  // Selecting view (or editing)
  if (week?.status === "selecting" || editing) {
    const presentTypes = new Set(candidates.map((r) => r.mealType));
    const expectedTypes = MEAL_ORDER.filter((t) =>
      week?.mealCounts ? (week.mealCounts[t] ?? 0) > 0 : true
    );
    const missingTypes = expectedTypes.filter((t) => !presentTypes.has(t));

    const grouped = MEAL_ORDER.map((type) => ({
      type,
      recipes: candidates.filter((r) => r.mealType === type),
    })).filter((g) => g.recipes.length > 0);

    return (
      <PageShell
        title={`Week of ${label}`}
        onBack={editing ? () => setEditing(false) : back}
      >
        {/* Missing meal type notice */}
        {missingTypes.length > 0 && !editing && (
          <div
            style={{
              margin: "0 16px 16px",
              padding: "12px 14px",
              background: "#FFF8F0",
              border: "1px solid #E8CEBC",
              borderRadius: 10,
              fontSize: "0.83rem",
              color: "#7A4A28",
              lineHeight: 1.5,
            }}
          >
            <strong>Missing {missingTypes.join(" & ")} options.</strong>{" "}
            <button
              onClick={back}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--apricot-deep)",
                fontWeight: 600,
                textDecoration: "underline",
                fontSize: "inherit",
                padding: 0,
              }}
            >
              Go back and use ↺ to regenerate.
            </button>
          </div>
        )}

        <div style={{ padding: "0 16px" }}>
          {grouped.map(({ type, recipes }) => (
            <section key={type} style={{ marginBottom: 24 }}>
              <h2
                style={{
                  marginBottom: 12,
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "var(--stone)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {type}
              </h2>
              <div className="recipe-card-grid">
                {recipes.map((r) => {
                  const qty = quantities.get(r.id) ?? 0;
                  return (
                    <RecipeCard
                      key={r.id}
                      recipe={r}
                      quantity={qty}
                      week={week}
                      myEmail={myEmail}
                      onQuantityChange={(delta) => setQty(r.id, qty + delta)}
                      onVote={handleVote}
                      onDetail={() => navigate(`/recipes/${r.id}`, { state: { weekStart } })}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div
          style={{
            padding: "20px 16px 24px",
            position: "sticky",
            bottom: 0,
            background: "linear-gradient(transparent, var(--paper) 20%)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={totalSelected === 0 || saving}
          >
            {saving
              ? "Saving…"
              : editing
              ? `Save ${totalSelected} meal${totalSelected !== 1 ? "s" : ""}`
              : `Confirm ${totalSelected} meal${totalSelected !== 1 ? "s" : ""}`}
          </button>
          {editing ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-ghost text-sm"
                style={{ flex: 1 }}
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn btn-ghost text-sm"
                style={{ flex: 1 }}
                onClick={handleRevert}
                disabled={saving}
              >
                Revert to selecting
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost text-sm" onClick={handleSkip} disabled={saving}>
              Skip this week
            </button>
          )}
        </div>
      </PageShell>
    );
  }

  if (week?.status === "shopping" || week?.status === "cooking") {
    const cookedSet = new Set(week.cookedRecipeIds);
    const selIds = week.selections.flatMap((s) =>
      Array.from({ length: s.quantity ?? 1 }, () => s.recipeId)
    );
    const remaining = selIds.filter((id) => !cookedSet.has(id));
    const cookedIds = selIds.filter((id) => cookedSet.has(id));
    const byId = (id: string) => candidates.find((r) => r.id === id);

    // Compute which meal types the user is still short on
    const selectedByType: Record<MealType, number> = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const sel of week.selections) {
      selectedByType[sel.mealType] = (selectedByType[sel.mealType] ?? 0) + (sel.quantity ?? 1);
    }
    // Only show top-up for types where the user is still short of their target.
    const shortTypes = MEAL_ORDER.filter(
      (t) => selectedByType[t] < (week.mealCounts?.[t] ?? 0)
    );

    const selectedIds = new Set(week.selections.map((s) => s.recipeId));
    const topUpTotal = Array.from(topUpQuantities.values()).reduce((s, q) => s + q, 0);

    return (
      <PageShell title={`Week of ${label}`} onBack={back}>
        {week.confirmedBy && week.confirmedBy.length > 0 && (
          <p style={{ fontSize: "0.75rem", color: "var(--stone)", padding: "0 16px 4px" }}>
            Confirmed by {week.confirmedBy.map((e) => e.split("@")[0]).join(" & ")}
          </p>
        )}

        {remaining.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ padding: "0 16px 10px" }}>Up next</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 16px" }}>
              {remaining.map((id, idx) => {
                const r = byId(id);
                if (!r) return null;
                return (
                  <RecipeCard
                    key={`${id}-${idx}`}
                    recipe={r}
                    onClick={() => navigate(`/recipes/${r.id}`, { state: { weekStart } })}
                  />
                );
              })}
            </div>
          </section>
        )}

        {cookedIds.length > 0 && (
          <section style={{ marginBottom: 16 }}>
            <h2 style={{ padding: "0 16px 10px", color: "var(--stone)" }}>Done</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 16px", opacity: 0.5 }}>
              {cookedIds.map((id, idx) => {
                const r = byId(id);
                if (!r) return null;
                return (
                  <RecipeCard
                    key={`${id}-done-${idx}`}
                    recipe={r}
                    onClick={() => navigate(`/recipes/${r.id}`, { state: { weekStart } })}
                  />
                );
              })}
            </div>
          </section>
        )}

        {remaining.length === 0 && cookedIds.length > 0 && (
          <div style={{ textAlign: "center", padding: "8px 16px 24px" }}>
            <p style={{ color: "var(--garden)", fontWeight: 600, marginBottom: 12 }}>
              All meals cooked this week!
            </p>
          </div>
        )}

        {/* Finish your plan — top-up flow for types still short of target */}
        {shortTypes.length > 0 && (
          <section style={{ margin: "0 16px 24px" }}>
            <h2 style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--stone)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              Finish your plan
            </h2>
            {shortTypes.map((type) => {
              const isGenerating = !!week.topUpMealCounts?.[type];
              const altCandidates = candidates.filter(
                (r) => r.mealType === type && !selectedIds.has(r.id)
              );
              const target = week.mealCounts?.[type] ?? 0;
              const chosen = selectedByType[type];
              const shortfall = Math.max(1, target - chosen);
              return (
                <div key={type} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--ink)", textTransform: "capitalize", marginBottom: 6 }}>
                    {type}
                    <span style={{ fontWeight: 400, color: "var(--stone)", marginLeft: 6 }}>
                      {chosen} of {target} chosen
                    </span>
                  </div>
                  {isGenerating ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
                      <Spinner size={16} />
                      <span style={{ fontSize: "0.83rem", color: "var(--stone)" }}>
                        Finding {type} options…
                      </span>
                    </div>
                  ) : (
                    <>
                      {altCandidates.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                          {altCandidates.map((r) => {
                            const qty = topUpQuantities.get(r.id) ?? 0;
                            return (
                              <RecipeCard
                                key={r.id}
                                recipe={r}
                                quantity={qty}
                                onQuantityChange={(delta) => {
                                  setTopUpQuantities((prev) => {
                                    const next = new Map(prev);
                                    next.set(r.id, Math.max(0, (prev.get(r.id) ?? 0) + delta));
                                    return next;
                                  });
                                }}
                                onDetail={() => navigate(`/recipes/${r.id}`, { state: { weekStart } })}
                              />
                            );
                          })}
                        </div>
                      )}
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: "0.83rem", width: "100%" }}
                        onClick={() => handleTopUp({ breakfast: 0, lunch: 0, dinner: 0, [type]: shortfall })}
                      >
                        {altCandidates.length > 0 ? `Get fresh ${type} options` : `Get ${type} options`}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {topUpTotal > 0 && (
              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 4 }}
                onClick={handleAddTopUp}
                disabled={saving}
              >
                {saving ? "Saving…" : `Add ${topUpTotal} meal${topUpTotal !== 1 ? "s" : ""} to plan`}
              </button>
            )}
          </section>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 16px 24px" }}>
          <button
            className="btn btn-outline"
            style={{ width: "100%" }}
            onClick={() => navigate(`/shopping?week=${weekStart}`)}
          >
            View shopping list
          </button>
          <button
            className="btn btn-ghost"
            style={{ width: "100%", fontSize: "0.85rem" }}
            onClick={enterEditMode}
          >
            Edit meals
          </button>
        </div>
      </PageShell>
    );
  }

  // done, skipped, error, or no week
  return (
    <PageShell title={`Week of ${label}`} onBack={back}>
      <div style={{ textAlign: "center", padding: "48px 16px" }}>
        <p style={{ color: "var(--stone)" }}>
          {week?.status === "skipped" ? "You skipped this week." : "Nothing here yet."}
        </p>
        <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={back}>
          Back to Choose
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
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "16px 20px 14px",
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
          maxWidth: 1100,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
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
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function RecipeCard({
  recipe,
  quantity,
  onClick,
  week,
  myEmail,
  onQuantityChange,
  onVote,
  onDetail,
}: {
  recipe: Recipe;
  quantity?: number;
  onClick?: () => void;
  week?: Week | null;
  myEmail?: string | null;
  onQuantityChange?: (delta: number) => void;
  onVote?: (recipeId: string, vote: "up" | "down" | null) => void;
  onDetail?: () => void;
}) {
  const totalMin = recipe.prepMinutes + recipe.cookMinutes;
  const isSelected = (quantity ?? 0) > 0;

  let upCount = 0;
  let downCount = 0;
  if (week?.votes) {
    for (const userVotes of Object.values(week.votes)) {
      if (userVotes[recipe.id] === "up") upCount++;
      if (userVotes[recipe.id] === "down") downCount++;
    }
  }
  const myVote = (myEmail && week?.votes?.[myEmail]?.[recipe.id]) ?? null;

  return (
    <div
      className="card"
      onClick={onQuantityChange ? undefined : onClick}
      style={{
        cursor: onClick && !onQuantityChange ? "pointer" : "default",
        border: isSelected ? "2px solid var(--garden)" : "2px solid transparent",
        transition: "border-color 0.15s",
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ marginBottom: 3, fontSize: "0.95rem" }}>{recipe.title}</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--stone)", marginBottom: 8, lineHeight: 1.4 }}>
            {recipe.description}
          </p>
        </div>
        {/* Quantity stepper */}
        {onQuantityChange !== undefined && (
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onQuantityChange(-1)}
              disabled={(quantity ?? 0) === 0}
              style={qBtnStyle((quantity ?? 0) === 0)}
            >
              −
            </button>
            <span style={{ fontWeight: 700, fontSize: "1rem", minWidth: 16, textAlign: "center" }}>
              {quantity ?? 0}
            </span>
            <button
              onClick={() => onQuantityChange(+1)}
              style={qBtnStyle(false)}
            >
              +
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, fontSize: "0.75rem", color: "var(--stone)", marginBottom: onVote ? 10 : 0 }}>
        <span>{recipe.cuisine}</span>
        <span>·</span>
        <span>{totalMin} min</span>
        <span>·</span>
        <span>{recipe.nutrition.calories} cal</span>
        <span>·</span>
        <span>{recipe.nutrition.sodiumMg}mg sodium</span>
        <span>·</span>
        <span>${recipe.costPerServing.toFixed(2)}/person</span>
      </div>

      {onVote && (
        <div style={{ display: "flex", gap: 8, marginBottom: onDetail ? 8 : 0 }} onClick={(e) => e.stopPropagation()}>
          {(["up", "down"] as const).map((v) => {
            const count = v === "up" ? upCount : downCount;
            const isMe = myVote === v;
            const activeColor = v === "up" ? "#566A46" : "#7A2E22";
            const activeBg = v === "up" ? "#DCE8D4" : "#F5DEDA";
            return (
              <button
                key={v}
                onClick={() => onVote(recipe.id, isMe ? null : v)}
                style={{
                  background: isMe ? activeBg : "transparent",
                  border: `1.5px solid ${isMe ? activeColor : "var(--line)"}`,
                  borderRadius: 20,
                  padding: "3px 10px",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  color: isMe ? activeColor : "var(--stone)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {v === "up" ? "👍" : "👎"}
                {count > 0 && <span>{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {onDetail && (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onDetail}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: "0.75rem",
              color: "var(--garden)",
              fontWeight: 600,
              letterSpacing: "0.01em",
            }}
          >
            View recipe →
          </button>
        </div>
      )}
    </div>
  );
}

function qBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: `1.5px solid ${disabled ? "var(--line)" : "var(--garden)"}`,
    background: "transparent",
    color: disabled ? "var(--line)" : "var(--garden)",
    fontSize: "1rem",
    lineHeight: 1,
    cursor: disabled ? "default" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function Spinner({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `${size > 24 ? 3 : 2}px solid var(--line)`,
        borderTopColor: "var(--garden)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        flexShrink: 0,
        margin: size === 32 ? "0 auto" : undefined,
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
