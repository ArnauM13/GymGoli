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

## Mascots

**When writing any feedback copy, follow `MASCOTES.md`.** The Marley and
Xoco personalities live there — who they are, how each one speaks, and the
voice rules (short, offer rather than point out gaps, never guilt). It's a
living document: their characters are meant to grow, so update it there
rather than only in code.

## Sincronització

**Abans de tocar res del guardat d'entrenaments, llegeix `SYNC.md`.** El
sistema és local-first: el que l'usuari fa es guarda al dispositiu abans que
res i el servidor s'assabenta després, amb revisions per entrenament perquè
cap resposta lenta s'empassi una edició posterior. Les invariants i els
tests que les subjecten són allà.

## Stack

- Angular 19, standalone components, signals + `computed()` + `effect()`
- Supabase for persistence; per-user data with RLS policies
- `localStorage` és el magatzem principal dels entrenaments, no una còpia:
  s'hi escriu primer i es puja després (vegeu `SYNC.md`). També és el
  fallback de `user_settings` perquè l'app funcioni abans de la migració
- **L'activitat es demana per trams, no per mesos**: una sola crida
  (`activity_feed`) porta entrenaments i esports d'un rang de dies amb el
  que necessita la targeta plegada i cap sèrie. Passa per
  `WorkoutService.ensureRange()`; les sèries es demanen en obrir la sessió
- **Cap consulta no baixa «tot»**: tota consulta va acotada per un tram, un
  exercici, un esport, una fila o un filtre. Agregar i filtrar és feina del
  servidor — vegeu `SYNC.md` §«Res no baixa tot»
- Material Symbols (outlined) via the global font, never `mat-icon`

## Conventions

- Catalan UI copy
- CSS in compact grouped lines (see `DESIGN.md` §10)
- **Dates are always local**: build `YYYY-MM-DD` with `todayStr()` /
  `toDateStr()` from `shared/utils/date.utils`, never
  `new Date().toISOString()` (that's the UTC day, so the app changes day
  hours late). For anything reactive to "today", read `TodayService.today()`
  — it ticks at the user's local midnight.
- Tests use `jasmine.clock().mockDate(...)` for date-dependent logic
- Develop on a feature branch, never push to `main` directly without a PR
