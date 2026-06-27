import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { ShoppingList, IngredientCategory } from "@cooking/core";
import * as api from "../api.js";

const CATEGORY_ORDER: IngredientCategory[] = [
  "produce",
  "protein",
  "dairy",
  "grains",
  "pantry",
  "condiments",
  "frozen",
  "beverages",
  "other",
];

const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  produce: "Produce",
  protein: "Meat & Protein",
  dairy: "Dairy",
  grains: "Grains & Bread",
  pantry: "Pantry",
  condiments: "Sauces & Condiments",
  frozen: "Frozen",
  beverages: "Beverages",
  other: "Other",
};

export default function ShoppingListPage() {
  const [searchParams] = useSearchParams();
  const weekParam = searchParams.get("week");
  const [list, setList] = useState<ShoppingList | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetch = weekParam
      ? api.getShoppingListForWeek(weekParam)
      : api.getShoppingList();
    fetch
      .then(setList)
      .catch(() => setError("No shopping list yet — confirm your meals first."))
      .finally(() => setLoading(false));
  }, [weekParam]);

  const toggle = (name: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (loading) return <LoadingShell />;

  if (error || !list) {
    return (
      <PageShell title="Shopping list">
        <div style={{ padding: "48px 16px", textAlign: "center" }}>
          <p className="text-muted">{error || "No shopping list yet."}</p>
        </div>
      </PageShell>
    );
  }

  // Group items by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: list.items.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  const totalItems = list.items.length;
  const checkedCount = list.items.filter((i) => checked.has(i.name)).length;

  return (
    <PageShell title="Shopping list">
      <div style={{ padding: "0 16px 12px" }}>
        <p className="text-sm text-muted">
          {checkedCount} of {totalItems} items checked · Week of {list.weekId}
        </p>
      </div>

      <div className="stack">
        {grouped.map(({ category, label, items }) => (
          <section key={category} style={{ marginBottom: 8 }}>
            <h2
              style={{
                padding: "8px 16px",
                fontSize: "0.8rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--slate-light)",
                background: "var(--border)",
              }}
            >
              {label}
            </h2>
            {items.map((item) => {
              const done = checked.has(item.name);
              return (
                <div
                  key={item.name}
                  className="row"
                  onClick={() => toggle(item.name)}
                  style={{
                    padding: "14px 16px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    background: done ? "#f7fdf9" : "#fff",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div className="row gap-3" style={{ flex: 1 }}>
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: done ? "none" : "2px solid var(--border)",
                        background: done ? "var(--green)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: "0.75rem",
                        flexShrink: 0,
                      }}
                    >
                      {done ? "✓" : ""}
                    </span>
                    <span
                      style={{
                        fontWeight: 500,
                        textDecoration: done ? "line-through" : "none",
                        color: done ? "var(--slate-light)" : "var(--slate)",
                      }}
                    >
                      {item.name}
                    </span>
                  </div>
                  <span className="text-sm text-muted">
                    {item.totalQuantity} {item.unit}
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {checkedCount > 0 && (
        <div style={{ padding: "12px 16px" }}>
          <button
            className="btn btn-ghost text-sm"
            onClick={() => setChecked(new Set())}
          >
            Clear all checks
          </button>
        </div>
      )}
    </PageShell>
  );
}

function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="stack" style={{ flex: 1 }}>
      <div style={{ padding: "24px 16px 16px", borderBottom: "1px solid var(--border)" }}>
        <h1>{title}</h1>
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function LoadingShell() {
  return (
    <PageShell title="Shopping list">
      <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
        <div
          style={{
            width: 28,
            height: 28,
            border: "3px solid var(--border)",
            borderTopColor: "var(--clay)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    </PageShell>
  );
}
