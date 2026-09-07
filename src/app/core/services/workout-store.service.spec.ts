import { TestBed } from '@angular/core/testing';

import { WorkoutStoreService } from './workout-store.service';
import { Workout, WorkoutSet } from '../models/workout.model';

function makeWorkout(id: string, date: string, sets: WorkoutSet[] = []): Workout {
  return {
    id, date,
    entries: [{ exerciseId: 'ex1', exerciseName: 'Press banca', sets }],
    categories: ['push'], createdAt: new Date(`${date}T08:00:00.000Z`), status: 'done',
  };
}

function thisMonth(day = '15'): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${day}`;
}

describe('WorkoutStoreService', () => {
  let store: WorkoutStoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(WorkoutStoreService);
    store.hydrate('user-1');
  });

  afterEach(() => localStorage.clear());

  describe('escriptura local', () => {
    it('guarda i deixa la sessió esperant pujar, sense parlar amb ningú', () => {
      store.put(makeWorkout('w1', thisMonth(), [{ weight: 80, reps: 8 }]));

      expect(store.get('w1')!.entries[0].sets.length).toBe(1);
      expect(store.pendingIds()).toEqual(['w1']);
    });

    // Tancar l'app enmig d'un entrenament sense cobertura no pot costar res.
    it('sobreviu a tancar i tornar a obrir l\'app', () => {
      store.put(makeWorkout('w1', thisMonth(), [{ weight: 80, reps: 8 }]));

      const other = TestBed.inject(WorkoutStoreService);
      other.reset();
      other.hydrate('user-1');

      expect(other.get('w1')!.entries[0].sets.length).toBe(1);
      expect(other.pendingIds()).toEqual(['w1']);   // i encara consta per pujar
    });

    it('cada canvi puja la revisió, que és el que fa que un ack no s\'empassi res', () => {
      store.put(makeWorkout('w1', thisMonth()));
      store.put(makeWorkout('w1', thisMonth(), [{ weight: 80, reps: 8 }]));

      expect(store.record('w1')!.rev).toBe(2);
      expect(store.record('w1')!.syncedRev).toBe(0);
    });
  });

  describe('confirmacions', () => {
    it('confirmar la revisió que s\'ha enviat la dóna per pujada', () => {
      store.put(makeWorkout('w1', thisMonth()));
      store.ackUpsert('w1', 1);

      expect(store.pendingIds()).toEqual([]);
    });

    // El cor de l'assumpte: la resposta d'una petició antiga no pot tancar una
    // edició posterior. Així és com arribaven entrenaments buits a la base de
    // dades.
    it('confirmar una revisió vella la deixa pendent', () => {
      store.put(makeWorkout('w1', thisMonth()));                          // rev 1
      store.put(makeWorkout('w1', thisMonth(), [{ weight: 80, reps: 8 }])); // rev 2

      store.ackUpsert('w1', 1);   // arriba la resposta de la primera

      expect(store.pendingIds()).toEqual(['w1']);
      expect(store.get('w1')!.entries[0].sets.length).toBe(1);
    });
  });

  describe('el que arriba del servidor', () => {
    it('no trepitja una sessió que encara espera pujar', () => {
      store.put(makeWorkout('w1', thisMonth(), [{ weight: 80, reps: 8 }]));

      store.applyServerRow(makeWorkout('w1', thisMonth()));  // la versió buida d'abans

      expect(store.get('w1')!.entries[0].sets.length).toBe(1);
    });

    it('mana quan aquí ja està tot pujat', () => {
      store.put(makeWorkout('w1', thisMonth()));
      store.ackUpsert('w1', 1);

      store.applyServerRow(makeWorkout('w1', thisMonth(), [{ weight: 90, reps: 5 }]));

      expect(store.get('w1')!.entries[0].sets.length).toBe(1);
      expect(store.pendingIds()).toEqual([]);   // ve d'allà: no cal tornar-la a enviar
    });

    it('adopta una sessió que només és al núvol: ve d\'un altre dispositiu', () => {
      store.mergeServerScope([makeWorkout('w9', thisMonth(), [{ weight: 60, reps: 10 }])], () => true, store.mark());

      expect(store.get('w9')!.entries[0].sets.length).toBe(1);
      expect(store.pendingIds()).toEqual([]);
    });

    it('treu la que ja no hi és: s\'ha esborrat des d\'un altre dispositiu', () => {
      store.put(makeWorkout('w1', thisMonth()));
      store.ackUpsert('w1', 1);

      store.mergeServerScope([], () => true, store.mark());

      expect(store.has('w1')).toBeFalse();
    });

    it('no treu la que espera pujar encara que el servidor no la porti', () => {
      store.put(makeWorkout('w1', thisMonth(), [{ weight: 80, reps: 8 }]));

      store.mergeServerScope([], () => true, store.mark());

      expect(store.get('w1')!.entries[0].sets.length).toBe(1);
    });

    // Registrar una sèrie just abans que arribés la resposta la feia
    // desaparèixer de la pantalla: la consulta va sortir abans que existís.
    it('no treu la que s\'ha confirmat mentre la consulta viatjava', () => {
      const since = store.mark();
      store.put(makeWorkout('w1', thisMonth()));
      store.ackUpsert('w1', 1);              // confirmada després de preguntar

      store.mergeServerScope([], () => true, since);

      expect(store.has('w1')).toBeTrue();
    });

    it('només mira l\'abast que s\'ha demanat', () => {
      store.put(makeWorkout('vell', '2024-01-10'));
      store.ackUpsert('vell', 1);

      store.mergeServerScope([], w => w.date.startsWith('2024-02'), store.mark());

      expect(store.has('vell')).toBeTrue();  // el gener no s'ha demanat
    });
  });

  describe('esborrats', () => {
    it('deixa làpida quan el servidor l\'havia arribat a veure', () => {
      store.put(makeWorkout('w1', thisMonth()));
      store.ackUpsert('w1', 1);

      store.remove('w1');

      expect(store.has('w1')).toBeFalse();
      expect(store.tombstones().map(t => t.id)).toEqual(['w1']);
    });

    it('no en deixa si mai va sortir d\'aquí: no hi ha res a esborrar allà', () => {
      store.put(makeWorkout('w1', thisMonth()));

      store.remove('w1');

      expect(store.tombstones()).toEqual([]);
    });

    it('una consulta posterior no la ressuscita', () => {
      store.put(makeWorkout('w1', thisMonth()));
      store.ackUpsert('w1', 1);
      store.remove('w1');

      store.mergeServerScope([makeWorkout('w1', thisMonth())], () => true, store.mark());

      expect(store.has('w1')).toBeFalse();
    });
  });

  describe('espai', () => {
    it('allibera els mesos vells que ja són a la base de dades', () => {
      store.put(makeWorkout('vell', '2024-01-10'));
      store.ackUpsert('vell', 1);
      store.prune();

      expect(localStorage.getItem('gymgoli_month_user-1_2024-01')).toBeNull();
    });

    it('no toca mai un mes vell amb res per pujar', () => {
      store.put(makeWorkout('vell', '2024-01-10'));   // pendent
      store.prune();

      expect(localStorage.getItem('gymgoli_month_user-1_2024-01')).not.toBeNull();
    });

    it('conserva els mesos de la finestra que fa servir l\'app sense connexió', () => {
      const d = new Date();
      const key = `gymgoli_month_user-1_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      store.put(makeWorkout('w1', thisMonth()));
      store.ackUpsert('w1', 1);
      store.prune();

      expect(localStorage.getItem(key)).not.toBeNull();
    });
  });
});
