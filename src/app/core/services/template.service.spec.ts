import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';

import { TemplateService } from './template.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { TemplateEntry } from '../models/template.model';

const ENTRY: TemplateEntry = { exerciseId: 'ex1', exerciseName: 'Press banca' };
const LS_KEY = (uid: string) => `gymgoli_templates_${uid}`;
const LEGACY_KEY = 'gymgoli_templates';

function row(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 't1', name: 'Push A', category: 'push', entries: [],
    created_at: '2024-01-01T00:00:00.000Z', use_count: null, last_used: null,
    ...overrides,
  };
}

describe('TemplateService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let selectData: Record<string, unknown>[];
  let insertData: Record<string, unknown>;
  let service: TemplateService;
  let supabaseMock: ReturnType<typeof buildMock>;

  function buildMock() {
    const insertSpy = jasmine.createSpy('insert');
    const updateSpy = jasmine.createSpy('update');
    const deleteSpy = jasmine.createSpy('delete');
    const selectSpy = jasmine.createSpy('select');
    const fromSpy   = jasmine.createSpy('from');

    const selectChain: any = {
      eq:    jasmine.createSpy('eq'),
      order: jasmine.createSpy('order').and.callFake(() =>
        Promise.resolve({ data: selectData, error: null })),
    };
    selectChain.eq.and.returnValue(selectChain);
    selectSpy.and.returnValue(selectChain);

    insertSpy.and.callFake(() => ({
      select: jasmine.createSpy('select').and.callFake(() => ({
        single: jasmine.createSpy('single').and.callFake(() =>
          Promise.resolve({ data: insertData, error: null })),
      })),
      then: (resolve: (v: { error: unknown }) => void) => resolve({ error: null }),
    }));

    const mutateChain = (): any => {
      const chain: any = {
        eq: jasmine.createSpy('eq'),
        then: (resolve: (v: { error: unknown }) => void) => resolve({ error: null }),
      };
      chain.eq.and.returnValue(chain);
      return chain;
    };
    updateSpy.and.callFake(() => mutateChain());
    deleteSpy.and.callFake(() => mutateChain());

    fromSpy.and.returnValue({ select: selectSpy, insert: insertSpy, update: updateSpy, delete: deleteSpy });

    return { client: { from: fromSpy } , fromSpy, insertSpy, updateSpy, deleteSpy };
  }

  function setup(): void {
    localStorage.clear();
    uid = signal<string | null>(null);
    selectData = [];
    insertData = row();
    supabaseMock = buildMock();

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: supabaseMock },
      ],
    });
    service = TestBed.inject(TemplateService);
    TestBed.flushEffects();
  }

  beforeEach(() => setup());
  afterEach(() => localStorage.clear());

  it('starts empty and not loaded before a user is set', () => {
    expect(service.templates()).toEqual([]);
    expect(service.isLoaded()).toBeFalse();
  });

  it('serves the localStorage cache instantly, before Supabase responds', fakeAsync(() => {
    localStorage.setItem(LS_KEY('user-1'), JSON.stringify([
      { id: 't1', name: 'Cached', category: 'push', entries: [], createdAt: '2024-01-01' },
    ]));
    uid.set('user-1');
    TestBed.flushEffects();

    expect(service.templates().map(t => t.name)).toEqual(['Cached']);
    tick();
  }));

  it('replaces the list with Supabase data once it resolves, and persists it', fakeAsync(() => {
    selectData = [row({ id: 't2', name: 'From cloud' })];
    uid.set('user-1');
    TestBed.flushEffects();
    tick();

    expect(service.templates().map(t => t.name)).toEqual(['From cloud']);
    expect(service.isLoaded()).toBeTrue();
    const stored = JSON.parse(localStorage.getItem(LS_KEY('user-1'))!);
    expect(stored[0].name).toBe('From cloud');
  }));

  describe('legacy local-only migration', () => {
    it('uploads templates found under the old global key on first load', fakeAsync(() => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify([
        { id: 'old1', name: 'Legacy template', category: 'push', entries: [], createdAt: '2023-01-01' },
      ]));
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      expect(supabaseMock.insertSpy).toHaveBeenCalled();
      const payload = supabaseMock.insertSpy.calls.mostRecent().args[0];
      expect(payload[0].name).toBe('Legacy template');
      expect(payload[0].user_id).toBe('user-1');
    }));

    it('does not re-upload on a later load once migrated', fakeAsync(() => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify([
        { id: 'old1', name: 'Legacy template', category: 'push', entries: [], createdAt: '2023-01-01' },
      ]));
      localStorage.setItem('gymgoli_templates_migrated_user-1', 'true');
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      expect(supabaseMock.insertSpy).not.toHaveBeenCalled();
    }));
  });

  describe('create()', () => {
    it('inserts via Supabase and adds the returned template locally', fakeAsync(async () => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      insertData = row({ id: 'new-id', name: 'Push A' });
      const t = await service.create('  Push A  ', 'push', [ENTRY]);

      expect(t.name).toBe('Push A');
      expect(service.templates().map(x => x.id)).toContain('new-id');
      const stored = JSON.parse(localStorage.getItem(LS_KEY('user-1'))!);
      expect(stored.some((x: any) => x.id === 'new-id')).toBeTrue();
    }));
  });

  describe('update()', () => {
    it('patches only the matching template', fakeAsync(async () => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      insertData = row({ id: 't1', name: 'Push A' });
      await service.create('Push A', 'push', []);
      insertData = row({ id: 't2', name: 'Pull A', category: 'pull' });
      await service.create('Pull A', 'pull', []);

      await service.update('t1', { name: 'Push A+' });

      const names = service.templates().map(t => t.name);
      expect(names).toContain('Push A+');
      expect(names).toContain('Pull A');
    }));
  });

  describe('delete()', () => {
    it('removes the template and updates the cache', fakeAsync(async () => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      insertData = row({ id: 't1' });
      await service.create('Push A', 'push', []);

      await service.delete('t1');

      expect(service.templates()).toEqual([]);
      expect(JSON.parse(localStorage.getItem(LS_KEY('user-1'))!)).toEqual([]);
    }));
  });

  describe('recordUse()', () => {
    it('increments useCount and stamps lastUsed with today, optimistically', fakeAsync(async () => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      insertData = row({ id: 't1' });
      await service.create('Push A', 'push', []);

      await service.recordUse('t1');
      await service.recordUse('t1');

      const updated = service.templates().find(x => x.id === 't1')!;
      expect(updated.useCount).toBe(2);
      expect(updated.lastUsed).toBe(new Date().toISOString().split('T')[0]);
    }));
  });

  describe('forCategory()', () => {
    it('returns templates matching the category plus any "mixed" templates', fakeAsync(async () => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      insertData = row({ id: 't1', name: 'Push A', category: 'push' });
      await service.create('Push A', 'push', []);
      insertData = row({ id: 't2', name: 'Pull A', category: 'pull' });
      await service.create('Pull A', 'pull', []);
      insertData = row({ id: 't3', name: 'Full body', category: 'mixed' });
      await service.create('Full body', 'mixed', []);

      const names = service.forCategory('push').map(t => t.name);
      expect(names).toContain('Push A');
      expect(names).toContain('Full body');
      expect(names).not.toContain('Pull A');
    }));
  });
});
