# Backlog

## Per-feature CLAUDE.md files
Move page files into feature subfolders and add a CLAUDE.md to each:
- `apps/web/src/pages/choose/` — ChoosePage.tsx, WeekDetailPage.tsx, WeekPage.tsx
- `apps/web/src/pages/shop/` — ShopPage.tsx, ShoppingListPage.tsx
- `apps/web/src/pages/cook/` — CookPage.tsx, CookWeekPage.tsx, RecipePage.tsx
- `apps/web/src/pages/eat/` — EatPage.tsx
- `apps/web/src/pages/settings/` — PreferencesPage.tsx
- Also add `services/api/CLAUDE.md` covering the DynamoDB access patterns and endpoint map in depth

Each CLAUDE.md should document: what the feature does, which API endpoints it owns, data model quirks, and known edge cases. After moving files, update imports in App.tsx and any cross-page navigate calls.

## Multi-user meal selection
Currently the week is a single shared state — whoever hits "confirm selections" last wins. For two people choosing async:
- Add per-user votes/preferences on candidates (e.g. thumbs up/down per recipe per user)
- Week stays in `selecting` until both users have voted, or one user confirms after a timeout
- Conflict resolution: if both users want different meals, show a "you disagree on X" screen
- Could be as simple as showing who has/hasn't confirmed yet on the WeekPage

## Multiple weeks
The main page should be week-aware rather than tied to a single "current" week:
- Show the week's starting date prominently (e.g. "Week of Jul 7")
- If no meals generated/selected for that week → show Generate button
- If meals are selected → show the cooking flow for that week
- Left/right arrows (or swipe) to navigate between weeks
- Any week can be in any state independently (one week cooking, next week still selecting)
- Generating a week should target that specific week's Monday, not always "next Monday"
- DynamoDB already supports this (WEEK#<date> keys); the API and frontend need the week scope passed explicitly

## Editing meal selections
Once a week moves to `shopping` or `cooking` status there's no way to change the chosen meals:
- Allow swapping a selected recipe for another candidate from the same week (without regenerating)
- Allow removing a meal entirely (e.g. eating out one night)
- "Undo confirm" — revert the week back to `selecting` status if shopping hasn't started yet

## Security hardening
Calibrated to a closed two-user household: the API Gateway Cognito authorizer verifies JWT signatures before the Lambda runs, self-signup is disabled, and both users intentionally share one `HOUSEHOLD` record. So these are defense-in-depth and robustness items, not live exploits.
- **Input validation on `PUT /preferences`** (highest value) — `services/api/src/handler.ts` saves `await c.req.json()` straight to DynamoDB with no schema check. Bad/negative/huge values (peopleCount, day counts, cost caps) flow into generation and the prompt. Add a zod (or hand-rolled) validator before `db.savePreferences`. Also a correctness fix.
- **Lock down CORS** — API Gateway uses `Cors.ALL_ORIGINS` (`infra/lib/api-stack.ts:118-122`) and Hono adds a second wildcard `cors()` (`handler.ts:10`). Low risk today (bearer-token auth, no ambient cookies) but should be pinned to the app origin + `localhost:5173`. The double CORS layer (gateway + Hono) is redundant.
- **Scope the GitHub deploy role** — `infra/lib/oidc-stack.ts` grants `AdministratorAccess` to the OIDC deploy role. Narrow to the CDK deploy / S3 sync / CloudFront invalidation actions actually needed.
- **Escape user text in reminder emails** — `services/jobs/src/reminders.ts` interpolates shopping-list item names into HTML unescaped. Self-targeted (trusted users), but escape before sending.
- **Tighten Cognito password policy** — `api-stack.ts:40-44`: 8 chars, no uppercase/symbol requirement. Minor for two known accounts.
- **Note (not an action):** `getUserEmail` (`handler.ts:15-25`) decodes the JWT without re-verifying — fine because the gateway authorizer already verified it. Don't move auth off the gateway without adding signature verification here.

## Performance & scaling
Fine at current scale (two users, hundreds of rows). These matter as data grows:
- **Scans won't scale** — every read path in `services/api/src/db.ts` and `services/jobs/src/db.ts` uses `Scan` + `FilterExpression` (recent recipes, ratings, all weeks). Cheap now, linear-cost later. When recipe/rating count grows, add a GSI (e.g. `SK` as PK) and convert hot paths to `Query`.
- **`/eat` and `/weeks` fan out over all weeks** — `handler.ts` loops every week doing per-week recipe + rating fetches (N+1). Combine with `BatchGetItem` and cap/paginate to the last ~6 weeks.
- **API Lambda timeout sits at 29s** (`api-stack.ts:102`), one second under the API Gateway hard limit, while `/eat` does unbounded per-week work. Bound the work (above) rather than just raising the timeout.
- **Frontend polls every 5s** in ChoosePage / WeekDetailPage while a week is pending. Generation takes 10–30s. Back off (5s → 10s → 20s) to cut redundant `/weeks` (Scan-backed) calls.

## AI generation cost
Modest today (~single-digit dollars/month for two people), but easy wins:
- **`max_tokens: 24000` per request** in `packages/ai/src/generator.ts` is generous; right-size per meal type.
- **Prompt caching** — the context block (recent recipes, highly-rated, dislikes, constraints) is rebuilt for each of the 3 per-meal-type requests. Mark the shared prefix with `cache_control` to cut input tokens across the breakfast/lunch/dinner calls.
- **Trim rating history** sent into the prompt to the last ~10–20 entries instead of all of it (`packages/ai/src/prompt.ts`).
- **Generate Lambda memory** is 1024 MB (`api-stack.ts:81`) for an I/O-bound (Anthropic call) workload; 512 MB likely suffices. Trivial savings — low priority.
