# GymGoli — Full de ruta cap a producció

Document de treball per atacar els punts detectats a l'anàlisi de l'estat de
l'app (juliol 2026). Cada punt té context, pla d'atac, fitxers afectats i
criteris d'acceptació. Marca la casella quan estigui **desplegat i verificat**,
no només implementat.

Llegenda: `[ ]` pendent · `[~]` en curs · `[x]` fet

**Estat verificat en el moment de l'anàlisi:** build de producció net
(721 KB inicials / ~174 KB transferits), 523 tests unitaris en verd,
RLS a totes les taules per-usuari.

---

## Resum d'estat

| # | Punt | Prioritat | Estat |
|---|------|-----------|-------|
| 1 | Migració `delete_my_account` inexistent | 🔴 P0 | `[~]` |
| 2 | "Avui" congelat a mitjanit | 🔴 P0 | `[x]` |
| 3 | Cap gestió de `SwUpdate` + chunk errors silenciats | 🔴 P0 | `[~]` |
| 4 | Errors de xarxa silenciats (buit ≠ error) | 🔴 P0 | `[x]` |
| 5 | Zero observabilitat en producció | 🔴 P0 | `[ ]` |
| 6 | Pla de còpies de seguretat | 🔴 P0 | `[ ]` |
| 7 | La rutina setmanal caduca en silenci (13 setmanes) | 🟠 P1 | `[ ]` |
| 8 | Delete de workout no encuat offline | 🟠 P1 | `[ ]` |
| 9 | `SyncService` sense tests | 🟠 P1 | `[ ]` |
| 10 | Exportació de dades (JSON/CSV) | 🟠 P1 | `[ ]` |
| 11 | Resum de fi d'entrenament | 🟠 P1 | `[ ]` |
| 12 | Settings encuats com els workouts | 🟠 P1 | `[ ]` |
| 13 | `shared_workouts`: TTL + límit de mida | 🟡 P2 | `[ ]` |
| 14 | Headers de seguretat a Vercel | 🟡 P2 | `[ ]` |
| 15 | Consulta per exercici no indexable | 🟡 P2 | `[ ]` |
| 16 | `bibis.png` 492 KB al camí crític | 🟡 P2 | `[ ]` |
| 17 | Fonts de Google: self-host + subset | 🟡 P2 | `[ ]` |
| 18 | Poda del cache de localStorage | 🟡 P2 | `[ ]` |
| 19 | Codi mort: `LibraryComponent` + `REUSE_ROUTES` | 🟢 Neteja | `[ ]` |
| 20 | ESLint al projecte i al CI | 🟢 Neteja | `[ ]` |
| 21 | Decisió: mode trainer darrere flag pel llançament | 🟢 Decisió | `[ ]` |
| 22 | Decisió: `ALLOWED_EMAILS` només client-side | 🟢 Decisió | `[ ]` |

---

## 🔴 P0 — Bloquejants

### 1. `[~]` Migració `delete_my_account`

> **Progrés (2026-07-20, branca `claude/app-state-analysis-x73qzl`):**
> escrita `supabase/migrations/023_delete_my_account.sql` (SECURITY DEFINER,
> REVOKE/GRANT a authenticated) i afegida a `schema_full.sql`. Verificat que
> **totes** les taules per-usuari ja tenen `ON DELETE CASCADE` (005, 007/015,
> 010, 014, 016; `shared_workouts` no referencia usuaris des de la 018).
> **Pendent:** aplicar-la a la BD viva (pot ja existir-hi una versió — el pas 1
> del pla) i fer el test manual complet amb un compte de prova.

**Context.** `AuthService.deleteAccount()` (`src/app/core/services/auth.service.ts:101`)
crida l'RPC `delete_my_account`, que no està definit a cap migració ni a
`schema_full.sql`. O existeix només a la BD viva (no versionat) o el botó
"Eliminar compte" de Configuració falla. És requisit legal (GDPR) i la
pàgina de privacitat ho promet.

**Pla d'atac.**
1. Comprovar a la BD viva si la funció existeix (`select proname from pg_proc where proname = 'delete_my_account'`).
2. Escriure `supabase/migrations/023_delete_my_account.sql`:
   - `CREATE OR REPLACE FUNCTION delete_my_account() ... SECURITY DEFINER`
   - Ha d'esborrar `auth.users` per `auth.uid()`; les FK amb
     `ON DELETE CASCADE` (migració 014) arrosseguen exercises, workouts,
     sports, sport_sessions. Revisar que **totes** les taules noves també
     cascadegen: `user_settings`, `user_profiles`, `trainer_clients`,
     `trainer_invites`, `trainer_proposals`, `templates`.
   - `REVOKE ALL ... FROM public; GRANT EXECUTE ... TO authenticated;`
3. Actualitzar `schema_full.sql` perquè el reflecteixi.
4. Test manual complet: compte de prova → dades a totes les taules →
   eliminar compte → verificar que no queda cap fila òrfena i la sessió es tanca.

**Fet quan:** la migració està aplicada, el flux sencer verificat amb un
compte de prova, i no queden files òrfenes a cap taula.

---

### 2. `[x]` "Avui" congelat a mitjanit — **fet 2026-07-20** (branca `claude/app-state-analysis-x73qzl`)

> **Com s'ha resolt:** nou `ClockService` amb `today` com a signal, refrescat
> amb `focus`, `visibilitychange` i un interval d'1 minut. `WorkoutService` i
> `SportService` ja no guarden `_todayStr`: tots els computeds (`todayWorkout`,
> `pastWorkouts`, `todaySessions`) llegeixen `clock.today()` i un `effect`
> refetcheja "avui" i el mes nou quan el dia canvia. `TrainComponent` segueix
> el canvi de dia si l'usuari era a "avui" (keep-alive) i `HomeComponent` té
> els computeds reactius al dia. Cobert amb `clock.service.spec.ts` (4 tests)
> i 2 tests de rollover a `workout.service.spec.ts` que simulen el canvi de
> dia i verifiquen que la creació d'entrenaments usa la data nova.

**Context.** `WorkoutService._todayStr` (`workout.service.ts:51`) i
`SportService._todayStr` (`sport.service.ts:60`) es calculen una sola vegada
en construir el servei. En una PWA que queda oberta en segon pla, l'endemà:
`todayWorkout()` apunta a ahir, `createTodayWorkout()` crea l'entrenament
**amb data d'ahir**, i el canal realtime segueix filtrant pel dia anterior.
`AppReuseStrategy` manté vius els components, així que només un reload
complet ho arregla.

**Pla d'atac.**
1. Crear un servei petit `DateService` (o `ClockService`) amb
   `readonly today = signal(todayStr())`.
2. Refrescar el signal a: `visibilitychange` (en tornar a primer pla),
   esdeveniment `focus`, i un `setInterval` de seguretat (p. ex. cada minut,
   només compara i actualitza si canvia).
3. Substituir `_todayStr` de `WorkoutService` i `SportService` per aquest
   signal; convertir els `computed` que en depenen (`todayWorkout`,
   `pastWorkouts`, `todaySessions`…).
4. En canviar el dia: re-subscriure el canal realtime de "today" i fer
   `_fetchToday` del dia nou.
5. Revisar components keep-alive (`train`, `home`) que capturen `TODAY()`
   en inicialitzar signals (`train.component.ts:1120` `selectedDate`).
6. Tests amb `jasmine.clock().mockDate(...)` (convenció del repo):
   simular canvi de dia i verificar que `todayWorkout` i la creació
   d'entrenaments usen la data nova.

**Fet quan:** amb l'app oberta, en passar la mitjanit (o simulant-ho),
crear un entrenament el desa amb la data correcta i home/train mostren el dia nou.

---

### 3. `[~]` Gestió d'actualitzacions del service worker

> **Progrés (2026-07-20, branca `claude/app-state-analysis-x73qzl`):** nou
> `UpdateService` (SwUpdate opcional — inactiu en dev/tests): comprovació
> d'actualitzacions cada 30 min i en tornar a primer pla; en `VERSION_READY`,
> snackbar "Hi ha una versió nova disponible — Actualitza" a `AppComponent`
> que activa i recarrega; en `VERSION_INSTALLATION_FAILED`, recàrrega amb
> guard d'1 minut contra bucles. `AppErrorHandler` ara recarrega de veritat
> (amb el mateix guard) en `ChunkLoadError` en lloc de silenciar-lo.
> **Pendent:** verificar amb un desplegament real que un client obert rep la
> versió nova (criteri d'acceptació).

**Context.** No hi ha cap ús de `SwUpdate`. Els usuaris poden quedar-se en
versions velles indefinidament. A més, `AppErrorHandler`
(`app-error-handler.service.ts:15`) silencia els `ChunkLoadError` amb un
comentari que promet una recàrrega automàtica que ningú no fa: pàgina morta
sense feedback.

**Pla d'atac.**
1. A `AppComponent` (o un `UpdateService`): injectar `SwUpdate`,
   subscriure's a `versionUpdates`.
2. En `VERSION_READY`: estratègia per una app d'ús curt i freqüent →
   `activateUpdate()` + recàrrega silenciosa si l'usuari està en un moment
   segur (no editant sèries), o snackbar "Nova versió disponible — Actualitza"
   (Material snackbar, permès per CLAUDE.md).
3. `checkForUpdate()` periòdic (cada 30–60 min) i en `visibilitychange`.
4. En `VERSION_INSTALLATION_FAILED` o `ChunkLoadError` real: fer
   `location.reload()` (una sola vegada, amb guard en sessionStorage per
   evitar bucles de recàrrega).
5. Corregir el comentari fals de `AppErrorHandler`.

**Fet quan:** desplegant una versió nova, un client obert la rep sense
intervenció manual (o amb un tap al snackbar), i un chunk error força
una única recàrrega neta.

---

### 4. `[x]` Errors de xarxa silenciats — distingir buit d'error — **fet 2026-07-20** (branca `claude/app-state-analysis-x73qzl`)

> **Com s'ha resolt:** `loadError` signal a `WorkoutService`, `SportService`
> i `ExerciseService`; els mesos fallits es recorden (`_failedMonths`) perquè
> `ensureMonthLoaded()` els reintenti de veritat. Corregits tres bugs reals
> que l'inventari va destapar: un refetch fallit d'avui o d'un mes
> **esborrava el cache amb "buit"** (workouts i sport_sessions), un error a
> `loadAllWorkouts()` congelava un historial buit com a "tot carregat", i un
> error carregant esports **re-seedejava els esports per defecte**. Nou
> component compartit `app-load-error` (icona + "Torna-ho a provar") mostrat
> a l'historial de home, a la llista del calendari i a la pàgina d'exercicis
> quan hi ha error i cap dada — mai més un error llegit com a "no tens
> dades". El local-first es manté: si hi ha cache, es serveix igualment.
> Cobert amb 2 tests nous d'error/retry a `workout.service.spec.ts`.

**Context.** Patró repetit: `const { data } = await this.supabase...` sense
mirar `error` (`_fetchToday`, `ensureMonthLoaded`, `loadAllWorkouts`,
`trainer.service`, `exercise.service._fetch`…). Un error de RLS/token/500 es
mostra com "no tens dades". Per una app-registre, això destrueix la confiança.

**Pla d'atac.**
1. Inventariar tots els punts on s'ignora `error` (grep de
   `const { data } = await` i `catch { /*`).
2. Afegir un senyal d'error per domini de lectura principal:
   `WorkoutService.loadError`, `SportService.loadError` (o un `LoadState`
   compartit: `'loading' | 'ok' | 'error'`).
3. UI: als llocs on ara es mostra empty-state (historial de home, calendar,
   exercises, charts), si `loadError` → estat d'error amb botó "Torna-ho a
   provar" en lloc de "Encara no hi ha res" (seguint patrons d'empty state
   de DESIGN.md).
4. Mantenir el comportament local-first: si hi ha cache de localStorage,
   servir cache + indicador discret d'error de refresc (no bloquejar).
5. No tocar les escriptures aquí (ja van pel SyncService o pel punt 12).

**Fet quan:** matant la connexió a Supabase (o forçant un 401), l'app
mostra estats d'error amb retry i mai un fals "no hi ha dades".

---

### 5. `[ ]` Observabilitat en producció

**Context.** `AppErrorHandler` només fa `console.error` en dev i un toast
genèric. En producció no hi ha manera de saber què falla ni a qui.

**Pla d'atac.**
1. Triar eina: Sentry free tier (recomanat) o endpoint propi mínim.
2. Integrar només en `environment.production`: captura des de
   `AppErrorHandler.handleError` + errors no capturats/`unhandledrejection`.
3. Adjuntar context útil: versió de l'app (injectar el hash de build o
   versió de `package.json` via `set-env.js`), ruta actual, estat
   online/offline, uid (no email).
4. Filtrar soroll conegut (chunk errors ja gestionats al punt 3,
   errors d'extensions).
5. Afegir la DSN com a variable d'entorn a Vercel i a `scripts/set-env.js`.

**Fet quan:** un error llançat expressament en producció apareix al
dashboard amb versió i ruta.

---

### 6. `[ ]` Còpies de seguretat de la BD

**Context.** Si el projecte Supabase és free tier, no hi ha PITR. Les dades
són l'historial d'entrenaments dels usuaris: pèrdua = pèrdua total de valor.

**Pla d'atac.**
1. GitHub Action programada (setmanal, cron) que faci `pg_dump` amb la
   connection string de Supabase (secret del repo) i pugi el dump xifrat a
   un bucket privat (Supabase Storage d'un altre projecte, S3, o release
   artifact privat).
2. Retenció: últimes 8 setmanes.
3. Documentar el procediment de restauració al README (provat una vegada).

**Fet quan:** existeix com a mínim un backup automàtic verificat
restaurant-lo en un projecte de prova.

---

## 🟠 P1 — Fluxos i robustesa

### 7. `[ ]` Re-materialització automàtica de la rutina setmanal

**Context.** `WEEKS_RECURRING = 13` (`weekly-plan.service.ts:15`): la rutina
es materialitza ~3 mesos **només quan es desa al planner**. Després s'acaba
en silenci i l'usuari percep que l'app s'ha espatllat. És el forat de flux
més seriós detectat.

**Pla d'atac.**
1. Guardar a `user_settings` la data fins on s'ha materialitzat la rutina
   (`routineMaterializedUntil`).
2. En arrencar l'app amb sessió (p. ex. des d'`AppComponent` o un
   inicialitzador lleuger): si hi ha rutina desada i
   `routineMaterializedUntil < avui + 4 setmanes`, cridar
   `weeklyPlanService.apply(rutina, setmanesQueFalten, …, 'routine')`.
   `apply()` ja és idempotent (comprova `already`), així que és segur.
3. Vigilar el cost: `apply` fa `ensureMonthLoaded` dels mesos afectats —
   executar-ho després del primer render (p. ex. `afterNextRender` o un
   `setTimeout`), mai bloquejant l'arrencada.
4. Tests: rutina desada + horitzó esgotat → es creen els planned nous;
   rutina esborrada → no es crea res; no duplica els existents.

**Fet quan:** amb una rutina activa i `routineMaterializedUntil` vençut,
obrir l'app repobla les setmanes següents sense passar pel planner.

---

### 8. `[ ]` Delete de workout encuat offline

**Context.** `deleteWorkout()` (`workout.service.ts:621`) és l'única mutació
de workout que va directa a Supabase: offline llença error i trenca la
promesa local-first del flux de train.

**Pla d'atac.**
1. Afegir al `SyncService` una cua de deletes pendents
   (`gymgoli_sync_deletes_<uid>`), simètrica a la d'inserts.
2. `deleteWorkout`: treure del cache local sempre; si el workout era un
   insert pendent, cancel·lar i prou (ja es fa); si no, marcar delete
   pendent i deixar que `flush()` l'executi amb el mateix backoff.
3. Conflictes: si un id té delete pendent, ignorar snapshots dirty seus al
   flush i als merges de `_fetchToday`/`ensureMonthLoaded` (que un refetch
   no "ressusciti" un workout esborrat offline).
4. Tests dins del spec nou del punt 9.

**Fet quan:** esborrar un entrenament en mode avió, tancar l'app, recuperar
connexió → l'entrenament desapareix també del servidor i no reapareix mai a la UI.

---

### 9. `[ ]` Tests del `SyncService`

**Context.** És el codi amb més risc de pèrdua de dades de l'app (backoff,
inserts vs updates, snapshots, hydration) i l'únic servei nucli **sense spec**.

**Pla d'atac.** Crear `sync.service.spec.ts` amb Supabase mockejat cobrint:
1. `markDirty` → snapshot + dirty ids a localStorage, debounce de flush.
2. `flush` feliç: upsert per inserts, update per edicions, `markClean`.
3. `flush` amb error: backoff progressiu (5s/10s/30s/60s), estat `error`,
   reintents en `online`/`visibilitychange`.
4. Hydration en login: pending count restaurat, flush si hi ha connexió.
5. `cancelDirty` d'un insert mai enviat.
6. (Amb el punt 8) cua de deletes.
7. Multi-usuari: les claus són per uid; logout no barreja cues.

**Fet quan:** el spec cobreix els 6–7 escenaris i passa al CI.

---

### 10. `[ ]` Exportació de dades

**Context.** No hi ha cap manera de treure les dades. Per una app-registre
personal és clau de confiança i cobreix portabilitat GDPR. Barat:
`loadAllWorkouts()` ja existeix.

**Pla d'atac.**
1. A `settings/advanced`: secció "Les meves dades" amb botó
   "Exporta les dades (JSON)".
2. Recollir workouts (tots), sport sessions, exercises, sports, templates i
   settings → un JSON amb metadata (versió, data d'export).
3. Descarregar com a fitxer (`Blob` + `a[download]`), nom
   `gymgoli-export-YYYY-MM-DD.json`.
4. Opcional (segona iteració): CSV pla de sèries per anàlisi en fulls de càlcul.
5. Estat de càrrega + gestió d'error (toast) durant la descàrrega de tot l'historial.

**Fet quan:** un compte amb historial descarrega un JSON complet i vàlid.

---

### 11. `[ ]` Resum de fi d'entrenament

**Context.** L'entrenament neix `status: 'done'`: no hi ha moment de
tancament ni recompensa (resum, PRs). El 80% de la lògica ja existeix
(`getAllTimeMaxWeight`, feeling agregat automàtic, `workoutVolumeFmt`).
Única millora de producte proposada; tota la resta és robustesa.

**Pla d'atac.**
1. Sense tocar el model de dades (mantenim `done` des de la creació, res
   de nou estat "in progress" — fora d'scope).
2. Botó/acció "Acaba l'entrenament" al final del workout actiu de train
   (visible quan hi ha ≥1 sèrie).
3. Obre un dialog/bottom-sheet de resum: durada aproximada (createdAt →
   ara), nº exercicis i sèries, volum total, PRs de la sessió (pes màxim
   per exercici vs `getAllTimeMaxWeight(exId, workoutId)`), selector de
   feeling del workout si encara no en té.
4. En tancar, tornar al tauler de train. Cap canvi a Supabase.
5. Estil segons DESIGN.md (section cards, accent per categoria).

**Fet quan:** acabar una sessió mostra el resum amb PRs correctes i
desa el feeling triat.

---

### 12. `[ ]` Escriptures de settings amb reintents

**Context.** `UserSettingsService.update()` (`user-settings.service.ts:105`)
fa l'upsert dins `try/catch` buit: si falla, el canvi només viu al
localStorage d'aquell dispositiu i es perd en canviar de dispositiu.

**Pla d'atac.**
1. Opció mínima (recomanada): flag `settingsDirty_<uid>` a localStorage
   quan l'upsert falla; reintent en `online`/`visibilitychange`/arrencada
   (mateix patró que SyncService, sense necessitat de cua — settings és
   un sol document, last-write-wins és correcte aquí).
2. Vigilar el merge en `_load`: si hi ha dirty local pendent, el local ha
   de guanyar sobre el servidor fins que s'hagi pujat.
3. Tests: fallada d'upsert → reintent en recuperar connexió → servidor
   actualitzat; refresc amb dirty pendent no trepitja el canvi local.

**Fet quan:** canviar un ajust offline i recuperar connexió el puja sol,
i un reload no el perd.

---

## 🟡 P2 — Seguretat i rendiment

### 13. `[ ]` `shared_workouts`: caducitat i límits

**Context.** Migració 018: qualsevol usuari autenticat pot crear files
il·limitades i llegir-les totes. Sense TTL creix per sempre; sense límit de
mida és un vector d'abús.

**Pla d'atac.**
1. Migració: columna `expires_at timestamptz not null default now() + interval '30 days'`.
2. Política SELECT: afegir `AND expires_at > now()`.
3. CHECK de mida: `pg_column_size(entries) < 32768` (o límit raonable) i
   `char_length(name) <= 120`.
4. Neteja: `pg_cron` a Supabase (o la GitHub Action del punt 6) que esborri
   files caducades setmanalment.
5. UI de `share-import`: missatge amable quan l'enllaç ha caducat.

**Fet quan:** un share caducat retorna "enllaç caducat" i la taula té neteja automàtica.

---

### 14. `[ ]` Headers de seguretat a Vercel

**Context.** `vercel.json` no té `headers`.

**Pla d'atac.** Afegir a `vercel.json`:
- `Content-Security-Policy` — cal inventariar orígens: `self`,
  `https://*.supabase.co` (REST + realtime websocket `wss:`),
  `fonts.googleapis.com`/`fonts.gstatic.com` (fins al punt 17),
  Vercel Analytics (`/_vercel/insights`, `/_vercel/speed-insights` són
  same-origin). Compte amb `style-src 'unsafe-inline'` (Angular inline styles).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY` (o `frame-ancestors 'none'` a la CSP),
  `Permissions-Policy` mínima.
- Desplegar a preview primer i validar que login OAuth, realtime i fonts
  funcionen abans de promocionar.

**Fet quan:** els headers surten a producció i cap flux (OAuth, realtime,
fonts, analytics) es trenca.

---

### 15. `[ ]` Consulta per exercici indexable

**Context.** `_fetchForExercise` (`workout.service.ts:240`) filtra amb
`entries::text ILIKE '%"exerciseId":"…"%'`: full scan no indexable que es
degradarà amb l'historial. La migració 020 ja va resoldre el mateix problema
per a noms amb una columna generada.

**Pla d'atac.**
1. Migració: columna generada `exercise_ids text[] generated always as (...) stored`
   (extreure els `exerciseId` del JSON amb una funció IMMUTABLE, mateix
   patró que `workout_exercise_names`) + índex GIN.
2. Canviar la query del client a `.contains('exercise_ids', [exerciseId])`.
3. Verificar amb `explain` que usa l'índex.

**Fet quan:** la query per exercici usa l'índex i les gràfiques carreguen
igual de ràpid amb historial gran.

---

### 16. `[ ]` Optimitzar `bibis.png`

**Context.** 492 KB, usat al loader inicial (camí crític del primer paint),
favicon, apple-touch-icon i OG image.

**Pla d'atac.**
1. Generar mides: 192×192 i 512×512 PNG optimitzats (icona + manifest),
   ~180×180 per apple-touch-icon, 1200×630 (o quadrada petita) per OG.
2. Substituir referències a `index.html`, `manifest.webmanifest` i el loader.
3. Objectiu: el loader carrega < 30 KB d'imatge.

**Fet quan:** Lighthouse no llista la imatge com a oportunitat i el loader
pinta més ràpid en 3G simulat.

---

### 17. `[ ]` Fonts: self-host + subset

**Context.** Roboto i Material Symbols des de Google Fonts al `<head>`;
Material Symbols amb `display=block` → icones invisibles fins que baixa la
font variable (~300 KB) la primera visita; dependència externa per l'offline
primer arranc.

**Pla d'atac.**
1. Self-host amb subset: Material Symbols només amb els glifs usats
   (grep dels noms d'icona al codi → subset amb `glyphhanger` o el
   paràmetre `icon_names` de l'API de Google) i Roboto latin.
2. Servir des de `/assets/fonts` amb `font-display: block` per les icones
   (evita FOUC de ligatures) i `swap` per Roboto.
3. Treure els `<link>` externs i el dataGroup `google-fonts` de
   `ngsw-config.json` (les fonts passen a l'assetGroup normal).
4. Simplifica també la CSP del punt 14.

**Fet quan:** cap petició a `fonts.g*` i les icones es veuen al primer
render offline després d'una sola visita.

---

### 18. `[ ]` Poda del cache de localStorage

**Context.** `gymgoli_month_<uid>_<mes>` creix un entry per mes visitat per
sempre; risc de quota (els writes ja fallen silenciosament, però perdríem
el local-first).

**Pla d'atac.**
1. En arrencar (o en escriure un mes nou): llistar claus `gymgoli_month_<uid>_*`
   i conservar només els últims N mesos (p. ex. 6) + mesos amb dirty pendent.
2. El mateix per `gymgoli_sync_snap_*` orfes (sense entrada a la cua dirty).
3. Test unitari de la funció de poda.

**Fet quan:** després de navegar per molts mesos, localStorage es manté acotat.

---

## 🟢 Neteja i decisions

### 19. `[ ]` Codi mort i `REUSE_ROUTES` desactualitzat

**Context.** `LibraryComponent` (597 línies + spec) no és referenciat per cap
ruta (la ruta `library` redirigeix a `exercises`); els dialogs de
`library/components` sí que s'usen. `REUSE_ROUTES`
(`route-reuse.strategy.ts:4`) conté `'library'` (ja no és pàgina) i no
`'exercises'` (ha perdut el keep-alive).

**Pla d'atac.**
1. Esborrar `library.component.ts` + `library.component.spec.ts`.
2. Moure `exercise-form-dialog` i `sport-form-dialog` a `shared/components`
   (o deixar-los a `features/library/components` i renombrar la carpeta —
   decidir en fer-ho).
3. `REUSE_ROUTES`: treure `'library'`, afegir `'exercises'`.
4. Verificar que exercises conserva estat (scroll/filtres) en navegar
   endavant i enrere.

**Fet quan:** build i tests verds sense el component, i exercises manté
l'estat en navegar.

---

### 20. `[ ]` ESLint

**Context.** No hi ha linter; el CI fa typecheck + tests + build. Un lint
amb regles d'Angular hauria atrapat part del punt 4.

**Pla d'atac.**
1. `ng add angular-eslint` (flat config).
2. Regles a considerar: `@typescript-eslint/no-floating-promises`,
   `no-unused-vars`, regles de template d'`angular-eslint`.
3. Arreglar el que surti (o `--fix` + baseline raonable).
4. Afegir pas `npx ng lint` a `.github/workflows/ci.yml`.

**Fet quan:** `ng lint` net i executant-se al CI.

---

### 21. `[ ]` Decisió: mode trainer al llançament

**Context.** És la superfície més gran i menys madura (985 línies de
component + RLS complexa + invites + propostes). Per un MVP de registre
personal, és risc afegit el dia 1.

**Opcions.**
- **A (recomanada):** flag `trainerEnabled` (variable d'entorn →
  `environment.ts`) que amaga l'entrada a settings i la ruta; el codi es
  queda, les RLS es queden. Es reactiva quan s'hagi testejat a fons.
- **B:** llançar-lo tal qual i assumir el risc (llavors: afegir specs de
  `TrainerService` abans).

**Fet quan:** decisió presa i aplicada (flag implementat o specs escrits).

---

### 22. `[ ]` Decisió: `ALLOWED_EMAILS`

**Context.** El filtre és només client-side (`auth.guard.ts`): amb l'anon
key qualsevol autenticat pot escriure les seves pròpies files via API
encara que no sigui a la llista. RLS protegeix les dades dels altres.

**Opcions.**
- **A:** acceptar-ho com a cosmètic i documentar-ho al README (si l'app és
  oberta a tothom, `ALLOWED_EMAILS` buit, això és irrellevant).
- **B:** replicar la llista com a política a Supabase (hook de
  `before user created` / política RLS sobre `auth.jwt() ->> 'email'`)
  si es vol accés realment tancat.

**Fet quan:** decisió presa i, si és B, aplicada i provada amb un email
fora de la llista.

---

## Ordre d'atac suggerit

1. **Tanda 1 (fiabilitat):** 1 → 2 → 3 → 5 → 4 → 6
2. **Tanda 2 (fluxos):** 7 → 8+9 (junts) → 12 → 10 → 11
3. **Tanda 3 (pre-llançament):** 13 → 14 → 16 → 15 → 19 → 18 → 17 → 20 → 21 → 22

Regles del document:
- En començar un punt: marca'l `[~]` i anota-hi la branca/PR.
- En acabar-lo: `[x]` + data + enllaç al PR.
- Si un punt es descarta o canvia d'abast, no s'esborra: s'anota la decisió.
