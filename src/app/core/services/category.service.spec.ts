import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { CategoryService } from './category.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

function categoryRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'cat-1', key: 'push', name: 'Empenta', icon: 'fitness_center', color: '#e57373',
    muscles: 'Pit · Espatlles · Tríceps', sort_order: 0, created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CategoryService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let categoriesData: Record<string, unknown>[];
  let exerciseCount: number;
  let insertShouldFail: boolean;
  let service: CategoryService;
  let supabaseMock: ReturnType<typeof buildMock>;

  function buildMock() {
    const insertSpy = jasmine.createSpy('insert');
    const updateSpy = jasmine.createSpy('update');
    const deleteSpy = jasmine.createSpy('delete');

    const selectChain = (): any => {
      const chain: any = {};
      chain.select = jasmine.createSpy('select').and.returnValue(chain);
      chain.eq     = jasmine.createSpy('eq').and.returnValue(chain);
      chain.order  = jasmine.createSpy('order').and.callFake(() =>
        Promise.resolve({ data: categoriesData, error: null }));
      return chain;
    };

    const countChain = (): any => {
      const chain: any = {};
      chain.eq = jasmine.createSpy('eq').and.callFake(() => chain);
      // Resolve once both .eq() calls have been chained — emulate a thenable.
      chain.then = (resolve: (v: { count: number }) => void) => resolve({ count: exerciseCount });
      return chain;
    };

    insertSpy.and.callFake(() => Promise.resolve(insertShouldFail ? { error: new Error('network error') } : { error: null }));

    const updateChain = (): any => {
      const chain: any = {};
      chain.eq = jasmine.createSpy('eq').and.callFake(() => chain);
      chain.then = (resolve: (v: { error: unknown }) => void) => resolve({ error: null });
      return chain;
    };
    updateSpy.and.callFake(() => updateChain());

    const deleteChain = (): any => {
      const chain: any = {};
      chain.eq = jasmine.createSpy('eq').and.callFake(() => chain);
      chain.then = (resolve: (v: { error: unknown }) => void) => resolve({ error: null });
      return chain;
    };
    deleteSpy.and.callFake(() => deleteChain());

    const fromSpy = jasmine.createSpy('from').and.callFake((table: string) => {
      if (table === 'exercise_categories') {
        return { select: () => selectChain(), insert: insertSpy, update: updateSpy, delete: deleteSpy };
      }
      if (table === 'exercises') {
        return { select: () => countChain() };
      }
      return { select: () => selectChain() };
    });

    return { client: { from: fromSpy }, fromSpy, insertSpy, updateSpy, deleteSpy };
  }

  function setup(): void {
    localStorage.clear();
    uid = signal<string | null>(null);
    categoriesData = [categoryRow()];
    exerciseCount = 0;
    insertShouldFail = false;
    supabaseMock = buildMock();

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: supabaseMock },
      ],
    });
    service = TestBed.inject(CategoryService);
    TestBed.flushEffects();
  }

  beforeEach(() => setup());
  afterEach(() => localStorage.clear());

  describe('loading', () => {
    it('loads categories for the authenticated user, sorted by sortOrder', async () => {
      categoriesData = [
        categoryRow({ id: 'c2', key: 'legs', sort_order: 2 }),
        categoryRow({ id: 'c1', key: 'push', sort_order: 0 }),
      ];
      uid.set('user-1');
      TestBed.flushEffects();
      await service.ensureLoaded();

      expect(service.categories().map(c => c.key)).toEqual(['push', 'legs']);
    });

    it('seeds the 3 default categories when the user has none yet', async () => {
      categoriesData = [];
      uid.set('user-1');
      TestBed.flushEffects();
      await service.ensureLoaded();

      expect(supabaseMock.insertSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('lookups', () => {
    it('resolves label/color/icon for a known key', async () => {
      uid.set('user-1');
      TestBed.flushEffects();
      await service.ensureLoaded();

      expect(service.label('push')).toBe('Empenta');
      expect(service.color('push')).toBe('#e57373');
      expect(service.icon('push')).toBe('fitness_center');
      expect(service.muscles('push')).toBe('Pit · Espatlles · Tríceps');
    });

    it('falls back gracefully for an unknown/deleted key instead of throwing', async () => {
      uid.set('user-1');
      TestBed.flushEffects();
      await service.ensureLoaded();

      expect(service.label('unknown')).toBe('unknown');
      expect(service.color('unknown')).toBe('#bbb');
      expect(service.icon('unknown')).toBe('fitness_center');
      expect(service.muscles('unknown')).toBeUndefined();
      expect(service.getByKey('unknown')).toBeUndefined();
    });
  });

  describe('createCategory()', () => {
    it('slugifies the name into a key and inserts it', async () => {
      uid.set('user-1');
      TestBed.flushEffects();
      await service.ensureLoaded();

      await service.createCategory({ name: 'Core i Mobilitat', icon: 'self_improvement', color: '#4db6ac' });

      expect(supabaseMock.insertSpy).toHaveBeenCalledWith(jasmine.objectContaining({
        key: 'core-i-mobilitat', name: 'Core i Mobilitat',
      }));
    });

    it('de-dupes the key when it already exists', async () => {
      categoriesData = [categoryRow({ key: 'core' })];
      uid.set('user-1');
      TestBed.flushEffects();
      await service.ensureLoaded();

      await service.createCategory({ name: 'Core', icon: 'self_improvement', color: '#4db6ac' });

      expect(supabaseMock.insertSpy).toHaveBeenCalledWith(jasmine.objectContaining({ key: 'core-2' }));
    });
  });

  describe('updateCategory()', () => {
    it('updates the row without touching its key', async () => {
      uid.set('user-1');
      TestBed.flushEffects();
      await service.ensureLoaded();

      await service.updateCategory('cat-1', { name: 'Nou nom' });

      expect(supabaseMock.updateSpy).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'Nou nom' }));
      expect(supabaseMock.updateSpy).not.toHaveBeenCalledWith(jasmine.objectContaining({ key: jasmine.anything() }));
    });
  });

  describe('deleteCategory()', () => {
    it('throws IN_USE and refuses to delete when an exercise still references the key', async () => {
      exerciseCount = 2;
      uid.set('user-1');
      TestBed.flushEffects();
      await service.ensureLoaded();

      await expectAsync(service.deleteCategory('cat-1')).toBeRejectedWithError('IN_USE');
      expect(supabaseMock.deleteSpy).not.toHaveBeenCalled();
    });

    it('deletes the category and updates local state when unused', async () => {
      exerciseCount = 0;
      uid.set('user-1');
      TestBed.flushEffects();
      await service.ensureLoaded();

      await service.deleteCategory('cat-1');

      expect(supabaseMock.deleteSpy).toHaveBeenCalled();
      expect(service.categories().find(c => c.id === 'cat-1')).toBeUndefined();
    });
  });
});
