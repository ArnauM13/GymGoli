import { TestBed } from '@angular/core/testing';

import { TemplateService } from './template.service';
import { TemplateEntry } from '../models/template.model';

const LS_KEY = 'gymgoli_templates';

const ENTRY: TemplateEntry = { exerciseId: 'ex1', exerciseName: 'Press banca' };

describe('TemplateService', () => {
  beforeEach(() => localStorage.removeItem(LS_KEY));
  afterEach(() => localStorage.removeItem(LS_KEY));

  it('starts empty when localStorage has nothing stored', () => {
    const service = TestBed.inject(TemplateService);
    expect(service.templates()).toEqual([]);
  });

  it('loads previously persisted templates from localStorage', () => {
    const stored = [{ id: 't1', name: 'Push A', category: 'push', entries: [], createdAt: '2024-01-01' }];
    localStorage.setItem(LS_KEY, JSON.stringify(stored));
    const service = TestBed.inject(TemplateService);
    expect(service.templates().map(t => t.name)).toEqual(['Push A']);
  });

  it('recovers gracefully from corrupted localStorage data', () => {
    localStorage.setItem(LS_KEY, '{not valid json');
    const service = TestBed.inject(TemplateService);
    expect(service.templates()).toEqual([]);
  });

  describe('create()', () => {
    it('adds a new template with a generated id and trimmed name', () => {
      const service = TestBed.inject(TemplateService);
      const t = service.create('  Push A  ', 'push', [ENTRY]);

      expect(t.name).toBe('Push A');
      expect(t.id).toBeTruthy();
      expect(service.templates()).toContain(t);
    });

    it('persists the new template to localStorage', () => {
      const service = TestBed.inject(TemplateService);
      service.create('Push A', 'push', [ENTRY]);

      const stored = JSON.parse(localStorage.getItem(LS_KEY)!);
      expect(stored.length).toBe(1);
      expect(stored[0].name).toBe('Push A');
    });
  });

  describe('update()', () => {
    it('patches only the matching template', () => {
      const service = TestBed.inject(TemplateService);
      const t1 = service.create('Push A', 'push', []);
      service.create('Pull A', 'pull', []);

      service.update(t1.id, { name: 'Push A+' });

      const names = service.templates().map(t => t.name);
      expect(names).toContain('Push A+');
      expect(names).toContain('Pull A');
    });
  });

  describe('delete()', () => {
    it('removes the template and persists the change', () => {
      const service = TestBed.inject(TemplateService);
      const t = service.create('Push A', 'push', []);

      service.delete(t.id);

      expect(service.templates()).toEqual([]);
      expect(JSON.parse(localStorage.getItem(LS_KEY)!)).toEqual([]);
    });
  });

  describe('recordUse()', () => {
    it('increments useCount and stamps lastUsed with today', () => {
      const service = TestBed.inject(TemplateService);
      const t = service.create('Push A', 'push', []);

      service.recordUse(t.id);
      service.recordUse(t.id);

      const updated = service.templates().find(x => x.id === t.id)!;
      expect(updated.useCount).toBe(2);
      expect(updated.lastUsed).toBe(new Date().toISOString().split('T')[0]);
    });
  });

  describe('forCategory()', () => {
    it('returns templates matching the category plus any "mixed" templates', () => {
      const service = TestBed.inject(TemplateService);
      service.create('Push A', 'push', []);
      service.create('Pull A', 'pull', []);
      service.create('Full body', 'mixed', []);

      const names = service.forCategory('push').map(t => t.name);
      expect(names).toContain('Push A');
      expect(names).toContain('Full body');
      expect(names).not.toContain('Pull A');
    });
  });
});
