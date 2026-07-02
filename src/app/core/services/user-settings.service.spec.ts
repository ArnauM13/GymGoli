import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';

import { UserSettingsService } from './user-settings.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { DEFAULT_USER_SETTINGS } from '../models/user-settings.model';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../models/weekly-plan.model';

interface SelectResult { data: { settings: Record<string, unknown> } | null; error: unknown | null; }

// `getSelectResult` is read lazily (at call time, not at mock-creation time) so
// tests can reassign the outer `selectResult` variable *after* setup() has run,
// as long as it happens before the effect actually triggers the Supabase call.
function makeSupabaseMock(getSelectResult: () => SelectResult) {
  const upsertSpy: jasmine.Spy = jasmine.createSpy('upsert').and.resolveTo({ error: null });
  const builder = {
    select:      jasmine.createSpy('select'),
    eq:          jasmine.createSpy('eq'),
    maybeSingle: jasmine.createSpy('maybeSingle').and.callFake(() => Promise.resolve(getSelectResult())),
    upsert:      upsertSpy,
  };
  builder.select.and.returnValue(builder);
  builder.eq.and.returnValue(builder);
  const fromSpy = jasmine.createSpy('from').and.returnValue(builder);
  return { supabase: { client: { from: fromSpy } }, upsertSpy, fromSpy };
}

const LS_KEY = (uid: string) => `gymgoli_settings_${uid}`;

describe('UserSettingsService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let selectResult: SelectResult;
  let upsertSpy: jasmine.Spy;
  let fromSpy: jasmine.Spy;
  let service: UserSettingsService;

  function setup(): void {
    localStorage.clear();
    uid = signal<string | null>(null);
    selectResult = { data: null, error: null };

    const mock = makeSupabaseMock(() => selectResult);
    upsertSpy = mock.upsertSpy;
    fromSpy   = mock.fromSpy;

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: mock.supabase },
      ],
    });

    service = TestBed.inject(UserSettingsService);
    TestBed.flushEffects();
  }

  beforeEach(() => setup());
  afterEach(() => localStorage.clear());

  it('starts with the default settings and nothing loaded', () => {
    expect(service.settings()).toEqual(DEFAULT_USER_SETTINGS);
    expect(service.loaded()).toBeFalse();
  });

  it('weeklyPlan() falls back to EMPTY_WEEKLY_PLAN when unset', () => {
    expect(service.weeklyPlan()).toEqual(EMPTY_WEEKLY_PLAN);
  });

  describe('loading on login', () => {
    it('immediately resets to defaults when the uid changes, before the async load resolves', fakeAsync(() => {
      localStorage.setItem(LS_KEY('user-1'), JSON.stringify({ weightUnit: 'lb' }));
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      uid.set('user-2');
      TestBed.flushEffects();
      // Synchronous reset happens before user-2's data (if any) has loaded.
      expect(service.settings()).toEqual(DEFAULT_USER_SETTINGS);
      tick();
    }));

    it('reads cached settings from localStorage before Supabase responds', fakeAsync(() => {
      localStorage.setItem(LS_KEY('user-1'), JSON.stringify({ weightUnit: 'lb' }));
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      expect(service.weightUnit()).toBe('lb');
      expect(service.loaded()).toBeTrue();
    }));

    it('merges Supabase settings over defaults and marks the service as loaded', fakeAsync(() => {
      selectResult = { data: { settings: { weightUnit: 'lb', fitnessGoal: 'strength' } }, error: null };
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      expect(service.weightUnit()).toBe('lb');
      expect(service.fitnessGoal()).toBe('strength');
      expect(service.loaded()).toBeTrue();
    }));

    it('persists the Supabase-merged settings back to localStorage', fakeAsync(() => {
      selectResult = { data: { settings: { weightUnit: 'lb' } }, error: null };
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      const stored = JSON.parse(localStorage.getItem(LS_KEY('user-1'))!);
      expect(stored.weightUnit).toBe('lb');
    }));

    it('falls back to defaults and still marks as loaded when Supabase has no row', fakeAsync(() => {
      selectResult = { data: null, error: null };
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      expect(service.settings()).toEqual(DEFAULT_USER_SETTINGS);
      expect(service.loaded()).toBeTrue();
    }));
  });

  describe('update()', () => {
    it('does nothing when there is no authenticated user', async () => {
      await service.update({ weightUnit: 'lb' });
      expect(upsertSpy).not.toHaveBeenCalled();
      expect(service.weightUnit()).toBe('kg');
    });

    it('applies the patch locally and persists to localStorage + Supabase', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      service.update({ weightUnit: 'lb' });
      // Local state + localStorage update happen synchronously, before the Supabase await.
      expect(service.weightUnit()).toBe('lb');
      const stored = JSON.parse(localStorage.getItem(LS_KEY('user-1'))!);
      expect(stored.weightUnit).toBe('lb');
      tick();

      expect(fromSpy).toHaveBeenCalledWith('user_settings');
      expect(upsertSpy).toHaveBeenCalled();
      const payload = upsertSpy.calls.mostRecent().args[0];
      expect(payload.user_id).toBe('user-1');
      expect(payload.settings.weightUnit).toBe('lb');
    }));
  });

  describe('updateWeeklyPlan()', () => {
    it('persists the plan and exposes it via weeklyPlan()', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      const plan: WeeklyPlan = { recurring: true, days: [[{ type: 'gym', category: 'push' }], [], [], [], [], [], []] };
      service.updateWeeklyPlan(plan);
      tick();

      expect(service.weeklyPlan()).toEqual(plan);
    }));
  });
});
