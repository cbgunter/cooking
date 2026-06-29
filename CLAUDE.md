# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev server (http://localhost:5173)
npm run dev -w apps/web

# Type-check everything
npm run typecheck

# Type-check one workspace
npm run typecheck -w apps/web
npm run typecheck -w services/api

# Build all (packages must build before apps/services)
npm run build

# Run tests (only packages/core and services/api have tests)
npm test -w packages/core
npm test -w services/api

# Deploy infrastructure (from /infra)
npx cdk deploy --all
```

## Architecture

This is an npm workspaces monorepo with four layers:

```
packages/core     — shared TypeScript types and pure utilities (no AWS deps)
packages/ai       — Claude API integration: prompt building, tool-call parsing, candidate generation
services/api      — Hono HTTP handler deployed as a Lambda (API Gateway proxy)
services/jobs     — Lambda handlers for async work: meal generation, email reminders
apps/web          — React + Vite SPA (PWA)
infra/            — AWS CDK stacks
```

**Build order matters**: `packages/core` → `packages/ai` → everything else. Lambda bundling uses esbuild aliases to inline workspace packages directly (no pre-build required for deploys).

## AWS Infrastructure

- **DynamoDB**: single table `cooking-household` (PK + SK, pay-per-request)
- **Cognito**: email-only user pool, SRP auth, no self-signup
- **API Lambda** (`cooking-api`): handles all HTTP via `services/api/src/handler.ts`
- **Generate Lambda** (`cooking-generate`): invoked async by the API Lambda; runs AI generation; reads Anthropic API key from Secrets Manager (`cooking/anthropic-api-key`)
- **Frontend**: S3 + CloudFront, deployed separately via `infra/lib/web-stack.ts`

The API Lambda invokes the Generate Lambda with `InvocationType: "Event"` (fire-and-forget). The frontend polls for status changes.

## DynamoDB Key Schema

| PK | SK | Value |
|---|---|---|
| `HOUSEHOLD` | `PREFS` | `HouseholdPreferences` |
| `HOUSEHOLD` | `CURRENT_WEEK` | `{ weekStart: string }` |
| `WEEK#<weekStart>` | `META` | `Week` |
| `RECIPE#<id>` | `META` | `Recipe` |
| `RECIPE#<id>` | `RATING#<weekId>#<email>` | `Rating` (per-user) |
| `RECIPE#<id>` | `RATING#<weekId>` | `Rating` (legacy, no user) |

All scans filter on SK prefix patterns — there are no GSIs.

## Week Lifecycle

```
pending → selecting → shopping → cooking → done
                                         ↘ skipped
        ↘ error
```

- `pending`: Generate Lambda running
- `selecting`: candidates ready, users voting and choosing
- `shopping`: meals confirmed, shopping list available
- `cooking`: at least one recipe marked cooked
- `done`: all selected recipes cooked
- `error`: generation failed (Anthropic API error or all candidates filtered out); `Week.errorMessage` carries a human-readable reason shown in the UI

## Tab → Code Map

| Tab | Frontend | API endpoints |
|---|---|---|
| **Choose** | `ChoosePage.tsx`, `WeekDetailPage.tsx` | `GET/POST /weeks`, `POST /weeks/:id/generate`, `POST /weeks/:id/topup`, `POST /weeks/:id/select`, `POST /weeks/:id/vote` |
| **Shop** | `ShopPage.tsx`, `ShoppingListPage.tsx` | `GET /weeks/:id/shopping-list` |
| **Cook** | `CookPage.tsx`, `CookWeekPage.tsx`, `RecipePage.tsx` | `POST /recipes/:id/cooked` |
| **Eat** | `EatPage.tsx` | `GET /eat` |
| **Settings** | `PreferencesPage.tsx` | `GET/PUT /preferences` |

## AI Generation Flow

`ChoosePage` → `POST /weeks/:weekStart/generate` → API Lambda → async invokes Generate Lambda → `packages/ai/src/generator.ts` calls Claude with `add_recipe` tool → recipes saved to DynamoDB → week status set to `selecting`.

Candidate counts: breakfast and lunch always generate **4 candidates** regardless of day count (user picks 1–2). Dinner generates **2× the requested night count**. Logic lives in `packages/ai/src/prompt.ts` → `buildTargetCounts`.

**Chunked batching** (`CHUNK_SIZE = 2`): within each meal type, candidates are generated in sequential chunks of 2. Each chunk receives the already-accepted titles+cuisines as context, pushing the model onto fresh protein/method/cuisine territory. All three meal types run in parallel; chunks within a type are sequential.

**Variety contract**: the prompt enforces diversity across three axes — primary protein (no single protein in more than ⌈N/3⌉ of N recipes), cuisine/flavor profile, and cooking format (sheet-pan, stir-fry, soup, etc.). Two candidates sharing the same protein AND cooking format are rejected by the prompt rule.

**Taste profile**: if `HouseholdPreferences.tasteProfile` is set, it is injected into the prompt as the primary style anchor, ahead of cuisine preferences and adventure level.

**Extended thinking**: each Claude call uses `thinking: { type: "adaptive" }` so the model plans variety across the variety contract before committing to tool calls.

**Generation time**: currently ~3 minutes for a full week (up from ~30s before the mise en place `prepSteps`/`cookSteps` fields were added — more output tokens per recipe). The Generate Lambda timeout is 5 minutes. See the backlog for optimization opportunities (`max_tokens` right-sizing, prompt caching).

If a type returns zero accepted candidates after retries, the week moves to `error` status.

**Constraint filtering** (`packages/core/src/constraints.ts`): breakfast and lunch are exempt from the minimum prep-time floor — only dinner enforces it. All other constraints (calories, sodium, cost, max time, dislikes) apply to all meal types.

## Top-up Flow (post-confirm regeneration)

After confirming selections, if any meal type is short of its target count a "Missing meals" section appears in the week detail. Tapping "Get [type] options" triggers a per-type top-up:

1. `POST /weeks/:weekStart/topup` sets `Week.topUpMealCounts` and async-invokes the Generate Lambda with `appendMode: true`
2. Generate Lambda appends new recipe IDs to `candidateRecipeIds` without touching week status or existing selections, then clears `topUpMealCounts`
3. Frontend polls on `topUpMealCounts` (5 s interval), shows a per-type spinner while in flight
4. Once candidates arrive, inline cards with quantity steppers appear; "Add to plan" merges picks into `Week.selections` via the existing `POST /weeks/:weekStart/select` endpoint

On top-up error the week stays in `shopping` — confirmed meals are unaffected. `topUpMealCounts` is cleared so the spinner stops and the user can retry.

## User Identity

Two household members: `cbgunter@gmail.com` (Corey) and `lmalava87@gmail.com` (Luisa). The name mapping lives in `apps/web/src/auth.ts`. User email is decoded from the Cognito JWT on the frontend (`getCurrentUserEmail`) and on the backend (`getUserEmail` in `handler.ts`). Ratings are keyed per-user so both can rate the same meal independently.

## Frontend Conventions

- Auth state lives in `localStorage` (token + expiry). `getToken()` in `auth.ts` is the source of truth.
- All API calls go through `apps/web/src/api.ts` → `req()` which injects the Bearer token.
- Routing is React Router v6 in `App.tsx`. `AppShell.tsx` renders the top nav strip; active tab is determined by `location.pathname` prefix matching.
- Inline styles throughout (no CSS framework). CSS custom properties are defined in `index.css` (`--paper`, `--oat`, `--garden`, `--clay`, `--stone`, `--line`, etc.).
