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
| Bafarada d'insight (`home`) | segons el tipus (taula de sota) | Surt a baix a la dreta i parla |
| Bafarada de suggeriment (`train`) | Marley si és gym, Xoco si és esport | Surt a baix a la dreta i parla |
| Targetes d'insight | igual que la bafarada | Avatar + emoji, sense veu pròpia |
| Barres d'objectiu setmanal | Marley al gym, Xoco a l'esport, tots dos si l'objectiu és combinat | Avatar a l'esquerra |
| Ratxa | tots dos | Avatar a l'esquerra |
| Suggeriment de `train` (targeta) | qui fa la proposta | Xapa sobre la icona |

### La bafarada

El gos surt a baix a la dreta amb bafarada de còmic i et diu una cosa curta.
Tres regles perquè no sigui invasiva:

1. **És una capa i res més.** El que diu ja surt també a la targeta de sota,
   que no es mou ni canvia. Tancar-la no et fa perdre cap informació.
2. **Es tanca i no torna en tot el dia.** L'endemà sí.
3. **Una de sola.** Als insights només surt la del primer, mai una pila.

Les barres d'objectiu i les targetes **no es toquen mai** per fer-los lloc:
les icones d'activitat, els comptadors i el motiu del suggeriment segueixen
exactament on eren. Els gossos només s'hi afegeixen al costat.

- Mentre entrenes (amb un entrenament actiu obert) no hi surten enlloc.
- La proposta de l'entrenador tampoc: aquella és la veu d'una persona real.

| Insight | Qui |
| ------- | --- |
| `prova_gym`, `equilibra_gym`, `categoria_endarrerida`, `descansa` | Marley |
| `prova_esport`, `recupera_esport`, `constancia_esport`, `feeling_baixant_esport` | Xoco |
| `setmana_fluixa` | el gos del que hi ha planificat avui |
| objectius, ratxa, resum de setmana | tots dos |

---

## Variants

Perquè no diguin sempre el mateix quan la situació es repeteix, alguns
missatges tenen 2-3 finals i `pickVariant()` (`core/models/mascot.voice.ts`)
en tria un amb la data com a llavor: fix tot el dia, diferent l'endemà. No és
atzar a propòsit — els insights són `computed()` i una frase que canviés a cada
recàlcul es notaria.

En tenen: `descansa`, `prova_gym`, `prova_esport`, `recupera_esport`,
`categoria_endarrerida` i `setmana_fluixa`.

---

## Per evolucionar

Decidit pel camí:

- **El Xoco no necessita veu pròpia als missatges transversals.** Als
  objectius i la ratxa hi són tots dos i cap dels dos parla en primera
  persona. La dada mana i ells acompanyen.

- **La bafarada no substitueix res.** Va néixer com a capa per sobre de les
  targetes, i així es queda: si algun dia es planteja treure la targeta quan
  surt la bafarada, la resposta és no.

Encara obert:

- Variants per als casos que encara en tenen una de sola.
- Si la ratxa mereix alguna cosa més que una fila quan és molt llarga (10+
  setmanes), o si val més que es mantingui igual de discreta sempre.
- Moments d'alegria de debò: ara mateix no hi ha res per a quan **acabes** un
  entrenament, que és quan un gos et rebria millor. La bafarada ja seria el
  lloc on dir-ho.
- Si el gos de la bafarada hauria de canviar de cara segons el missatge
  (content, tranquil, adormit) o si amb una de sola ja n'hi ha prou.
