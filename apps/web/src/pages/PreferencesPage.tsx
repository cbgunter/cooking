import { useState, useEffect } from "react";
import type { HouseholdPreferences, Equipment } from "@cooking/core";
import { DEFAULT_PREFERENCES } from "@cooking/core";
import * as api from "../api.js";

const ALL_EQUIPMENT: Equipment[] = [
  "stove",
  "oven",
  "grill",
  "sous_vide",
  "crockpot",
  "dutch_oven",
  "microwave",
  "air_fryer",
];

const EQUIPMENT_LABELS: Record<Equipment, string> = {
  stove: "Stove",
  oven: "Oven",
  grill: "Grill",
  sous_vide: "Sous vide",
  crockpot: "Crockpot",
  dutch_oven: "Dutch oven",
  microwave: "Microwave",
  air_fryer: "Air fryer",
};

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<HouseholdPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dislikeInput, setDislikeInput] = useState("");

  useEffect(() => {
    api
      .getPreferences()
      .then(setPrefs)
      .finally(() => setLoading(false));
  }, []);

  const update = (patch: Partial<HouseholdPreferences>) =>
    setPrefs((p) => ({ ...p, ...patch }));

  const toggleEquipment = (eq: Equipment) => {
    const has = prefs.equipment.includes(eq);
    update({ equipment: has ? prefs.equipment.filter((e) => e !== eq) : [...prefs.equipment, eq] });
  };

  const addDislike = () => {
    const v = dislikeInput.trim();
    if (v && !prefs.dislikes.includes(v)) {
      update({ dislikes: [...prefs.dislikes, v] });
      setDislikeInput("");
    }
  };

  const removeDislike = (d: string) =>
    update({ dislikes: prefs.dislikes.filter((x) => x !== d) });

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.savePreferences(prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="stack" style={{ flex: 1 }}>
      <div style={{ padding: "24px 16px 16px", borderBottom: "1px solid var(--border)" }}>
        <h1>Preferences</h1>
      </div>

      <div className="stack gap-4" style={{ padding: "16px", overflow: "auto" }}>
        {/* Household */}
        <Section title="Household">
          <Field label="Number of people">
            <input
              type="number"
              min={1}
              max={12}
              value={prefs.peopleCount}
              onChange={(e) => update({ peopleCount: Number(e.target.value) })}
              style={inputStyle}
            />
          </Field>
          <Field label="Default days per week">
            <input
              type="number"
              min={1}
              max={7}
              value={prefs.defaultDaysPerWeek}
              onChange={(e) => update({ defaultDaysPerWeek: Number(e.target.value) })}
              style={inputStyle}
            />
          </Field>
          <Field label="Notification email">
            <input
              type="email"
              value={prefs.notificationEmail}
              onChange={(e) => update({ notificationEmail: e.target.value })}
              style={inputStyle}
              placeholder="you@example.com"
            />
          </Field>
        </Section>

        {/* Constraints */}
        <Section title="Nutrition limits (per serving)">
          <Field label="Max calories">
            <input
              type="number"
              value={prefs.nutrition.maxCaloriesPerMeal}
              onChange={(e) =>
                update({ nutrition: { ...prefs.nutrition, maxCaloriesPerMeal: Number(e.target.value) } })
              }
              style={inputStyle}
            />
          </Field>
          <Field label="Max sodium (mg)">
            <input
              type="number"
              value={prefs.nutrition.maxSodiumMgPerMeal}
              onChange={(e) =>
                update({ nutrition: { ...prefs.nutrition, maxSodiumMgPerMeal: Number(e.target.value) } })
              }
              style={inputStyle}
            />
          </Field>
        </Section>

        {/* Cost caps */}
        <Section title="Cost caps ($/person)">
          <Field label="Breakfast">
            <input
              type="number"
              min={0}
              step={0.5}
              value={prefs.costCaps.breakfast}
              onChange={(e) =>
                update({ costCaps: { ...prefs.costCaps, breakfast: Number(e.target.value) } })
              }
              style={inputStyle}
            />
          </Field>
          <Field label="Lunch">
            <input
              type="number"
              min={0}
              step={0.5}
              value={prefs.costCaps.lunch}
              onChange={(e) =>
                update({ costCaps: { ...prefs.costCaps, lunch: Number(e.target.value) } })
              }
              style={inputStyle}
            />
          </Field>
          <Field label="Dinner">
            <input
              type="number"
              min={0}
              step={0.5}
              value={prefs.costCaps.dinner}
              onChange={(e) =>
                update({ costCaps: { ...prefs.costCaps, dinner: Number(e.target.value) } })
              }
              style={inputStyle}
            />
          </Field>
        </Section>

        {/* Adventure level */}
        <Section title="Recipe variety">
          <div className="stack gap-2">
            {(["adventurous", "balanced", "comfort"] as const).map((level) => (
              <button
                key={level}
                onClick={() => update({ adventureLevel: level })}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: `1.5px solid ${prefs.adventureLevel === level ? "var(--garden)" : "var(--border)"}`,
                  background: prefs.adventureLevel === level ? "var(--garden)" : "#fff",
                  color: prefs.adventureLevel === level ? "var(--paper)" : "var(--slate)",
                  textAlign: "left",
                  fontWeight: prefs.adventureLevel === level ? 600 : 400,
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  textTransform: "capitalize",
                }}
              >
                {level}
              </button>
            ))}
          </div>
        </Section>

        {/* Equipment */}
        <Section title="Equipment">
          <p style={{ fontSize: "0.78rem", color: "var(--slate-light)", marginTop: -4 }}>
            Tap to toggle. Filled = available.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ALL_EQUIPMENT.map((eq) => {
              const active = prefs.equipment.includes(eq);
              return (
                <button
                  key={eq}
                  onClick={() => toggleEquipment(eq)}
                  aria-pressed={active}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    borderRadius: 999,
                    padding: "7px 14px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: `1.5px solid ${active ? "var(--garden)" : "var(--border)"}`,
                    background: active ? "var(--garden)" : "#fff",
                    color: active ? "var(--paper)" : "var(--slate-light)",
                    transition: "background 0.15s, border-color 0.15s, color 0.15s",
                  }}
                >
                  <span style={{ fontSize: "0.85rem", lineHeight: 1 }}>
                    {active ? "✓" : "+"}
                  </span>
                  {EQUIPMENT_LABELS[eq]}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Dislikes */}
        <Section title="Dislikes / avoid">
          <div className="row gap-2" style={{ marginBottom: 8 }}>
            <input
              type="text"
              value={dislikeInput}
              onChange={(e) => setDislikeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDislike()}
              placeholder="e.g. mushrooms, cilantro"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button className="btn btn-outline" onClick={addDislike}>
              Add
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {prefs.dislikes.map((d) => (
              <span
                key={d}
                className="tag"
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                {d}
                <button
                  onClick={() => removeDislike(d)}
                  style={{ color: "var(--slate-light)", fontSize: "1rem", lineHeight: 1, cursor: "pointer", background: "none", border: "none" }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </Section>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ width: "100%", marginTop: 8 }}
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="stack gap-3">
      <h2 style={{ fontSize: "0.9rem", color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <label style={{ fontSize: "0.9rem", fontWeight: 500, flexShrink: 0 }}>{label}</label>
      <div style={{ maxWidth: 160, width: "100%" }}>{children}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1.5px solid var(--border)",
  fontSize: "0.9rem",
  color: "var(--slate)",
  background: "#fff",
  outline: "none",
};
