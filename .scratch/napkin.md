# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|-----------------|--------------------|
| 2026-02-20 | user | Used `/Users/x/ClawBase` after cloning from URL even though repo already existed at `/Users/x/Projects/GitHub/ClawBase`. | Default to the existing repo path under `/Users/x/Projects/GitHub/ClawBase` when available; confirm before cloning. |
| 2026-02-20 | self | Ran lint/typecheck before ensuring dependencies were installed, producing tool-not-found errors. | Run `npm ci` (or verify `node_modules` exists) before baseline audit commands in this repo. |
| 2026-02-20 | user | Pause on unexpected workspace changes slowed progress when the user wanted a bulk commit. | Ask once when unexpected changes appear; if user says commit all, stage/commit all without further filtering. |

## User Preferences
- Keep responses concise and action-oriented.
- Use the existing repo at `/Users/x/Projects/GitHub/ClawBase`.
- If asked to "commit all", include all current tracked/untracked changes.

## Patterns That Work
- For link-only inputs, confirm desired action and repository path before cloning.
- Install dependencies first, then run `npm run lint`/`npx tsc --noEmit` for actionable findings.

## Patterns That Don't Work
- Creating duplicate clones in home directory when a maintained working copy already exists.

## Domain Notes
- Canonical local path for this project: `/Users/x/Projects/GitHub/ClawBase`.
