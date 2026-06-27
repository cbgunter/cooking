# Backlog

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
