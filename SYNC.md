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

## 3. Fusionar el que arriba del servidor

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

## 4. Esborrats

`deleteWorkout()` no truca al servidor. Treu la sessió del dispositiu i, si
el servidor l'havia arribat a veure, deixa una **làpida**
(`gymgoli_deleted_<uid>`). La làpida fa dues coses:

1. L'esborrat viatja per la mateixa cua que la resta, així que sense
   cobertura no falla.
2. Mentre existeixi, aquell id es filtra de qualsevol resposta del servidor
   — si no, la següent consulta ressuscitaria el que acabes d'esborrar.

---

## 5. Quant es guarda al dispositiu

El local **no** és una còpia de tot l'historial. Es guarden els mesos de la
finestra que l'app fa servir sense connexió (`RETAINED_MONTHS`, ara 3, que
cobreix de sobres els 30 dies d'Inici), més **qualsevol cosa que encara no
hagi pujat, tingui l'edat que tingui**. La resta viu a la base de dades i es
torna a demanar quan es necessita.

`store.prune()` s'executa quan la cua es queda buida: quan tot el que hi ha
aquí és exactament el que hi ha a dalt, l'espai dels mesos vells s'allibera.

---

## 6. Sense connexió

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

## 7. El diari

`core/services/sync-log.service.ts` anota el viatge de cada sessió en un
anell de 400 entrades a `localStorage`: `local-write`, `flush-start`,
`push-ok`, `push-stale`, `push-fail`, `pull-adopt`, `pull-keep`,
`pull-remove`, `prune`… Es llegeix a **`/debug/local`**, que a més ensenya
el que hi ha guardat en cru, la cua d'enviaments i una comparació directa
del dispositiu contra la base de dades.

Quan alguna cosa no quadri, el diari és el primer lloc on mirar: hi surt si
una sessió es va guardar bé aquí i què va contestar el servidor.

---

## 8. Si toques això

- Cap escriptura pot passar per la xarxa abans de passar pel magatzem.
- Cap ack pot tancar res sense comparar la revisió.
- Cap resposta del servidor pot substituir una sessió pendent.
- Un esborrat sense cobertura ha de deixar làpida.
- Els tests que ho subjecten són `workout-store.service.spec.ts` i
  `sync.service.spec.ts`. Si en trenques un, és el sistema el que has
  trencat, no el test.

L'outbox d'esports (`sport.service.ts`) segueix el mateix criteri amb un
`seq` per operació, i és el patró en què es va basar aquest.
