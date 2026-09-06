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
7. **L'explicació no és seva.** Al detall d'un insight ("per què t'ho diem")
   hi ha dades i frases planes, no gos: cap percentatge, cap paraula
   d'entrenador i cap deure. Ells posen la cara a la capçalera i callen.
8. **Cap xifra sense el seu quan.** «2,8 per setmana» no vol dir res si no es
   diu de quan és. A la targeta, el període va dit en paraules («aquest
   mes»); al detall, amb dates. I si per dir-ho bé calen dues xifres i dos
   períodes, a la targeta n'hi va una: la resta s'obre.

---

## On són

| Lloc | Qui | Com |
| ---- | --- | --- |
| Presentació de l'onboarding | tots dos, i després un de sol per diapositiva | Figura gran centrada; es presenten ells |
| Tour guiat | segons la parada (taula de sota) | Figura a la targeta que assenyala la pantalla |
| Suggeriment de `train` | Marley si és gym, Xoco si és esport | La targeta **és** la bafarada, amb el gos al costat |
| Targetes d'insight (`home`) | segons el tipus (taula de sota) | Avatar + emoji, sense veu pròpia |
| Detall d'un insight (full que puja des de la targeta) | el mateix que la targeta | Avatar gran a la capçalera, **sense veu**: allà s'explica la dada |
| Feed del dia (`home`) | Marley als entrenaments, Xoco als esports | Xapa sobre la icona d'activitat |
| Barres d'objectiu setmanal | Marley al gym, Xoco a l'esport, tots dos si l'objectiu és combinat | Avatar a l'esquerra |

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

### L'onboarding i el tour

És l'únic lloc on **es presenten**: diuen com es diuen i de què va cadascun.
A la resta de l'app ja no cal — allà o parlen d'una dada o no hi són.

L'onboarding són quatre diapositives i el gos hi surt gran i centrat: els dos
junts per obrir i tancar, i una per al Marley i una per al Xoco on cadascú diu
qui és en primera persona. Aquí sí que porten frase pròpia («Tu diràs.»,
«Sortim?»), perquè s'estan presentant. Les dues transversals no en porten.

Acaba oferint el **tour guiat**, que és la peça que importa: en comptes
d'explicar l'app amb captures, els gossos et porten per l'app de veritat.
Cada parada navega a la seva pantalla, il·lumina l'element del qual parla i
t'ho diu al costat. Dir «els esports es configuren a Perfil» no serveix de
res si l'usuari no ha vist mai on és Perfil.

El repartiment segueix el de sempre — el que és de gimnàs el diu el Marley,
el que és d'esport el Xoco, i el que és de tots dos no el diu ningú en
primera persona:

| Parada | Qui | Frase de gos |
| ------ | --- | ------------ |
| Pestanya d'Inici | tots dos | sí, és l'obertura |
| El botó del dia | Marley | sí |
| Historial i Progrés | tots dos | no |
| Pestanya de Perfil | tots dos | no |
| Exercicis i tipus d'entrenament | Marley | sí |
| Esports | Xoco | sí |
| Rutines i planificador | tots dos | no |
| Tancament | tots dos | sí, és el comiat |

Les regles que el mantenen amable:

1. **No assalta ningú.** Només s'engega si l'usuari diu que sí a l'onboarding,
   o si el demana des de Perfil. A qui ja fa servir l'app no li surt mai sol.
2. **Es pot deixar a mitges sempre.** «Salta el tour» hi és a totes les
   parades, i deixar-lo compta com fet: no se li torna a oferir.
3. **Nou parades.** Complet però no aclaparador: cada pantalla nova costa
   atenció, i un tour que es fa llarg s'abandona a la meitat, que és pitjor
   que un de curt.

Com que tot plegat només es veu un cop, **Perfil → Paràmetres avançats** té
un «Repetir la benvinguda» que torna a armar la presentació i el tour, i un
«Fer només el tour guiat». No esborra res: només els dos indicadors de «ja ho
has vist». Sense això, l'única manera de tornar-los a veure amb el teu propi
compte seria tocar les preferències a mà — i el copy dels gossos és
justament el que s'ha de poder rellegir en context.

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
| objectius (`ratxa_assolida`, `ratxa_en_joc`, `objectiu_a_l_alca`, `objectiu_desajustat`, `compliment_objectiu`), `sense_activitat`, `tendencia_volum`, `patro_setmanal`, resum de setmana | tots dos |

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

L'excepció són les **fites** (`once` a `insight.model.ts`): es diuen una sola
vegada i no tornen mai més. Avui només ho és `ratxa_assolida`, la felicitació
del dia que la ratxa creix. Una fita és un moment, no un estat: si es quedés a
la pantalla deixaria de ser una alegria i passaria a ser una cosa que pots
perdre.

---

## Variants

Perquè no diguin sempre el mateix quan la situació es repeteix, alguns
missatges tenen 2-3 finals i `pickVariant()` (`core/models/mascot.voice.ts`)
en tria un amb la data com a llavor: fix tot el dia, diferent l'endemà. No és
atzar a propòsit — els insights són `computed()` i una frase que canviés a cada
recàlcul es notaria.

En tenen els missatges on parla un gos: `carrega_alta`, `sense_activitat`,
`esforc_creixent`, `equilibri_gym`, `progres` (gym i esport), `ratxa_assolida`
i el final de `ratxa_en_joc`. Els que són pura dada — `compliment_objectiu`,
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

- **Presentar-se és cosa d'una vegada.** Ho fan a l'onboarding i prou. A la
  resta de l'app no diuen mai qui són: o porten una dada, o no hi són.

- **La ratxa es felicita, no es penja.** Ja no viu enlloc fix: ni al resum de
  setmana d'Inici ni a l'objectiu del Perfil. Es diu el dia que creix, amb les
  setmanes que portes i les xifres d'aquelles setmanes, i després desapareix.
  Un comptador sempre a la vista converteix una alegria en una cosa que pots
  perdre, i això seria exactament la pressió que l'onboarding promet no fer.

La següent, acordada i pendent de fer:

- **Acabar un entrenament queda buit.** Avui l'acabes i ja està, i és
  justament el moment en què un gos et rebria millor. La bafarada ja seria el
  lloc on dir-ho. És la propera gran peça.

Encara obert:

- Si les ratxes molt llargues (10+ setmanes) mereixen una felicitació
  diferent de les primeres, o si val més que totes es diguin igual.
- Si el gos de la bafarada hauria de canviar de cara segons el missatge
  (content, tranquil, adormit) o si amb una de sola ja n'hi ha prou. Ara mateix
  només tenim el dibuix somrient de `bibis.png`; qualsevol altra expressió vol
  art nova.
- Cap dels dos té cos sencer enlloc: el dibuix original és un retrat que acaba
  a mitja pitrera. Si algun dia se'n vol un de dret o corrent, s'ha de dibuixar.
