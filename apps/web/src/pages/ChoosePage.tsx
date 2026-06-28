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

function getNextFiveMondays(): string[] {
  const today = new Date();
  const day = today.getDay();
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

function formatShortDate(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekRange(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const mon = new Date(y!, m! - 1, d!);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

/** Relative label: "Next week", "In 2 weeks", etc. */
function weekRelativeLabel(index: number): string {
  if (index === 0) return "Next week";
  if (index === 1) return "In 2 weeks";
  return `In ${index + 1} weeks`;
}

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

  useEffect(() => {
    const hasPending = entries.some((e) => e.week?.status === "pending") || generatingFor.size > 0;
    if (!hasPending) return;
    const id = setInterval(loadWeeks, 5000);
    return () => clearInterval(id);
  }, [entries, generatingFor, loadWeeks]);

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
      {/* Page header */}
      <div style={{ padding: "32px 20px 24px" }}>
        <p
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            color: "var(--stone)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Good to see you
        </p>
        <h1 style={{ fontSize: "2rem", letterSpacing: "-0.02em", marginBottom: 6 }}>
          Hello, {name}
        </h1>
        <p style={{ color: "var(--stone)", fontSize: "0.9rem", lineHeight: 1.5 }}>
          Plan your meals for the weeks ahead.
        </p>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 0 40px" }}>
          {entries.map((entry, idx) => (
            <WeekCard
              key={entry.weekStart}
              entry={entry}
              relativeLabel={weekRelativeLabel(idx)}
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
  relativeLabel,
  generating,
  onGenerate,
  onSkip,
  onOpen,
}: {
  entry: WeekEntry;
  relativeLabel: string;
  generating: boolean;
  onGenerate: (mc: MealCounts) => void;
  onSkip: () => void;
  onOpen: () => void;
}) {
  const { weekStart, week, selectedRecipes } = entry;
  const [picking, setPicking] = useState(false);
  const [counts, setCounts] = useState<MealCounts>({ breakfast: 1, lunch: 1, dinner: 3 });

  const isPending = generating || week?.status === "pending";
  const isSelecting = !isPending && week?.status === "selecting";
  const isActive = week?.status === "shopping" || week?.status === "cooking";
  const isEmpty = !week || week.status === "done" || week.status === "skipped" || week.status === "error";
  const isSkipped = week?.status === "skipped";
  const isError = week?.status === "error";

  const candidateCount = week?.candidateRecipeIds?.length ?? 0;
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

  // Accent color based on status
  const accentColor =
    isPending ? "var(--stone)" :
    isSelecting ? "var(--apricot)" :
    isActive ? "var(--garden)" :
    "var(--line)";

  return (
    <div
      style={{
        background: "var(--paper)",
        borderTop: `1px solid var(--line)`,
        borderBottom: `1px solid var(--line)`,
        marginBottom: -1,
        overflow: "hidden",
      }}
    >
      {/* Status accent strip */}
      {!isEmpty && (
        <div style={{ height: 3, background: accentColor, opacity: 0.7 }} />
      )}

      <div style={{ padding: "16px 20px 18px" }}>
        {/* Week header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div
              style={{
                fontSize: "0.68rem",
                fontWeight: 600,
                color: "var(--stone)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 2,
              }}
            >
              {relativeLabel}
            </div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--ink)", lineHeight: 1 }}>
              {formatShortDate(weekStart)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--stone)", marginTop: 1 }}>
              {formatWeekRange(weekStart)}
            </div>
          </div>

          {/* Status pill */}
          {isPending && (
            <span style={pillStyle("#EFE9DC", "#7C766A")}>Generating…</span>
          )}
          {isSelecting && (
            <span style={pillStyle("#F5E8DE", "#A8623C")}>
              {candidateCount > 0 ? `${candidateCount} options` : "Ready"}
            </span>
          )}
          {week?.status === "shopping" && (
            <span style={pillStyle("#DCE8D4", "#42532F")}>Shopping</span>
          )}
          {week?.status === "cooking" && (
            <span style={pillStyle("#DCE8D4", "#566A46")}>Cooking</span>
          )}
          {week?.status === "done" && (
            <span style={pillStyle("#E4ECD9", "#3E5430")}>Done</span>
          )}
          {isSkipped && (
            <span style={pillStyle("#EFE9DC", "#7C766A")}>Skipped</span>
          )}
          {isError && (
            <span style={pillStyle("#F5DEDA", "#7A2E22")}>Failed</span>
          )}
        </div>

        {/* Pending spinner */}
        {isPending && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <Spinner size={16} />
            <span style={{ color: "var(--stone)", fontSize: "0.85rem" }}>
              Chef Claude is crafting your menu…
            </span>
          </div>
        )}

        {/* Selecting: candidate summary */}
        {isSelecting && !picking && candidateCount > 0 && (
          <MealTypeSummary week={week} />
        )}

        {/* Active weeks: selected meal chips */}
        {isActive && selectedRecipes.length > 0 && !picking && (
          <div
            style={{
              display: "flex",
              overflowX: "auto",
              gap: 8,
              paddingBottom: 12,
              scrollbarWidth: "none",
            }}
          >
            {selectedRecipes.map((r) => (
              <div
                key={r.id}
                style={{
                  flexShrink: 0,
                  width: 108,
                  borderRadius: 8,
                  background: MEAL_COLORS[r.mealType] ?? "#F5F5F5",
                  padding: "8px 10px 7px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.66rem",
                    fontWeight: 600,
                    lineHeight: 1.3,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    marginBottom: 4,
                    color: "var(--ink)",
                  } as React.CSSProperties}
                >
                  {r.title}
                </div>
                <div style={{ fontSize: "0.58rem", color: "var(--stone)", textTransform: "capitalize" }}>
                  {r.mealType}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty states */}
        {isEmpty && !picking && (
          <p style={{ fontSize: "0.85rem", color: "var(--stone)", marginBottom: 12, lineHeight: 1.5 }}>
            {isSkipped
              ? "You skipped this week."
              : isError
              ? "Generation failed. Try again?"
              : "No meals planned yet."}
          </p>
        )}

        {/* Per-type picker */}
        {picking && !isPending && (
          <div style={{ marginBottom: 4 }}>
            <p style={{ fontSize: "0.82rem", color: "var(--stone)", marginBottom: 14 }}>
              How many meals per type?
            </p>
            {(["breakfast", "lunch", "dinner"] as const).map((type) => (
              <div
                key={type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingBottom: 10,
                  marginBottom: 10,
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--ink)", textTransform: "capitalize" }}>
                    {type}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--stone)", marginTop: 1 }}>
                    {type === "breakfast" ? "Mornings" : type === "lunch" ? "Midday" : "Evenings"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <button
                    onClick={() => stepperChange(type, -1)}
                    disabled={counts[type] === 0}
                    style={stepperBtnStyle(counts[type] === 0)}
                  >
                    −
                  </button>
                  <span style={{ fontWeight: 700, fontSize: "1.1rem", minWidth: 20, textAlign: "center", color: counts[type] === 0 ? "var(--stone)" : "var(--ink)" }}>
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

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
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
                  Skip week
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
        )}

        {/* Action buttons */}
        {!isPending && !picking && (
          <div style={{ display: "flex", gap: 8 }}>
            {(isEmpty) && (
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setPicking(true)}>
                Plan this week
              </button>
            )}
            {isSelecting && (
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={onOpen}>
                Choose meals
              </button>
            )}
            {isActive && (
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={onOpen}>
                View meals
              </button>
            )}
            {isSelecting && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.82rem", padding: "12px 14px" }}
                onClick={() => { onSkip(); }}
              >
                Skip
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Small meal-type breakdown for selecting weeks */
function MealTypeSummary({ week }: { week: Week }) {
  const counts = week.mealCounts;
  if (!counts) return null;
  const parts: string[] = [];
  if (counts.breakfast > 0) parts.push(`${counts.breakfast * 2}B`);
  if (counts.lunch > 0) parts.push(`${counts.lunch * 2}L`);
  if (counts.dinner > 0) parts.push(`${counts.dinner * 2}D`);
  if (parts.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        marginBottom: 14,
        flexWrap: "wrap",
      }}
    >
      {(["breakfast", "lunch", "dinner"] as const).map((type) => {
        const c = counts[type];
        if (c === 0) return null;
        return (
          <span
            key={type}
            style={{
              fontSize: "0.72rem",
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 999,
              background:
                type === "breakfast" ? "#F5E8DE" :
                type === "lunch" ? "#EFE9DC" : "#DCE8D4",
              color:
                type === "breakfast" ? "#A8623C" :
                type === "lunch" ? "#7C766A" : "#42532F",
              textTransform: "capitalize",
            }}
          >
            {c * 2} {type}
          </span>
        );
      })}
      <span style={{ fontSize: "0.72rem", color: "var(--stone)", alignSelf: "center" }}>
        options to choose from
      </span>
    </div>
  );
}

function pillStyle(bg: string, color: string): React.CSSProperties {
  return {
    fontSize: "0.68rem",
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 999,
    background: bg,
    color,
    whiteSpace: "nowrap" as const,
    letterSpacing: "0.01em",
  };
}

function stepperBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 34,
    height: 34,
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
    fontWeight: 300,
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
