import { ActivityProfile } from '../../core/services/workout-profile.service';
import { SuggestionCandidate, pickSuggestion, sinceLabel } from './train-suggestion.util';

function profile(p: Partial<ActivityProfile> = {}): ActivityProfile {
  const base: ActivityProfile = {
    daysSinceLast: 3, typicalGapDays: 3, overdueScore: 1,
    everDone: true, sessions: 20,
  };
  const merged = { ...base, ...p };
  // L'score el deriva el servei; aquí es manté coherent per no provar amb
  // dades que no poden existir.
  return { ...merged, overdueScore: merged.daysSinceLast / merged.typicalGapDays };
}

function candidate(key: string, p: Partial<ActivityProfile>, extra: Partial<SuggestionCandidate> = {}): SuggestionCandidate {
  return { key, profile: profile(p), ...extra };
}

const OPTS = { minRecovery: 2, allowUntried: true };

describe('pickSuggestion', () => {
  it('no proposa res quan no hi ha candidats', () => {
    expect(pickSuggestion([], OPTS)).toBeNull();
  });

  // El que has dit que faries mana sobre qualsevol estadística.
  it('el planificat d\'avui passa al davant de tot', () => {
    const pick = pickSuggestion([
      candidate('padel', { daysSinceLast: 1 }, { planned: true }),
      candidate('running', { daysSinceLast: 200, sessions: 50 }),
    ], OPTS);

    expect(pick?.key).toBe('padel');
    expect(pick?.source).toBe('planned');
  });

  it('distingeix la rutina d\'un pla posat a mà', () => {
    const routine = pickSuggestion([candidate('padel', {}, { planned: true, fromRoutine: true })], OPTS);
    const manual  = pickSuggestion([candidate('padel', {}, { planned: true })], OPTS);

    expect(routine?.reason).toBe('Toca avui, per la rutina');
    expect(manual?.reason).toBe('Planificat per avui');
  });

  // Proposar-te el que acabes de fer no és un suggeriment.
  it('el que ja s\'ha fet avui queda fora, encara que estigués planificat', () => {
    const pick = pickSuggestion([
      candidate('padel', {}, { planned: true, doneToday: true }),
      candidate('running', { daysSinceLast: 5, typicalGapDays: 3 }),
    ], OPTS);

    expect(pick?.key).toBe('running');
  });

  it('no proposa el que encara està descansant', () => {
    expect(pickSuggestion([candidate('push', { daysSinceLast: 1 })], OPTS)).toBeNull();
  });

  describe('hi tornem?', () => {
    it('proposa tornar al que feies i fa setmanes que no fas', () => {
      const pick = pickSuggestion([candidate('padel', { daysSinceLast: 40, typicalGapDays: 4, sessions: 30 })], OPTS);

      expect(pick?.source).toBe('comeback');
      expect(pick?.reason).toBe('Hi tornem? Fa 6 setmanes');
    });

    // Provar una cosa un cop no vol dir que la «fessis».
    it('no fa tornar a una activitat que amb prou feines has tocat', () => {
      const pick = pickSuggestion([candidate('padel', { daysSinceLast: 40, typicalGapDays: 4, sessions: 2 })], OPTS);

      expect(pick?.source).toBe('due');
    });

    it('entre dues oblidades, la que fa més temps', () => {
      const pick = pickSuggestion([
        candidate('padel',   { daysSinceLast: 30,  sessions: 30 }),
        candidate('running', { daysSinceLast: 120, sessions: 30 }),
      ], OPTS);

      expect(pick?.key).toBe('running');
    });

    // Una de fa vuit anys no pot tapar per sempre la de fa dos mesos: totes
    // dues són «fa molt», i el que les desempata deixa de créixer.
    it('una de fa vuit anys no guanya per sempre', () => {
      const ancient = pickSuggestion([candidate('x', { daysSinceLast: 2900, sessions: 30 })], OPTS);
      const year    = pickSuggestion([candidate('x', { daysSinceLast: 365,  sessions: 30 })], OPTS);

      expect(ancient!.score).toBe(year!.score);
    });

    it('«fa temps» va amb la cadència: qui ho fa cada 10 dies no en fa 21', () => {
      const pick = pickSuggestion([candidate('padel', { daysSinceLast: 25, typicalGapDays: 10, sessions: 30 })], OPTS);

      expect(pick?.source).toBe('due');   // 25 < 10 * 3
    });
  });

  describe('et toca', () => {
    it('tria el que va més endarrerit segons la teva pròpia cadència', () => {
      const pick = pickSuggestion([
        candidate('push', { daysSinceLast: 4,  typicalGapDays: 4 }),   // 1.0
        candidate('pull', { daysSinceLast: 9,  typicalGapDays: 3 }),   // 3.0
        candidate('legs', { daysSinceLast: 5,  typicalGapDays: 4 }),   // 1.25
      ], OPTS);

      expect(pick?.key).toBe('pull');
      expect(pick?.source).toBe('due');
    });

    it('si res no reclama res, proposa igualment el de sempre', () => {
      const pick = pickSuggestion([candidate('push', { daysSinceLast: 2, typicalGapDays: 5 })], OPTS);

      expect(pick?.source).toBe('habit');
      expect(pick?.reason).toBe('Fa 2 dies');
    });
  });

  describe('el que no s\'ha fet mai', () => {
    it('es proposa quan qui pregunta ho permet', () => {
      const pick = pickSuggestion([candidate('bodypump', { everDone: false, daysSinceLast: 99, sessions: 0 })], OPTS);

      expect(pick?.source).toBe('untried');
    });

    it('i queda fora quan no', () => {
      const pick = pickSuggestion(
        [candidate('surf', { everDone: false, daysSinceLast: 99, sessions: 0 })],
        { ...OPTS, allowUntried: false },
      );

      expect(pick).toBeNull();
    });

    it('no tapa una activitat que sí que fas i va endarrerida', () => {
      const pick = pickSuggestion([
        candidate('surf', { everDone: false, daysSinceLast: 99, sessions: 0 }),
        candidate('push', { daysSinceLast: 12, typicalGapDays: 3 }),
      ], OPTS);

      expect(pick?.key).toBe('push');
    });
  });

  // Planificant es contesta una altra pregunta: què hi posaries, no què
  // comences. I a qui ja ho té apuntat no se li pregunta.
  describe('planificant', () => {
    const PLAN_OPTS = { ...OPTS, forPlanning: true };

    it('no proposa res quan el dia ja té alguna cosa al pla', () => {
      const pick = pickSuggestion([
        candidate('push', { daysSinceLast: 1 }, { planned: true }),
        candidate('legs', { daysSinceLast: 12, typicalGapDays: 3 }),
      ], PLAN_OPTS);

      expect(pick).toBeNull();
    });

    it("i en proposa una quan el dia encara és buit", () => {
      const pick = pickSuggestion([
        candidate('legs', { daysSinceLast: 12, typicalGapDays: 3 }),
      ], PLAN_OPTS);

      expect(pick?.key).toBe('legs');
      expect(pick?.source).toBe('due');
    });
  });
});

describe('sinceLabel', () => {
  it('diu dies, setmanes o mesos segons com de lluny queda', () => {
    expect(sinceLabel(1)).toBe('1 dia');
    expect(sinceLabel(5)).toBe('5 dies');
    expect(sinceLabel(21)).toBe('3 setmanes');
    expect(sinceLabel(120)).toBe('4 mesos');
  });

  it('no diu mai «0 dies» ni «1 mesos»', () => {
    expect(sinceLabel(0)).toBe('1 dia');
    expect(sinceLabel(60)).toBe('2 mesos');
  });
});
