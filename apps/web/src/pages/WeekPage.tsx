import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Recipe, Week } from "@cooking/core";
import * as api from "../api.js";

// Use local date parts to avoid UTC offset shifting the date back one day
function toLocalISO(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function getUpcomingMondays(count = 4): string[] {
  const today = new Date();
  const day = today.getDay();
  const daysToThisMon = day === 0 ? 1 : 1 - day;
  const base = new Date(today);
  base.setDate(today.getDate() + daysToThisMon);
  base.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i * 7);
    return toLocalISO(d);
  });
}

function formatWeekDate(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const MEAL_COLORS: Record<string, string> = {
  breakfast: "#FEF9C3",
  lunch: "#DCFCE7",
  dinner: "#FFEDD5",
};

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: "#F3F4F6", color: "#6B7280", label: "Generating…" },
  selecting: { bg: "#FEF3C7", color: "#92400E", label: "Choose meals" },
  shopping:  { bg: "#DBEAFE", color: "#1E40AF", label: "Ready to shop" },
  cooking:   { bg: "#D1FAE5", color: "#065F46", label: "Cooking" },
  done:      { bg: "#D1FAE5", color: "#065F46", label: "Complete" },
  skipped:   { bg: "#F3F4F6", color: "#6B7280", label: "Skipped" },
  error:     { bg: "#FEE2E2", color: "#991B1B", label: "Failed" },
};

interface WeekEntry {
  weekStart: string;
  week: Week | null;
  selectedRecipes: Recipe[];
}

const MONDAYS = getUpcomingMondays(4);

export default function WeekPage() {
  const [entries, setEntries] = useState<WeekEntry[]>(
    MONDAYS.map((ws) => ({ weekStart: ws, week: null, selectedRecipes: [] }))
  );
  const [loading, setLoading] = useState(true);
  const [generatingFor, setGeneratingFor] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

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

  const handleGenerate = async (weekStart: string, daysPerWeek: number) => {
    setGeneratingFor((p) => new Set(p).add(weekStart));
    try {
      await api.triggerGenerateForWeek(weekStart, daysPerWeek);
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

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "24px 16px 12px", borderBottom: "1px solid var(--border)" }}>
        <h1>Upcoming weeks</h1>
      </div>
      <div className="stack gap-3" style={{ padding: "16px 16px 80px" }}>
        {entries.map((entry) => (
          <WeekCard
            key={entry.weekStart}
            entry={entry}
            generating={generatingFor.has(entry.weekStart)}
            onGenerate={(days) => handleGenerate(entry.weekStart, days)}
            onSkip={() => handleSkip(entry.weekStart)}
            onOpen={() => navigate(`/weeks/${entry.weekStart}`)}
          />
        ))}
      </div>
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
  onGenerate: (days: number) => void;
  onSkip: () => void;
  onOpen: () => void;
}) {
  const { weekStart, week, selectedRecipes } = entry;
  const [picking, setPicking] = useState(false);
  const [days, setDays] = useState(5);

  const label = formatWeekDate(weekStart);
  const isPending = generating || week?.status === "pending";
  const isEmpty = !week || week.status === "done" || week.status === "skipped" || week.status === "error";
  const badge = week?.status ? STATUS_BADGE[week.status] : null;

  const confirmGenerate = () => {
    setPicking(false);
    onGenerate(days);
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "1rem" }}>{label}</span>
        {badge && (
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 600,
              padding: "3px 9px",
              borderRadius: 12,
              background: badge.bg,
              color: badge.color,
            }}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "12px 16px 14px" }}>
        {isPending ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0 10px" }}>
            <Spinner size={18} />
            <span style={{ color: "var(--slate-light)", fontSize: "0.85rem" }}>
              Chef Claude is crafting your menu…
            </span>
          </div>
        ) : selectedRecipes.length > 0 && !picking ? (
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
                  width: 108,
                  height: 68,
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
                    fontSize: "0.68rem",
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
                <span style={{ fontSize: "0.6rem", color: "rgba(0,0,0,0.4)", textTransform: "capitalize" }}>
                  {r.mealType}
                </span>
              </div>
            ))}
          </div>
        ) : isEmpty && !picking ? (
          <p style={{ color: "var(--slate-light)", fontSize: "0.85rem", margin: "4px 0 10px" }}>
            {week?.status === "skipped"
              ? "You skipped this week."
              : week?.status === "error"
              ? "Generation failed — try again."
              : "No meals planned yet."}
          </p>
        ) : null}

        {/* Pre-generate picker */}
        {picking && !isPending && (
          <div style={{ paddingBottom: 4 }}>
            <p style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 10, color: "var(--slate)" }}>
              How many meals this week?
            </p>
            <div className="row gap-2" style={{ marginBottom: 14, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  onClick={() => setDays(n)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: `2px solid ${days === n ? "var(--clay)" : "var(--border)"}`,
                    background: days === n ? "var(--clay)" : "transparent",
                    color: days === n ? "#fff" : "var(--slate)",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    cursor: "pointer",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="stack gap-2">
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={confirmGenerate}>
                Generate {days} meal{days !== 1 ? "s" : ""}
              </button>
              <div className="row gap-2">
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
        )}

        {/* Action buttons */}
        {!isPending && !picking && (
          <>
            {isEmpty && (
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setPicking(true)}>
                Generate menu
              </button>
            )}
            {week?.status === "selecting" && (
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={onOpen}>
                Choose meals
              </button>
            )}
            {(week?.status === "shopping" || week?.status === "cooking") && (
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={onOpen}>
                {week.status === "cooking" ? "View recipes" : "View & shop"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Spinner({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `${size > 24 ? 3 : 2}px solid var(--border)`,
        borderTopColor: "var(--clay)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        flexShrink: 0,
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
