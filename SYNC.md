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
| **Domini** | `core/services/workout.service.ts` | La lògica d'entrenaments i els senyals que consumeix la interfície. Escriu al magatzem i avisa la sincronització. |

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

### Pull incremental

`refreshLoaded()` demana primer **només el que ha canviat** des de l'últim
cop (`updated_at > lastPulledAt`). És una consulta petita i porta de seguida
el que s'ha registrat des d'un altre dispositiu.

Aquesta consulta no pot veure el que ha **desaparegut**: una fila esborrada
ja no surt enlloc, i la taula no té cap marca de baixa. Per això la
comprovació sencera (mes a mes, o tot l'historial) es continua fent, però
espaiada — cada 5 minuts, no a cada canvi de pestanya.

---

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

## 9. Si toques això

- Cap escriptura pot passar per la xarxa abans de passar pel magatzem.
- Cap ack pot tancar res sense comparar la revisió.
- Cap resposta del servidor pot substituir una sessió pendent.
- Un esborrat sense cobertura ha de deixar làpida.
- Els tests que ho subjecten són `workout-store.service.spec.ts` i
  `sync.service.spec.ts`. Si en trenques un, és el sistema el que has
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
