import { Injectable, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ExerciseCategory } from '../models/exercise.model';
import { TemplateEntry, WorkoutTemplate } from '../models/template.model';

// ── Supabase row → typed WorkoutTemplate (snake_case keys) ──────────────────
function toTemplate(row: Record<string, unknown>): WorkoutTemplate {
  return {
    id:        row['id'] as string,
    name:      row['name'] as string,
    category:  row['category'] as ExerciseCategory | 'mixed',
    entries:   (row['entries'] as TemplateEntry[] | null) ?? [],
    createdAt: (row['created_at'] as string).split('T')[0],
    useCount:  (row['use_count'] as number | null) ?? undefined,
    lastUsed:  (row['last_used'] as string | null) ?? undefined,
  };
}

// ── localStorage cache row (camelCase keys) → typed WorkoutTemplate ─────────
function templateFromCache(raw: Record<string, unknown>): WorkoutTemplate {
  return {
    id:        raw['id'] as string,
    name:      raw['name'] as string,
    category:  raw['category'] as ExerciseCategory | 'mixed',
    entries:   (raw['entries'] as TemplateEntry[] | undefined) ?? [],
    createdAt: raw['createdAt'] as string,
    useCount:  (raw['useCount'] as number | undefined) ?? undefined,
    lastUsed:  (raw['lastUsed'] as string | undefined) ?? undefined,
  };
}

/** Pre-cloud-sync templates lived under this single, non-user-scoped key. */
const LEGACY_KEY = 'gymgoli_templates';

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _templates = signal<WorkoutTemplate[]>([]);
  readonly templates = this._templates.asReadonly();

  /** True once the user's templates have been fetched from Supabase at least once. */
  readonly isLoaded = signal(false);

  constructor() {
    // Serve the cached list instantly on login, then refresh from Supabase
    // in the background — same pattern as ExerciseService/SportService.
    effect(() => {
      const uid = this.auth.uid();
      this._templates.set([]);
      this.isLoaded.set(false);
      if (uid) {
        const cached = this._readFromStorage(uid);
        if (cached) this._templates.set(cached);
        this._load(uid);
      }
    });
  }

  private async _load(uid: string): Promise<void> {
    try {
      await this._migrateLegacyIfNeeded(uid);
      const { data, error } = await this.supabase
        .from('templates')
        .select('*')
        .eq('user_id', uid)
        .order('created_at');

      if (!error) {
        const templates = (data ?? []).map(r => toTemplate(r as Record<string, unknown>));
        this._templates.set(templates);
        this._writeToStorage(uid, templates);
      }
    } finally {
      this.isLoaded.set(true);
    }
  }

  /** One-time upload of templates saved locally before cloud sync existed. */
  private async _migrateLegacyIfNeeded(uid: string): Promise<void> {
    const migratedKey = `gymgoli_templates_migrated_${uid}`;
    try {
      if (localStorage.getItem(migratedKey) === 'true') return;
      const raw = localStorage.getItem(LEGACY_KEY);
      const legacy = raw ? (JSON.parse(raw) as WorkoutTemplate[]) : [];
      if (legacy.length > 0) {
        const rows = legacy.map(t => this._toRow(uid, t.name, t.category, t.entries));
        await this.supabase.from('templates').insert(rows);
      }
      localStorage.setItem(migratedKey, 'true');
    } catch { /* best-effort — retried on next load if it failed */ }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async create(name: string, category: ExerciseCategory | 'mixed', entries: TemplateEntry[]): Promise<WorkoutTemplate> {
    const uid = this._uid();
    const { data, error } = await this.supabase
      .from('templates')
      .insert(this._toRow(uid, name.trim(), category, entries))
      .select()
      .single();
    if (error) throw error;

    const t = toTemplate(data as Record<string, unknown>);
    const next = [...this._templates(), t];
    this._templates.set(next);
    this._writeToStorage(uid, next);
    return t;
  }

  async update(id: string, patch: Partial<Pick<WorkoutTemplate, 'name' | 'category' | 'entries'>>): Promise<void> {
    const uid = this._uid();
    const dbPatch: Record<string, unknown> = {};
    if (patch.name     !== undefined) dbPatch['name']     = patch.name;
    if (patch.category !== undefined) dbPatch['category'] = patch.category;
    if (patch.entries  !== undefined) dbPatch['entries']  = patch.entries;

    const { error } = await this.supabase.from('templates').update(dbPatch).eq('id', id).eq('user_id', uid);
    if (error) throw error;

    const next = this._templates().map(t => t.id === id ? { ...t, ...patch } : t);
    this._templates.set(next);
    this._writeToStorage(uid, next);
  }

  async delete(id: string): Promise<void> {
    const uid = this._uid();
    const { error } = await this.supabase.from('templates').delete().eq('id', id).eq('user_id', uid);
    if (error) throw error;

    const next = this._templates().filter(t => t.id !== id);
    this._templates.set(next);
    this._writeToStorage(uid, next);
  }

  /** Bumps useCount/lastUsed. Fire-and-forget friendly: updates local state
   *  immediately and syncs to Supabase best-effort in the background, so a
   *  transient network failure never blocks starting a workout. */
  async recordUse(id: string): Promise<void> {
    const uid = this._uid();
    const today = new Date().toISOString().split('T')[0];
    const nextCount = (this._templates().find(t => t.id === id)?.useCount ?? 0) + 1;

    const next = this._templates().map(t =>
      t.id === id ? { ...t, useCount: nextCount, lastUsed: today } : t
    );
    this._templates.set(next);
    this._writeToStorage(uid, next);

    try {
      await this.supabase.from('templates')
        .update({ use_count: nextCount, last_used: today })
        .eq('id', id).eq('user_id', uid);
    } catch { /* best-effort — local state already reflects the use */ }
  }

  forCategory(category: ExerciseCategory | 'mixed'): WorkoutTemplate[] {
    return this._templates().filter(t => t.category === category || t.category === 'mixed');
  }

  private _toRow(uid: string, name: string, category: ExerciseCategory | 'mixed', entries: TemplateEntry[]): Record<string, unknown> {
    return { user_id: uid, name, category, entries };
  }

  private _uid(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    return uid;
  }

  // ── localStorage cache ────────────────────────────────────────────────────

  private _lsKey(uid: string): string { return `gymgoli_templates_${uid}`; }

  private _writeToStorage(uid: string, templates: WorkoutTemplate[]): void {
    try { localStorage.setItem(this._lsKey(uid), JSON.stringify(templates)); } catch { /* quota exceeded — non-fatal */ }
  }

  private _readFromStorage(uid: string): WorkoutTemplate[] | null {
    try {
      const raw = localStorage.getItem(this._lsKey(uid));
      if (!raw) return null;
      return (JSON.parse(raw) as Record<string, unknown>[]).map(templateFromCache);
    } catch { return null; }
  }
}
