# Sincronització — primer el dispositiu, després el servidor

Com es guarden els entrenaments a GymGoli, i per què d'aquesta manera.

**La regla, en una frase: el que l'usuari fa es guarda al dispositiu abans
que res, i el servidor s'assabenta després.** Registrar una sèrie no espera
cap resposta, no depèn de la cobertura i no pot fallar. Si toques aquesta
part del codi i trenques això, s'ha trencat el sistema.

---

## 1. Les tres peces

| Peça | Fitxer | De què respon |
| --- | --- | --- |
| **Magatzem** | `core/services/workout-store.service.ts` | El que aquest dispositiu sap. Escriu i llegeix `localStorage`. No parla mai amb la xarxa. |
| **Sincronització** | `core/services/sync.service.ts` | Puja al servidor el que el magatzem té pendent, i ho reintenta fins que hi arriba. |
| **Domini** | `core/services/workout.service.ts` | La lògica d'entrenaments i els senyals que consumeix la interfície. Escriu al magatzem i avisa la sincronització. També decideix què es demana al servidor i quan (§4). |

El camí d'una sèrie és sempre el mateix:

```
usuari → WorkoutService → WorkoutStoreService (localStorage)  ← ja no es pot perdre
                                    ↓
                              SyncService → Supabase
```

---

## 2. Revisions: qui mana i quan

Cada entrenament del magatzem porta dos números:

- **`rev`** — puja a cada canvi fet en aquest dispositiu.
- **`syncedRev`** — l'últim que el servidor ha confirmat.

`rev > syncedRev` vol dir «encara no ha pujat», i és **l'única definició de
pendent que hi ha a l'app**. No hi ha cap llista paral·lela que se'n pugui
desaparellar.

D'aquí surten les dues regles que ho aguanten tot:

**a) Un ack només tanca la revisió que s'ha enviat.**

```
s'envia la revisió 3  →  mentrestant l'usuari registra una sèrie (revisió 4)
                      →  arriba l'ack de la 3
                      →  rev (4) > la que s'ha confirmat (3): continua pendent
```

Sense això, la resposta d'una petició lenta donava per pujada una sessió que
havia crescut mentrestant, i la sèrie no arribava mai enlloc. És el que feia
que a la base de dades hi haguessin entrenaments amb les entrades buides.

**b) El que espera pujar no el trepitja ningú.** Ni el realtime, ni una
consulta d'un mes, ni un refresc en tornar a l'app. La versió del servidor
només mana quan aquí ja està tot pujat.

---

## 3. Conflictes entre dispositius

El mòbil edita l'entrenament sense cobertura al gimnàs mentre la tauleta hi
afegeix sèries a casa. Els dos tenen raó, i quedar-se'n un i llençar l'altre
vol dir perdre entrenament fet de veritat.

Les edicions van al servidor **amb guarda**: només substitueixen la fila si
la que hi ha és més antiga que la nostra
(`.lt('updated_at', la nostra)`). Si no en canvia cap:

- la fila ja no hi és → `missing` (esborrada des d'un altre dispositiu);
- la fila hi és i és més nova → **conflicte**, i es fusionen les dues.

`mergeWorkouts()` no perd cap sèrie:

- **Exercicis**: la unió dels dos costats. Si tots dos porten el mateix
  exercici, es queda el que té més sèries — ningú entrena per treure-se'n.
- **La resta** (notes, sensació, categories, estat): mana la versió
  modificada més tard.
- **La marca de temps** del resultat queda per davant de totes dues, no
  només de l'hora d'aquest dispositiu: amb el rellotge endarrerit respecte
  de l'altre, la pujada tornaria a topar amb la mateixa versió i el
  conflicte no s'acabaria mai.

El resultat queda pendent i torna a sortir a la propera tanda, ja amb el que
hi havia als dos costats.

---

## 4. Fusionar el que arriba del servidor

Dos camins, i és important no confondre'ls:

- **`applyServerRow(w)`** — una fila solta (realtime, consulta per exercici).
  Només incorpora; no dedueix res del que hi falta.
- **`mergeServerScope(rows, scope, since)`** — una resposta que cobreix un
  abast sencer (un mes, tot l'historial). Com que és completa, el que hi
  falta **i aquí consta com a pujat** s'ha esborrat des d'un altre
  dispositiu i ha de marxar.

`since` és el `store.mark()` pres **just abans de llançar la consulta**. El
que es confirmi mentre viatja no pot sortir a la resposta, i aquesta marca
és el que evita esborrar-ho. És un comptador i no un rellotge perquè dues
coses del mateix mil·lisegon s'han de poder distingir igualment.

El cas que demanava l'usuari — «hi ha dades al núvol i no en local» — surt
sol d'aquí: una fila que el magatzem no coneix s'adopta tal qual.

---

### Carregat en dos temps

El que es demana al servidor va per necessitat, no per costum:

| Què es demana | Quan | Què porta |
| --- | --- | --- |
| La finestra recent (`_pullChanges`) | En arrencar i en tornar a l'app | Les sessions senceres dels últims mesos |
| L'historial vell (`loadHistorySummaries`) | En arrencar | Dia, tipus, sensació i noms d'exercicis. **Cap sèrie** |
| Un mes (`ensureMonthLoaded`) | En obrir-lo al calendari | Aquell mes sencer |
| Un exercici (`loadWorkoutsForExercise`) | En obrir-ne el progrés | Totes les sessions on surt |
| Una sessió (`ensureWorkoutEntries`) | En desplegar-ne el detall | Les seves sèries |
| Tot (`loadAllWorkouts`) | Progrés, i buscar al calendari | L'historial sencer, amb indicador de càrrega |

Abans l'arrencada demanava `select('*')` de tota la vida de l'usuari —centenars
de sessions amb totes les sèries— per acabar fent servir la data i el tipus:
quant fa que no toques empenta, quantes setmanes seguides has entrenat.

Els resums **no entren al magatzem**, i això no és un detall. El magatzem és la
còpia bona del dispositiu i tot el que hi entra és candidat a pujar-se: una
sessió sense sèries que hi entrés podria acabar buidant al servidor
l'entrenament de debò. Viuen a part, a `WorkoutService._summaries`, i
`workouts()` els posa **per sota** del magatzem — un resum només es veu si
d'aquella sessió no en tenim res de millor. `applyServerRow()` també els rebutja
explícitament, per si algun camí nou ho intentés.

Una targeta pintada amb un resum no ensenya zeros: diu que cal obrir-la. En
obrir-la es demanen les sèries amb l'indicador de càrrega, la sessió entra al
magatzem i a partir d'aquí ja s'edita com qualsevol altra.

La finestra recent queda fora dels resums a posta: és on miren les targetes
d'Inici i les xifres que compten sèries i volum, i una targeta que primer surt
sense xifres i després amb elles és pampallugueig.

### Una resposta, una escriptura

`store.batch()` agrupa una fusió sencera: **una escriptura per mes tocat i un
sol avís als senyals**. Cada entrenament que s'incorporava tocava el disc i
avisava pel seu compte, i una resposta de dos-cents entrenaments volien dir
dos-cents `JSON.stringify` del mes sencer, dos-cents `localStorage.setItem`
—que són síncrons i bloquegen la pàgina— i dues-centes recomposicions de tota
la interfície: la pantalla es repintava una vegada per fila que arribava. El
diari (§8) fa el mateix, ajornant la desada al final de la tanda.

Fora d'aquí no canvia res: registrar una sèrie continua guardant-se a
l'instant, que és la regla que aguanta tot el sistema.

### Una consulta de cada, no quatre

Les consultes senceres porten guarda de petició en marxa (`_fullLoad`,
`_pullLoad`, `_summaryLoad`, `_allLoad` als esports): qui en demani una mentre
viatja s'hi enganxa en comptes de llançar-ne una altra.

Sense això, un `effect()` que llegia la llista d'entrenaments per tornar a
carregar després d'entrar es redisparava a cada fila que arribava, i com que la
guarda de «ja està carregat» no es tanca fins al final, l'app arrencava baixant
l'historial sencer tres o quatre vegades a la vegada. Els efectes que han de
reaccionar a entrar-hi miren `auth.uid()`, no les dades.

Pel mateix motiu, refrescar els esports ja no tomba `allSessionsLoaded`: qui en
depèn (els rècords del detall d'una sessió) es tornava a pintar a mitges cada
cop que l'app recuperava el focus.

### Pull incremental

`refreshLoaded()` demana primer **només el que ha canviat** des de l'últim
cop (`updated_at >= lastPulledAt`). És una consulta petita i porta de seguida
el que s'ha registrat des d'un altre dispositiu.

**El marcador surt de les files, no del rellotge d'aquest dispositiu.**
`updated_at` l'escriu qui fa el canvi, o sigui que la taula barreja les hores
de tots els dispositius de l'usuari. Posant el marcador a «ara segons aquest»,
un mòbil amb el rellotge dos minuts endarrerit escrivia files amb una hora ja
passada: quedaven per sota del marcador per sempre i la consulta de canvis no
les veia mai més. El marcador és l'`updated_at` **més alt que ha arribat de
debò en una resposta**, i així viu al mateix rellotge que les dades que
compara. Es demana amb `>=` i no `>` per no perdre els empats a la frontera
d'un tram; tornar a aplicar una fila que ja hi era no costa res.

Aquesta consulta no pot veure el que ha **desaparegut**: una fila esborrada
ja no surt enlloc, i la taula no té cap marca de baixa. Per això la
comprovació sencera (mes a mes, o tot l'historial) es continua fent, però
espaiada — cada 5 minuts, no a cada canvi de pestanya.

---

## 4b. Consultes d'abast obert: sempre per trams

PostgREST talla la resposta a un màxim de files (1.000 per defecte a Supabase)
i **no ho diu enlloc**: arriba un 200 amb menys dades de les que hi ha. Aquí
això no és ensenyar l'historial a mitges — `mergeServerScope()` dedueix dels
forats que la resta s'ha esborrat des d'un altre dispositiu, i les treu del
magatzem. Un usuari amb prou història es quedava sense la seva pròpia còpia.

Per això tota consulta d'abast obert (tot l'historial, totes les sessions d'un
exercici, la consulta de canvis) passa per `fetchAllRows()`
(`supabase-page.util.ts`), que demana trams fins que un torna incomplet. Dues
regles que van juntes:

- **Ordre total i estable** (`date` + `created_at` + `id`, mai només la data):
  si dues files empaten, PostgreSQL les pot resoldre diferent a cada tram i
  n'hi ha que no surten a cap pàgina.
- **`complete: false` no és una resposta.** Si un tram ha fallat, el que s'ha
  recollit és un tros i no s'hi pot deduir cap esborrat: es manté el que hi
  havia.

Un mes és l'excepció: no hi cap prou entrenament per topar amb el topall, i
s'estalvia la petició de comprovació.

### Els esports també

`WorkoutProfileService` demana tot l'historial d'esports en entrar —li cal per
dir «fa X dies que no corres»— i des d'aquell moment `refreshLoaded()` el
tornava a baixar **sencer** cada cop que l'app recuperava el focus: cada canvi
de pestanya, anys de sessions, per assabentar-se de si n'hi havia una de nova.

Ara segueix la mateixa forma que els entrenaments: consulta de canvis a cada
tornada, comprovació sencera cada 5 minuts. La marca la posa un **disparador
del servidor** (migració 030) i no el client, al revés que a `workouts`: aquí
no hi ha cap guarda de concurrència que depengui que la marca sigui la del
dispositiu, i posant-la el servidor no hi ha manera que un client se la deixi.

El primer refresc de cada sessió no demana cap delta: encara no hi ha marcador,
i qui porta les dades és la comprovació sencera que ve tot seguit. Només mira
per on va el rellotge del servidor, que és una fila.

Mentre la migració 030 no s'executi, el servidor contesta `42703` («la columna
no hi és»), el client se'n desdiu sol i continua amb la comprovació sencera de
sempre.

## 4c. Què es demana, i què no

Les consultes d'entrenaments porten una llista de columnes (`WORKOUT_COLUMNS`),
no `select('*')`. La columna generada `exercise_names` repeteix en text pla els
noms que ja venen dins d'`entries`: existeix perquè el servidor hi pugui cercar
(migració 020), i `toWorkout()` ni la mira. En la consulta de tot l'historial
—la que fan el progrés i el calendari— són desenes de kilobytes de xarxa i de
memòria per no res. `user_id` tampoc cal: és el filtre de la consulta.

Les sessions d'esport igual (`SPORT_SESSION_COLUMNS`), que a més s'enduien
`duration_minutes`, la columna que `duration` va substituir fa migracions.

## 4d. Índexs que sostenen aquestes consultes

| Consulta | Índex |
| --- | --- |
| Canvis des de l'últim cop | `workouts (user_id, updated_at desc)` |
| Sessions d'un exercici (`entries @> [{"exerciseId": …}]`) | `workouts` GIN `(entries jsonb_path_ops)` |
| Historial per mes i paginat | `workouts (user_id, date desc)` |
| Cerca per nom d'exercici | `workouts` GIN trigram `(exercise_names)` |
| Canvis de les sessions d'esport | `sport_sessions (user_id, updated_at desc)` |

Els dos primers són de la migració 029; l'últim, de la 030. La segona consulta abans anava amb
`entries::text ilike '%"exerciseId":"…"%'`: convertir tot el blob a text obliga
a llegir i convertir **cada** entrenament de l'usuari a cada consulta, i no hi
ha índex que hi pugui ajudar. És la mateixa trampa que la migració 020 va
treure de la cerca de l'historial.

## 4e. El que es processa al dispositiu

`workouts()` és tot l'historial carregat, i preguntar-li coses recorrent-lo
sencer surt car allà on més mal fa: mentre entrenes. El marcador de rècord
(`getAllTimeMaxWeight`) i el plafó de l'última sessió (`getLastSessionEntry`)
són `computed()` que passen per **cada exercici del dia** i es refan **a cada
sèrie que registres** — desenes de milers de comparacions per cada toc.

`WorkoutService._byExercise` és el calaix per exercici, refet un cop per canvi
igual que `byDate`, i ja ordenat de la sessió més recent a la més antiga
(l'hereta de `store.workouts`). Amb això, «què vaig fer l'última vegada» és
mirar el primer element del calaix, no filtrar i ordenar l'historial sencer.

Si hi afegeixes consultes per exercici, fes-les passar pel calaix.

## 5. Esborrats

`deleteWorkout()` no truca al servidor. Treu la sessió del dispositiu i, si
el servidor l'havia arribat a veure, deixa una **làpida**
(`gymgoli_deleted_<uid>`). La làpida fa dues coses:

1. L'esborrat viatja per la mateixa cua que la resta, així que sense
   cobertura no falla.
2. Mentre existeixi, aquell id es filtra de qualsevol resposta del servidor
   — si no, la següent consulta ressuscitaria el que acabes d'esborrar.

---

## 6. Quant es guarda al dispositiu

El local **no** és una còpia de tot l'historial. Es guarden els mesos de la
finestra que l'app fa servir sense connexió (`RETAINED_MONTHS`, ara 3, que
cobreix de sobres els 30 dies d'Inici), més **qualsevol cosa que encara no
hagi pujat, tingui l'edat que tingui**. La resta viu a la base de dades i es
torna a demanar quan es necessita.

`store.prune()` s'executa quan la cua es queda buida, i **només toca mesos
que s'han comprovat contra una resposta sencera del servidor en aquesta
sessió** (`markReconciled()`). Suposar que un mes vell «ja hi és» i
alliberar-lo és la manera més fàcil d'esborrar l'única còpia bona que
quedava d'un entrenament que mai va pujar del tot.

### Quan no hi cap

Una escriptura que falla per manca d'espai **no es pot empassar en silenci**:
en un sistema on el dispositiu és la còpia bona, això és perdre dades sense
assabentar-se'n. `_write()` fa lloc (primer els mesos vells ja pujats,
després el diari) i ho torna a provar; si tot i així no hi cap, aixeca
`storageFull` i ho anota.

També es demana `navigator.storage.persist()` en arrencar: sense això el
navegador pot alliberar l'espai d'aquest lloc quan el dispositiu va just, i
s'endú l'entrenament que encara no ha pujat.

### Per què `localStorage` i no IndexedDB

Els sistemes grans (Linear i companyia) fan servir IndexedDB: ~5 MB contra
un percentatge del disc, i asíncron. Aquí la finestra que es guarda són tres
mesos —una sessió ronda els 2 KB, o sigui unes desenes de KB per mes— més el
catàleg i el diari: molt lluny del límit. `localStorage` és síncron, i això
és una virtut per a aquest cas: la sèrie queda escrita abans que la funció
retorni, sense finestra on tancar l'app la perdi.

**El dia que calgui migrar** és quan `storage-full` comenci a sortir al
diari, o quan es vulgui guardar tot l'historial en local en comptes d'una
finestra.

---

## 7. Sense connexió

`OfflineService.worksOffline(url)` diu quines pàgines funcionen sense
connexió: les que treballen amb el que hi ha al dispositiu (Entrenar, Inici,
exercicis, esports, tipus, plantilles, perfil). L'historial sencer i el
progrés necessiten tot l'historial, i ensenyar-los a mitges enganya més que
no informa: `AppComponent` hi posa el cartell de «disponible només amb
connexió».

El commutador **Paràmetres avançats → forçar sense connexió** talla també les
consultes de debò, no només la interfície, perquè provar el mode sense
connexió provi el mateix camí que passa al carrer.

---

## 8. El diari

`core/services/sync-log.service.ts` anota el viatge de cada sessió en un
anell de 400 entrades a `localStorage`: `local-write`, `flush-start`,
`push-ok`, `push-stale`, `push-fail`, `pull-adopt`, `pull-keep`,
`pull-remove`, `prune`… Es llegeix a **`/debug/local`**, que a més ensenya
el que hi ha guardat en cru, la cua d'enviaments i una comparació directa
del dispositiu contra la base de dades.

Quan alguna cosa no quadri, el diari és el primer lloc on mirar: hi surt si
una sessió es va guardar bé aquí i què va contestar el servidor.

---

## 8b. La resta de dades: catàlegs i paràmetres

Els entrenaments no són l'única cosa que es veu des de dos llocs.

**Els catàlegs** (exercicis, esports, tipus d'entrenament, plantilles) es
carregaven un cop en entrar i es quedaven amb la foto d'aquell moment:
l'exercici creat al mòbil no existia a la pestanya oberta a l'ordinador fins
que no la recarregaves. Ara es tornen a demanar en tornar a l'app
(`onAppResume()`, `app-resume.util.ts` — els mateixos tres senyals i el mateix
marge que fan servir entrenaments i esports).

Dues coses que van amb això:

- **Una consulta que ha fallat no és «no en té cap».** Sembrar el catàleg per
  defecte cada cop que la xarxa cau és ressuscitar el que l'usuari havia
  esborrat: només es sembra a la primera càrrega (`allowSeed`), i mai amb un
  error a la resposta.
- **Sembrar és una operació, no dues.** Mirar quants n'hi ha i inserir-los
  després deixa segons pel mig: estrenar l'app al mòbil i a l'ordinador alhora
  feia que tots dos veiessin zero i tots dos sembressin, i el catàleg sortia
  duplicat. `seed_default_exercises()` (migració 029) ho fa dins la mateixa
  transacció, amb un pany per usuari.

**Els paràmetres** (`user_settings`) són un sol jsonb, i el client hi escrivia
tot el que tenia a memòria. Com que només el llegia en entrar, era un bloc
vell: canviaves l'objectiu setmanal al mòbil i, a la nit, tocant el tema fosc a
l'ordinador, l'objectiu tornava enrere. Ningú feia res estrany — la segona
escriptura simplement portava una foto anterior.

Ara puja **només els camps que has canviat** i els fusiona el servidor
(`merge_user_settings()`, migració 029: `settings || excluded.settings`), i el
que no ha pujat espera a `gymgoli_settings_pending_<uid>` fins que arriba —
abans, un canvi fet sense cobertura es perdia en silenci. Mentre esperi, mana
per damunt del que contesti el servidor, que és la mateixa regla que els
entrenaments.

**El pany entre pestanyes de la sessió.** Supabase rota el testimoni de refresc
cada cop que el fa servir. Amb dues pestanyes obertes, les dues hi arriben
alhora, les dues envien el mateix testimoni i la segona el troba gastat: la
sessió cau sense que l'usuari hagi tocat res. `SupabaseService` passa un pany
sobre `navigator.locks` perquè només una hi vagi.

---

## 9. Si toques això

- Cap escriptura pot passar per la xarxa abans de passar pel magatzem.
- Cap ack pot tancar res sense comparar la revisió.
- Cap resposta del servidor pot substituir una sessió pendent.
- Una resposta incompleta no és prova que res s'hagi esborrat.
- Un esborrat sense cobertura ha de deixar làpida.
- Cap sessió sense sèries pot entrar al magatzem.
- Cap consulta sencera es pot llançar dues vegades alhora.
- Els tests que ho subjecten són `workout-store.service.spec.ts`,
  `sync.service.spec.ts`, `supabase-page.util.spec.ts` i els blocs
  «escala», «consulta de canvis» i «índex per exercici» de
  `workout.service.spec.ts`. Si en trenques un, és el sistema el que has
  trencat, no el test.

L'outbox d'esports (`sport.service.ts`) segueix el mateix criteri amb un
`seq` per operació, i és el patró en què es va basar aquest.

---

## 10. D'on surt tot això

No està inventat aquí. És el que fan els sistemes de sincronització provats,
adaptat a la mida d'aquesta app:

| Idea | D'on ve |
| --- | --- |
| Magatzem local com a camí de lectura i escriptura | Linear, Replicache |
| Cua de mutacions amb confirmació idempotent | Replicache (`/push`, ordre autoritatiu del servidor) |
| Pull amb cursor (`cookie` / `lastPulledAt`) | Replicache, WatermelonDB |
| Servidor per defecte, excepte el que s'ha canviat aquí des de l'última sincronització | WatermelonDB (resolució per contingut, no per hora) |
| Avortar la pujada si la fila ha canviat després del nostre pull | WatermelonDB |
| Làpides per als esborrats | CouchDB/PouchDB, WatermelonDB |
| `navigator.storage.persist()` contra el desallotjament | MDN, Storage API |

Enllaços: [Replicache](https://queryplane.com/blog/replicache-local-first-sync/) ·
[WatermelonDB — sync](https://watermelondb.dev/docs/Implementation/SyncImpl) ·
[Quotes i desallotjament](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
