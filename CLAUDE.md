# GymGoli — Notes for Claude

## Escala, primer de tot

**Tota funcionalitat nova s'ha de sostenir amb vuit anys d'historial a
sobre.** No és una optimització per a més endavant: és el primer criteri de
disseny, per davant de la comoditat d'implementar-la. El que viatja i el que
es pinta no poden créixer amb la vida de l'usuari.

Abans de donar per feta qualsevol pantalla o consulta, respon-te això:

1. **Què demana, i acotat per què?** Un tram de dies, un exercici, un esport,
   una fila o un filtre. Si la resposta és «tot», encara no està feta —
   vegeu `SYNC.md` §«Res no baixa tot».
2. **Qui filtra i qui agrega?** El servidor, que té índexs. Filtrar al client
   només val per al que ja hi ha carregat i per una raó dita en veu alta; si
   el filtre ha de trobar coses velles, és una pregunta per al servidor.
3. **Com se'n demana més?** Tota llista que pugui créixer paginada, i amb la
   paginació **sempre a l'abast** — també quan el que es veu ara és buit: un
   estat buit sense manera de continuar és un cul-de-sac.
4. **Què es pinta?** Només el que es mira. Una pàgina que arrenca amb un mes
   de scroll a sota ja ha perdut: enllaça-hi (Inici → Historial) en comptes
   de duplicar-hi la llista.
5. **Quantes peticions fa un gest?** Una. Dotze mesos visibles són un tram,
   no dotze consultes.

I el manteniment va amb la mateixa etiqueta: **una sola manera de fer cada
cosa**. Un filtre es llegeix i es treu en un sol lloc, una consulta passa per
`ensureRange()`, una lectura d'activitat es fa amb `DayFeedEntry`. Si t'estàs
escrivint la segona variant d'alguna cosa que ja existeix, la feina és
ajuntar-les, no afegir-n'hi una.

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
- **Els filtres els contesta la mateixa crida**: nom d'exercici (`p_search`),
  tipus d'entrenament (`p_category`) i esport (`p_sport`), sobre tot
  l'historial i sense sèries. Un filtre no es contesta paginant una altra
  cosa: si la teva pregunta no hi cap, el que toca és una migració, no un
  bucle de mesos al client
- **El suggeriment d'Entrenament es tria en un sol lloc**: `pickSuggestion()`
  (`shared/utils/train-suggestion.util.ts`) decideix igual el gimnàs i
  l'esport, sobre el mateix `ActivityProfile`. El que fa temps que no fas el
  diu `activity_cadence` —una fila per activitat, migració 038—, mai més
  historial al dispositiu
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
- **L'objectiu setmanal és de cada setmana**: per a una setmana concreta es
  resol amb `goalForWeek()` (`core/models/weekly-goal.model.ts`), mai llegint
  `weeklyActivityGoal` i companyia, que són l'objectiu d'ara. Canviar-lo val
  des de la setmana en curs; les tancades conserven el seu
- Tests use `jasmine.clock().mockDate(...)` for date-dependent logic
- Develop on a feature branch, never push to `main` directly without a PR
