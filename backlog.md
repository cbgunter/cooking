# Backlog

## Multi-user meal selection
Currently the week is a single shared state — whoever hits "confirm selections" last wins. For two people choosing async:
- Add per-user votes/preferences on candidates (e.g. thumbs up/down per recipe per user)
- Week stays in `selecting` until both users have voted, or one user confirms after a timeout
- Conflict resolution: if both users want different meals, show a "you disagree on X" screen
- Could be as simple as showing who has/hasn't confirmed yet on the WeekPage

## Generate multiple weeks ahead of time
Currently you can only generate the upcoming week's menu. It would be useful to queue up 2–3 weeks in advance (e.g. before a vacation):
- Allow triggering generation for `weekStart + 7`, `weekStart + 14`, etc.
- Week switcher UI on WeekPage (tabs or prev/next arrows)
- Each week is independent: its own candidates, selections, shopping list

## Editing meal selections
Once a week moves to `shopping` or `cooking` status there's no way to change the chosen meals:
- Allow swapping a selected recipe for another candidate from the same week (without regenerating)
- Allow removing a meal entirely (e.g. eating out one night)
- "Undo confirm" — revert the week back to `selecting` status if shopping hasn't started yet
