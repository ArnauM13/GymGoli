import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { WorkoutStoreService, mergeWorkouts } from './workout-store.service';
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

  // Dos dispositius han tocat la mateixa sessió sense veure's. Quedar-se'n una
  // i llençar l'altra vol dir perdre entrenament que s'ha fet de veritat.
  describe('fusió entre dispositius', () => {
    function at(date: string, sets: number, ms: number): Workout {
      const w = makeWorkout('w1', date, Array.from({ length: sets }, () => ({ weight: 80, reps: 8 })));
      return { ...w, updatedAt: new Date(ms) };
    }

    it('es queda el costat amb més sèries del mateix exercici', () => {
      const merged = mergeWorkouts(at(thisMonth(), 4, 2000), at(thisMonth(), 2, 1000));
      expect(merged.entries[0].sets.length).toBe(4);
    });

    it('no perd un exercici que només és a l\'altre costat', () => {
      const mine   = at(thisMonth(), 3, 2000);
      const theirs = { ...at(thisMonth(), 1, 1000), entries: [
        { exerciseId: 'ex2', exerciseName: 'Dominades', sets: [{ weight: 0, reps: 10 }] },
      ] };

      const merged = mergeWorkouts(mine, theirs);

      expect(merged.entries.map(e => e.exerciseId).sort()).toEqual(['ex1', 'ex2']);
    });

    it('la marca de temps queda per davant de totes dues, encara que el rellotge vagi endarrerit', () => {
      const future = Date.now() + 60_000;
      const merged = mergeWorkouts(at(thisMonth(), 1, 1000), at(thisMonth(), 1, future));

      // Si no, la pujada tornaria a topar amb la mateixa versió del servidor i
      // el conflicte no s'acabaria mai.
      expect(merged.updatedAt!.getTime()).toBeGreaterThan(future);
    });

    it('resoldre un conflicte deixa la sessió pendent amb el que hi ha als dos costats', () => {
      store.put(at(thisMonth(), 3, 2000));
      store.ackUpsert('w1', 1);

      store.resolveConflict('w1', { ...at(thisMonth(), 1, 3000), entries: [
        { exerciseId: 'ex2', exerciseName: 'Dominades', sets: [{ weight: 0, reps: 10 }] },
      ] });

      expect(store.get('w1')!.entries.length).toBe(2);
      expect(store.isPending('w1')).toBeTrue();
    });
  });

  describe('recuperació manual', () => {
    it('torna a encuar una sessió que ja constava com a pujada', () => {
      store.put(makeWorkout('w1', thisMonth(), [{ weight: 80, reps: 8 }]));
      store.ackUpsert('w1', 1);
      expect(store.isPending('w1')).toBeFalse();

      expect(store.forceResync('w1')).toBeTrue();

      expect(store.isPending('w1')).toBeTrue();
      expect(store.get('w1')!.entries[0].sets.length).toBe(1);
    });

    it('diu que no quan aquí no hi ha res a pujar', () => {
      expect(store.forceResync('no-existeix')).toBeFalse();
    });
  });

  describe('espai', () => {
    it('allibera els mesos vells que ja són a la base de dades', () => {
      store.put(makeWorkout('vell', '2024-01-10'));
      store.ackUpsert('vell', 1);
      store.markReconciled('2024-01');
      store.prune();

      expect(localStorage.getItem('gymgoli_month_user-1_2024-01')).toBeNull();
    });

    it('no toca mai un mes vell amb res per pujar', () => {
      store.put(makeWorkout('vell', '2024-01-10'));   // pendent
      store.markReconciled('2024-01');
      store.prune();

      expect(localStorage.getItem('gymgoli_month_user-1_2024-01')).not.toBeNull();
    });

    // Suposar que un mes vell «ja hi és» i alliberar-lo és la manera més fàcil
    // d'esborrar l'única còpia bona que quedava d'un entrenament que mai va
    // pujar del tot.
    it('no toca un mes que no s\'ha comprovat contra el servidor', () => {
      store.put(makeWorkout('vell', '2024-01-10'));
      store.ackUpsert('vell', 1);
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

  // Una resposta de dos-cents entrenaments escrivia el mes sencer al disc i
  // repintava la interfície dues-centes vegades: d'aquí venien les
  // pampallugues mentre carregava.
  describe('escriptures agrupades', () => {
    it('una fusió sencera escriu una vegada i avisa una vegada', () => {
      const writes = spyOn(Storage.prototype, 'setItem').and.callThrough();
      let recomputes = 0;
      TestBed.runInInjectionContext(() => {
        const seen = computed(() => { recomputes++; return store.workouts().length; });
        seen();   // primera lectura, ja comptada

        const rows = Array.from({ length: 20 }, (_, i) =>
          makeWorkout(`w${i}`, thisMonth(String(10 + (i % 10)).padStart(2, '0'))));
        writes.calls.reset();
        store.mergeServerScope(rows, w => w.date.startsWith(thisMonth().substring(0, 7)), store.mark());

        expect(seen()).toBe(20);
      });

      // Un mes tocat, una escriptura; i una sola recomposició per als vint.
      expect(writes.calls.count()).toBe(1);
      expect(recomputes).toBe(2);
    });

    it('el mateix per a un grapat de files soltes', () => {
      const writes = spyOn(Storage.prototype, 'setItem').and.callThrough();
      store.applyServerRows([
        makeWorkout('a', thisMonth('11')),
        makeWorkout('b', thisMonth('12')),
        makeWorkout('c', thisMonth('13')),
      ]);

      expect(writes.calls.count()).toBe(1);
      expect(store.workouts().length).toBe(3);
    });

    it('registrar una sèrie continua guardant-se a l\'instant', () => {
      const writes = spyOn(Storage.prototype, 'setItem').and.callThrough();
      store.put(makeWorkout('w1', thisMonth(), [{ weight: 80, reps: 8 }]));

      expect(writes.calls.count()).toBeGreaterThan(0);
      expect(store.get('w1')!.entries[0].sets.length).toBe(1);
    });
  });

  // El magatzem és la còpia bona i tot el que hi entra és candidat a pujar-se:
  // una sessió sense sèries que hi entrés la buidaria al servidor.
  describe('sessions en mode targeta', () => {
    it('no deixa entrar una sessió sense sèries', () => {
      const summary: Workout = { ...makeWorkout('w1', thisMonth()), entries: [], entriesLoaded: false };
      store.applyServerRow(summary);

      expect(store.has('w1')).toBeFalse();
    });

    it('no trepitja la versió sencera que ja hi ha', () => {
      store.put(makeWorkout('w1', thisMonth(), [{ weight: 80, reps: 8 }]));
      store.ackUpsert('w1', 1);
      store.applyServerRow({ ...makeWorkout('w1', thisMonth()), entries: [], entriesLoaded: false });

      expect(store.get('w1')!.entries[0].sets.length).toBe(1);
    });
  });
});
