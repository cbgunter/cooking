# Cooking — Brand Guidelines

*A meal-kit identity with the calm of a well-run kitchen.*

---

## 1. Brand direction

The personality sits between a thoughtful product company and a good neighborhood restaurant. We take the freshness cue of a meal-kit brand but strip out the supermarket-flyer energy — no bright lime, no cartoon vegetables, no exclamation points.

Generous white space, hairline rules, and unhurried type do the work that loud color and busy icons do elsewhere. **Boldness is spent in exactly one place — the food photography** — and everything around it stays disciplined so the plate is always the loudest thing on the screen.

Three words to hold onto: **calm, confident, edible.**

---

## 2. Logo & wordmark

The wordmark is set in the display serif (Newsreader, Medium) — never the sans, never a custom or decorative cut.

- **Primary:** "Mise" in Garden green on a warm paper background.
- **Reversed:** Paper-colored wordmark on Garden or Ink backgrounds only.
- **Clear space:** Keep free space equal to the cap-height of the "M" on all sides.
- **Minimum size:** 18px / 0.25in tall. Below this, legibility of the serif breaks down.

**Don't:** stretch or condense it, add a tagline lockup inside the clear space, apply shadows or gradients, set it in the sans, or place it on a busy photo without a solid backing.

---

## 3. Color

A strict palette: six warm neutrals, one primary, one accent. Discipline is the point.

### Brand

| Token | Hex | Role |
|---|---|---|
| **Garden** | `#566A46` | Primary brand. Buttons, links, active states, wordmark. |
| **Garden Deep** | `#42532F` | Hover and pressed states only. |
| **Apricot** | `#C2774E` | Sole accent. Tags, small flags, highlights. |

### Neutrals

| Token | Hex | Role |
|---|---|---|
| **Ink** | `#23261E` | Primary text. Warm olive-black — never pure black. |
| **Stone** | `#7C766A` | Secondary and muted text, captions. |
| **Oat** | `#F6F3EC` | Page background. Warm paper base. |
| **Cream** | `#EFE9DC` | Alternating section background. |
| **Paper** | `#FCFBF8` | Cards and raised surfaces. |
| **Line** | `#E4DECF` | Hairlines and borders. |

### Support (illustrative only)

| Token | Hex | Role |
|---|---|---|
| **Sprout** | `#8FA075` | Gradients and photo frames only. **Never used for text.** |

### Color rules

- Green is the only color a person can **act** on. If it's green, it's tappable.
- Apricot never exceeds ~5% of a screen. It flags; it does not fill. It is **not** a second brand color.
- No pure black, no pure white. Everything carries warmth.
- Accessibility: Paper on Garden clears WCAG AA for body text. Apricot is for fills and large/decorative use — use Apricot Deep (`#A8623C`) for any small accent text.

---

## 4. Typography

Two faces, divided strictly by job. No third font, ever.

### Newsreader — display & editorial
Headlines, recipe names, pull quotes. Serif, warm, literary.

| Style | Weight | Settings |
|---|---|---|
| Display | 500 | clamp 44–84px · line-height 1.02 · letter-spacing −0.02em |
| Heading | 500 | 30–44px · line-height 1.1 · letter-spacing −0.015em |
| Recipe title | 400 *italic* | 24–30px · the editorial signature |

### Hanken Grotesk — body & interface
Body copy, labels, buttons, data. Humanist sans, clean, functional.

| Style | Weight | Settings |
|---|---|---|
| Lede | 400 | 18–21px · line-height 1.55 |
| Body | 400 | 16px · line-height 1.6 |
| Label | 600 | 12px · uppercase · letter-spacing 0.14em |

**Rule of thumb:** if it's editorial, it's serif. If it's functional, it's sans. Recipe and dish names always take the italic serif.

---

## 5. Voice

Speak like a good cook, not a brochure. Plain, warm, specific. Name the ingredient. The food is exciting on its own — let it be.

| Instead of | Write |
|---|---|
| Unlock a world of culinary adventure! | Six dinners, chosen by you, on the doorstep by Thursday. |
| Submit your preferences | Plan my week |
| Oops! Something went wrong. | We couldn't save your menu. Check your connection and try again. |

**Principles**

- Active voice. A button says what happens: "Choose this meal," not "Submit."
- Sentence case everywhere except uppercase utility labels.
- No filler, no hype, no exclamation points.
- Errors explain what happened and how to fix it. They don't apologize and they're never vague.

---

## 6. Components

- **Buttons** — fully rounded (pill). Primary is Garden fill with Paper text; secondary is a ghost button with an Ink hairline. Hover deepens the green.
- **Tags** — small pills. Vegetarian and similar use a soft Sprout tint; "new this week" uses a soft Apricot tint. Tags inform, they don't decorate.
- **Inputs** — pill-shaped, Oat fill, Line border, Garden focus ring.
- **Recipe card (the signature element)** — italic serif title, a single framed photo, calm metadata (time · servings · kcal). Everything else inherits its restraint.

**Layout system**

- Max content width ~1080px, 32px side gutters.
- Section rhythm ~88px vertical, alternating Oat and Cream backgrounds separated by Line hairlines.
- Corner radius 10px for surfaces, 999px (pill) for interactive elements.

---

## 7. Imagery & icons

Photography leads. Icons stay out of the way.

**Photography**

- Real food, natural daylight, honest portions.
- Shot overhead or at the table, never styled into a cartoon.
- Generous negative space. A single hairline frame where framing is needed.

**Icons**

- A single thin line set, used only where genuinely necessary.
- Never illustrated mascots, never 3D icons, never colored emoji.

**Don't:** saturated filters, hard drop shadows, gimmicky vegetable doodles.

---

## 8. Quick-reference checklist

Before anything ships:

- [ ] Only Garden is acting as a tappable/brand color.
- [ ] Apricot is under ~5% of the surface.
- [ ] No pure black or pure white anywhere.
- [ ] Two fonts only — serif for editorial, sans for function.
- [ ] Dish and recipe names are in italic serif.
- [ ] Food photography is the loudest element on the screen.
- [ ] Copy is plain, active, and free of hype.