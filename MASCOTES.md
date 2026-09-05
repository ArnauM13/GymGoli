# Marley i Xoco

Les dues mascotes de l'app. **Dos acompanyants amistosos, un especialitzat en
entrenaments i l'altre en esport. Ajudants, sempre positius.**

Aquest document és la referència de qui són. Les seves personalitats són
material viu: aquí es guarden per poder-hi tornar i fer-les créixer. Les regles
de com es pinten a la interfície viuen a `DESIGN.md` §13; el mapa de codi, a
`src/app/core/models/mascot.model.ts`.

---

## Marley — entrenaments

Golden retriever gran. Fort, molt corpulent, tirat endavant. **Sense por i
sense límits**: el que es proposa, ho aconsegueix. Senyorial i tranquil, però
amb un caràcter fort al darrere. Es desviu pel que li agrada. I valora el
descans com ningú — per a ell no és una pausa, és part de la feina.

**Com parla**

Poc i clar. No suplica ni insisteix: constata i deixa la porta oberta, perquè
té la seguretat de qui sap que hi tornaràs. La calma li surt de la confiança,
no de la mandra. Quan diu que descansis, no ho suggereix: ho sap.

| | |
| -- | -- |
| Sí | «Tu diràs.» · «Bona jugada.» · «Ves-hi.» · «Avui toca sofà.» · «Ho equilibrem.» |
| No | «Vinga, va, anima't!» · «No em facis això» · exclamacions encadenades |

---

## Xoco — esport

Jove, rialler, incansable. Li encanta moure's: sortir, córrer, saltar. Molt
intel·ligent i molt capaç d'aprendre coses noves. Proper, sincer, carinyós,
positiu. Podria estar fent esport tot el dia — però en bona companyia també
li encanta parar i estar tranquil després d'una bona sessió.

**Com parla**

Curt i amb ganes. Pregunta molt, perquè el que vol és anar-hi amb tu. Té
espurna i és sincer, mai empalagós. Després d'una sessió dura baixa el to
sense problema: també sap estar quiet, si hi ha companyia.

| | |
| -- | -- |
| Sí | «Sortim?» · «Ja soc a la porta!» · «Ja tinc ganes!» · «Avui, tranquils.» |
| No | discursos, consells llargs, res que soni a entrenador personal |

---

## Regles de veu

1. **Curt.** Una frase de dada, una frase de gos de dues a cinc paraules.
   «Sortim?» i para. Si necessita una explicació, no és seva.
2. **Ofereix, no constatis mancances.** El títol és una porta oberta, mai un
   diagnòstic del que no has fet.
3. **Cap dels dos culpabilitza.** L'onboarding promet «sense alarmes ni
   pressions» i ells hi estan subjectes. S'alegren de veure't tant si has
   entrenat com si no.
4. **Primera persona del plural** quan és una activitat teva: «hi tornem?»,
   «fa temps que no fem Pàdel». Un gos s'hi inclou sempre.
5. **Les dades no es toquen.** Números, dies i noms d'esport es mantenen
   intactes: el que canvia és el marc, no la informació.
6. **Els missatges transversals** (objectius, ratxa, resum de setmana) porten
   menys gos i més dada. Si tot parla amb corretges i sofàs, la broma es gasta.

---

## On són

| Lloc | Qui | Com |
| ---- | --- | --- |
| Suggeriment de `train` | Marley si és gym, Xoco si és esport | La targeta **és** la bafarada, amb el gos al costat |
| Targetes d'insight (`home`) | segons el tipus (taula de sota) | Avatar + emoji, sense veu pròpia |
| Feed del dia (`home`) | Marley als entrenaments, Xoco als esports | Xapa sobre la icona d'activitat |
| Barres d'objectiu setmanal | Marley al gym, Xoco a l'esport, tots dos si l'objectiu és combinat | Avatar a l'esquerra |
| Ratxa | tots dos | Avatar a l'esquerra |

### La icona d'activitat

Quan el gos va a sobre d'una icona d'activitat, **mana la icona**: és el que
has de reconèixer d'un cop d'ull i el gos només acompanya. Va petit i a la
cantonada de sota, on el glif gairebé no té tinta.

No es reimplementa mai: és `<app-activity-icon>`.

```html
<app-activity-icon [icon]="..." [color]="..." mascot="marley" />
```

Ho fan servir la targeta d'entrenament i la d'esport del feed d'Inici, i el
suggeriment d'Entrenament. Va néixer perquè estava copiat a dos llocs i les
dues còpies van acabar amb mides diferents; qualsevol lloc nou el reutilitza
en comptes de tornar-lo a escriure.

Sense `mascot` surt la icona sola (l'usa el botó de «Nou entrenament»), i
`both` s'ignora: una activitat és de gimnàs o d'esport, mai les dues.

### La bafarada

El gos surt a baix a la dreta amb bafarada de còmic i et diu una cosa curta.
Ara mateix **només al suggeriment d'entrenament**: a Inici els insights es
queden en targetes i els gossos no hi surten a parlar. Va sortir-hi un temps
i era massa veu per a una pantalla que ja és plena de dades; es reserva per
al moment en què tenen alguna cosa concreta a proposar.

Tres regles perquè no sigui invasiva:

1. **Una sola cosa a la pantalla, no tres.** Al suggeriment de `train` la
   targeta *és* la bafarada: mateix format, amb cua cap al gos, botó de
   tancar i el gos al costat. No hi ha una targeta a part ni un missatge
   repetit — el primer intent en tenia tres alhora (xapa, bafarada i
   targeta) i era massa.
2. **Tancar-la no et fa perdre res.** En tancar-la queda la targeta de
   sempre, que segueix sent clicable i portant al mateix lloc.
3. **Es tanca i no torna en tot el dia.** L'endemà sí.
4. **Un sol gos.** Quan la figura gran hi és, la xapa de la icona
   desapareix: no ha de sortir dos cops a la mateixa targeta.

Aquí surten **grans i sense cercle**, amb el cap i el pit retallats del fons
(`figure` a `mascot.model.ts`, no `avatar`). La silueta ja diu qui és i
emmarcar-los només els faria petits. Quan hi són tots dos es fa servir el
dibuix on ja surten junts: encavalcar dues retallades deixa una costura al mig.

Els retalls surten de `bibis.png` amb el fons tret per flood fill des de les
vores. Els cantons on el dibuix original talla un gos (el Marley per la dreta,
on el tapava el Xoco; el Xoco pels dos costats) van esvaïts, si no es veuen com
un retall recte.

Les barres d'objectiu i les targetes **no es toquen mai** per fer-los lloc:
les icones d'activitat, els comptadors i el motiu del suggeriment segueixen
exactament on eren. Els gossos només s'hi afegeixen al costat.

- Mentre entrenes (amb un entrenament actiu obert) no hi surten enlloc.
- La proposta de l'entrenador tampoc: aquella és la veu d'una persona real.

| Insight | Qui |
| ------- | --- |
| `carrega_alta`, `volum_gym`, `equilibri_gym` | Marley |
| `progres`, `esforc_creixent` | el gos de l'àmbit: Marley si la dada és de gym, Xoco si és d'esport |
| objectius (`ratxa_en_joc`, `objectiu_a_l_alca`, `objectiu_desajustat`, `compliment_objectiu`), `sense_activitat`, `tendencia_volum`, `patro_setmanal`, ratxa, resum de setmana | tots dos |

Els insights són **tendències**, no consells del dia: el «què faig avui» el diu
el suggeriment de `train` i el «com va la setmana», les barres d'objectiu. Per
això la majoria són transversals i porten els dos gossos: parlen de mesos, no
d'una activitat concreta. I n'hi cap **un de sol** a la pantalla — dos alhora
feien que no es llegís cap.

La targeta té tres línies i l'ordre importa: **títol** (la porta oberta),
**dada** (la xifra, que és el motiu pel qual la targeta existeix) i
**missatge** (el gos, curt). Si la xifra no hi és, l'insight no s'ha de fer.

Tancar-lo el silencia **el dia d'avui i prou**, com la bafarada. L'endemà
torna si encara és cert.

---

## Variants

Perquè no diguin sempre el mateix quan la situació es repeteix, alguns
missatges tenen 2-3 finals i `pickVariant()` (`core/models/mascot.voice.ts`)
en tria un amb la data com a llavor: fix tot el dia, diferent l'endemà. No és
atzar a propòsit — els insights són `computed()` i una frase que canviés a cada
recàlcul es notaria.

En tenen els missatges on parla un gos: `carrega_alta`, `sense_activitat`,
`esforc_creixent`, `equilibri_gym`, `progres` (gym i esport) i el final de
`ratxa_en_joc`. Els que són pura dada — `compliment_objectiu`,
`tendencia_volum`, `volum_gym`, `patro_setmanal` — no en porten: allà la xifra
ja diu prou i una frase de gos només hi faria nosa.

---

## Per evolucionar

Decidit pel camí:

- **El Xoco no necessita veu pròpia als missatges transversals.** Als
  objectius i la ratxa hi són tots dos i cap dels dos parla en primera
  persona. La dada mana i ells acompanyen.

- **La bafarada no substitueix res.** Va néixer com a capa per sobre de les
  targetes, i així es queda: si algun dia es planteja treure la targeta quan
  surt la bafarada, la resposta és no.

La següent, acordada i pendent de fer:

- **Acabar un entrenament queda buit.** Avui l'acabes i ja està, i és
  justament el moment en què un gos et rebria millor. La bafarada ja seria el
  lloc on dir-ho. És la propera gran peça.

Encara obert:

- Si la ratxa mereix alguna cosa més que una fila quan és molt llarga (10+
  setmanes), o si val més que es mantingui igual de discreta sempre.
- Si el gos de la bafarada hauria de canviar de cara segons el missatge
  (content, tranquil, adormit) o si amb una de sola ja n'hi ha prou. Ara mateix
  només tenim el dibuix somrient de `bibis.png`; qualsevol altra expressió vol
  art nova.
- Cap dels dos té cos sencer enlloc: el dibuix original és un retrat que acaba
  a mitja pitrera. Si algun dia se'n vol un de dret o corrent, s'ha de dibuixar.
