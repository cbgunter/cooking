import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Recipe, Week, MealCounts } from "@cooking/core";
import * as api from "../api.js";
import { getDisplayName } from "../auth.js";

function toLocalISO(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Returns the next 5 Mondays starting with NEXT week (never the current week). */
function getNextFiveMondays(): string[] {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon
  const daysToNextMon = day === 0 ? 1 : 8 - day;
  const base = new Date(today);
  base.setDate(today.getDate() + daysToNextMon);
  base.setHours(0, 0, 0, 0);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i * 7);
    return toLocalISO(d);
  });
}

function formatWeekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekRange(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const mon = new Date(y!, m! - 1, d!);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: "#EFE9DC", color: "#7C766A", label: "Generating…" },
  selecting: { bg: "#F5E8DE", color: "#A8623C", label: "Ready to choose" },
  shopping:  { bg: "#DCE8D4", color: "#42532F", label: "Shopping" },
  cooking:   { bg: "#DCE8D4", color: "#566A46", label: "Cooking" },
  done:      { bg: "#DCE8D4", color: "#566A46", label: "Complete" },
  skipped:   { bg: "#EFE9DC", color: "#7C766A", label: "Skipped" },
  error:     { bg: "#F5DEDA", color: "#7A2E22", label: "Failed" },
};

const MEAL_COLORS: Record<string, string> = {
  breakfast: "#F5E8DE",
  lunch: "#EFE9DC",
  dinner: "#DCE8D4",
};

interface WeekEntry {
  weekStart: string;
  week: Week | null;
  selectedRecipes: Recipe[];
}

const MONDAYS = getNextFiveMondays();

export default function ChoosePage() {
  const [entries, setEntries] = useState<WeekEntry[]>(
    MONDAYS.map((ws) => ({ weekStart: ws, week: null, selectedRecipes: [] }))
  );
  const [loading, setLoading] = useState(true);
  const [generatingFor, setGeneratingFor] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const name = getDisplayName();

  const loadWeeks = useCallback(async () => {
    const { weeks } = await api.getWeeks();
    const byStart = new Map(weeks.map((w) => [w.week.weekStart, w]));
    setEntries(
      MONDAYS.map((ws) => ({
        weekStart: ws,
        week: byStart.get(ws)?.week ?? null,
        selectedRecipes: byStart.get(ws)?.selectedRecipes ?? [],
      }))
    );
  }, []);

  useEffect(() => {
    loadWeeks().finally(() => setLoading(false));
  }, [loadWeeks]);

  // Poll while any week is pending
  useEffect(() => {
    const hasPending = entries.some((e) => e.week?.status === "pending") || generatingFor.size > 0;
    if (!hasPending) return;
    const id = setInterval(loadWeeks, 5000);
    return () => clearInterval(id);
  }, [entries, generatingFor, loadWeeks]);

  // Clear generatingFor once the week is no longer pending
  useEffect(() => {
    setGeneratingFor((prev) => {
      const next = new Set(prev);
      for (const ws of prev) {
        const e = entries.find((x) => x.weekStart === ws);
        if (e?.week && e.week.status !== "pending") next.delete(ws);
      }
      return next;
    });
  }, [entries]);

  const handleGenerate = async (weekStart: string, mealCounts: MealCounts) => {
    setGeneratingFor((p) => new Set(p).add(weekStart));
    try {
      await api.triggerGenerateForWeek(weekStart, mealCounts);
      await loadWeeks();
    } catch (err) {
      setGeneratingFor((p) => { const n = new Set(p); n.delete(weekStart); return n; });
      alert(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleSkip = async (weekStart: string) => {
    try {
      await api.skipWeekByStart(weekStart);
      await loadWeeks();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {/* Header */}
      <div style={{ padding: "28px 20px 20px" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--stone)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4 }}>
          Good to see you
        </p>
        <h1 style={{ margin: 0, fontSize: "1.8rem", lineHeight: 1.1 }}>Hello, {name}</h1>
        <p style={{ marginTop: 6, color: "var(--stone)", fontSize: "0.9rem" }}>
          Pick your meals for the weeks ahead.
        </p>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px 32px" }}>
          {entries.map((entry) => (
            <WeekCard
              key={entry.weekStart}
              entry={entry}
              generating={generatingFor.has(entry.weekStart)}
              onGenerate={(mc) => handleGenerate(entry.weekStart, mc)}
              onSkip={() => handleSkip(entry.weekStart)}
              onOpen={() => navigate(`/weeks/${entry.weekStart}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekCard({
  entry,
  generating,
  onGenerate,
  onSkip,
  onOpen,
}: {
  entry: WeekEntry;
  generating: boolean;
  onGenerate: (mc: MealCounts) => void;
  onSkip: () => void;
  onOpen: () => void;
}) {
  const { weekStart, week, selectedRecipes } = entry;
  const [picking, setPicking] = useState(false);
  const [counts, setCounts] = useState<MealCounts>({ breakfast: 1, lunch: 1, dinner: 3 });

  const label = formatWeekRange(weekStart);
  const short = formatWeekLabel(weekStart);
  const isPending = generating || week?.status === "pending";
  const isEmpty = !week || week.status === "done" || week.status === "skipped" || week.status === "error";
  const badge = week?.status ? STATUS_BADGE[week.status] : null;
  const totalMeals = counts.breakfast + counts.lunch + counts.dinner;

  const confirmGenerate = () => {
    setPicking(false);
    onGenerate(counts);
  };

  const stepperChange = (key: keyof MealCounts, delta: number) => {
    setCounts((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(7, prev[key] + delta)),
    }));
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 12px",
          borderBottom: picking ? "1px solid var(--line)" : "none",
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Week of {short}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--stone)", marginTop: 1 }}>{label}</div>
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
        {/* Pending state */}
        {isPending ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 10 }}>
            <Spinner size={18} />
            <span style={{ color: "var(--stone)", fontSize: "0.85rem" }}>
              Chef Claude is crafting your menu…
            </span>
          </div>
        ) : null}

        {/* Selected meal chips */}
        {!isPending && selectedRecipes.length > 0 && !picking ? (
          <div
            style={{
              display: "flex",
              overflowX: "auto",
              gap: 8,
              paddingBottom: 10,
              scrollbarWidth: "none",
            }}
          >
            {selectedRecipes.map((r) => (
              <div
                key={r.id}
                style={{
                  flexShrink: 0,
                  width: 104,
                  height: 64,
                  borderRadius: 8,
                  background: MEAL_COLORS[r.mealType] ?? "#F5F5F5",
                  padding: "8px 8px 6px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: "0.66rem",
                    fontWeight: 600,
                    lineHeight: 1.25,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                  } as React.CSSProperties}
                >
                  {r.title}
                </span>
                <span style={{ fontSize: "0.58rem", color: "#7C766A", textTransform: "capitalize" }}>
                  {r.mealType}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Empty state text */}
        {!isPending && isEmpty && !picking ? (
          <p style={{ color: "var(--stone)", fontSize: "0.85rem", margin: "0 0 10px" }}>
            {week?.status === "skipped"
              ? "You skipped this week."
              : week?.status === "error"
              ? "Generation failed — try again."
              : "No meals planned yet."}
          </p>
        ) : null}

        {/* Per-type picker */}
        {picking && !isPending ? (
          <div>
            <p style={{ fontSize: "0.82rem", color: "var(--stone)", marginBottom: 14 }}>
              How many meals per type this week?
            </p>
            {(["breakfast", "lunch", "dinner"] as const).map((type) => (
              <div
                key={type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: "0.88rem",
                    fontWeight: 500,
                    color: "var(--ink)",
                    textTransform: "capitalize",
                    width: 80,
                  }}
                >
                  {type}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => stepperChange(type, -1)}
                    disabled={counts[type] === 0}
                    style={stepperBtnStyle(counts[type] === 0)}
                  >
                    −
                  </button>
                  <span style={{ fontWeight: 700, fontSize: "1rem", width: 18, textAlign: "center" }}>
                    {counts[type]}
                  </span>
                  <button
                    onClick={() => stepperChange(type, +1)}
                    disabled={counts[type] === 7}
                    style={stepperBtnStyle(counts[type] === 7)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                onClick={confirmGenerate}
                disabled={totalMeals === 0}
              >
                Generate {totalMeals} meal{totalMeals !== 1 ? "s" : ""}
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-ghost text-sm"
                  style={{ flex: 1 }}
                  onClick={() => { onSkip(); setPicking(false); }}
                >
                  Skip this week
                </button>
                <button
                  className="btn btn-ghost text-sm"
                  style={{ flex: 1 }}
                  onClick={() => setPicking(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Action buttons */}
        {!isPending && !picking ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {isEmpty && (
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setPicking(true)}>
                Plan this week
              </button>
            )}
            {week?.status === "selecting" && (
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={onOpen}>
                Choose meals
              </button>
            )}
            {(week?.status === "shopping" || week?.status === "cooking") && (
              <button className="btn btn-outline" style={{ width: "100%" }} onClick={onOpen}>
                View meals
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function stepperBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: `1.5px solid ${disabled ? "var(--line)" : "var(--garden)"}`,
    background: "transparent",
    color: disabled ? "var(--line)" : "var(--garden)",
    fontSize: "1.1rem",
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
