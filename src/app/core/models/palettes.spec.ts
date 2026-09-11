import { DEFAULT_SPORTS, SPORT_COLORS, SPORT_ICONS } from './sport.model';
import {
  DEFAULT_TRAINING_TYPES, TRAINING_TYPE_COLORS, TRAINING_TYPE_ICONS,
} from './training-type.model';

/**
 * Les rodes d'icones i colors són el que veu qui es fa un esport o un tipus
 * d'entrenament seu. El que es demana aquí no és l'estètica sinó que siguin
 * rodes de debò: res repetit, res que no es pugui triar, i el que l'app ja
 * fa servir sempre a dins.
 */
describe('rodes d\'icones i colors', () => {
  const cases = [
    { what: 'esports',                icons: SPORT_ICONS,         colors: SPORT_COLORS },
    { what: 'tipus d\'entrenament',   icons: TRAINING_TYPE_ICONS, colors: TRAINING_TYPE_COLORS },
  ];

  for (const { what, icons, colors } of cases) {
    describe(what, () => {
      it('no repeteix cap icona', () => {
        expect(new Set(icons).size).toBe(icons.length);
      });

      it('no repeteix cap color', () => {
        const seen = colors.map(c => c.toLowerCase());
        expect(new Set(seen).size).toBe(colors.length);
      });

      it('tots els colors són hex de sis xifres', () => {
        expect(colors.filter(c => !/^#[0-9a-f]{6}$/i.test(c))).toEqual([]);
      });

      it('totes les icones són noms de Material Symbols', () => {
        expect(icons.filter(i => !/^[a-z0-9_]+$/.test(i))).toEqual([]);
      });
    });
  }

  // El que ve de sèrie s'ha de poder tornar a triar: si un esport per defecte
  // porta un color que no és a la roda, qui l'edita el perd sense voler.
  it('els esports per defecte només fan servir icones i colors de la roda', () => {
    for (const s of DEFAULT_SPORTS) {
      expect(SPORT_ICONS).withContext(`icona de ${s.name}`).toContain(s.icon);
      expect(SPORT_COLORS).withContext(`color de ${s.name}`).toContain(s.color);
    }
  });

  it('els tipus d\'entrenament per defecte, igual', () => {
    for (const t of DEFAULT_TRAINING_TYPES) {
      expect(TRAINING_TYPE_ICONS).withContext(`icona de ${t.name}`).toContain(t.icon);
      expect(TRAINING_TYPE_COLORS).withContext(`color de ${t.name}`).toContain(t.color);
    }
  });
});
