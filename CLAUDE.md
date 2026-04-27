# GymGoli — Notes for Claude

## Design

**When creating or restyling a page, follow `DESIGN.md`.** It captures the
shared visual language: page shell, section cards, item cards with the
5px colored accent bar, filter chips, buttons, empty states, animations
and the page starter template. Reference pages: `train`, `library`,
`settings`.

Don't reach for `mat-button` / `mat-icon-button` — use the plain styled
buttons in `DESIGN.md`. Material is reserved for `mat-slide-toggle`,
`mat-dialog`, `mat-snack-bar` and form controls.

## Stack

- Angular 19, standalone components, signals + `computed()` + `effect()`
- Supabase for persistence; per-user data with RLS policies
- `localStorage` is used as a primary fallback for `user_settings` so the
  app works even before the migration runs
- Material Symbols (outlined) via the global font, never `mat-icon`

## Conventions

- Catalan UI copy
- CSS in compact grouped lines (see `DESIGN.md` §10)
- Tests use `jasmine.clock().mockDate(...)` for date-dependent logic
- Develop on a feature branch, never push to `main` directly without a PR
