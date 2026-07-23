import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import {
  DEFAULT_TRAINING_TYPES,
  TrainingType,
  setTrainingTypeRegistry,
} from '../models/training-type.model';

function toTrainingType(row: Record<string, unknown>): TrainingType {
  return {
    id:        row['id'] as string,
    name:      row['name'] as string,
    icon:      (row['icon'] as string | null) ?? 'fitness_center',
    color:     (row['color'] as string | null) ?? '#006874',
    muscles:   (row['muscles'] as string | null) ?? undefined,
    builtIn:   DEFAULT_TRAINING_TYPES.some(d => d.id === row['id']),
    createdAt: row['created_at'] ? new Date(row['created_at'] as string) : undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class TrainingTypeService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _types = signal<TrainingType[]>(DEFAULT_TRAINING_TYPES.map(t => ({ ...t })));
  /** The user's full ordered list of training types (built-ins + custom). */
  readonly types = this._types.asReadonly();

  private readonly _loaded = signal(false);
  /** True once the user's types have been fetched at least once. */
  readonly isLoaded = this._loaded.asReadonly();
  private _loadPromise: Promise<void> | null = null;

  constructor() {
    // Keep the synchronous runtime registry in sync with the loaded list so the
    // colour/label/icon accessors resolve custom types everywhere in the app.
    effect(() => setTrainingTypeRegistry(this._types()));

    effect(() => {
      const uid = this.auth.uid();
      this._types.set(DEFAULT_TRAINING_TYPES.map(t => ({ ...t })));
      this._loaded.set(false);
      this._loadPromise = null;
      if (uid) {
        const cached = this._readFromStorage(uid);
        if (cached?.length) this._types.set(cached);
        this._load(uid);
      }
    });
  }

  // ── Lazy init ──────────────────────────────────────────────────────────────

  ensureLoaded(): Promise<void> {
    if (this._loaded()) return Promise.resolve();
    if (this._loadPromise) return this._loadPromise;
    const uid = this.auth.uid();
    this._loadPromise = (uid ? this._load(uid) : Promise.resolve())
      .finally(() => { this._loadPromise = null; });
    return this._loadPromise;
  }

  // ── Load / seed ──────────────────────────────────────────────────────────

  private async _load(uid: string): Promise<void> {
    try {
      const { data } = await this.supabase
        .from('training_types')
        .select('*')
        .eq('user_id', uid)
        .order('sort_order')
        .order('created_at');

      const types = (data ?? []).map(r => toTrainingType(r as Record<string, unknown>));
      if (types.length === 0) {
        await this._seedDefaults(uid);
      } else {
        this._types.set(types);
        this._writeToStorage(uid, types);
      }
    } finally {
      this._loaded.set(true);
    }
  }

  private async _seedDefaults(uid: string): Promise<void> {
    await this.supabase.from('training_types').insert(
      DEFAULT_TRAINING_TYPES.map((t, i) => ({
        user_id: uid, id: t.id, name: t.name, icon: t.icon,
        color: t.color, muscles: t.muscles ?? null, sort_order: i,
      })),
    );
    const { data } = await this.supabase
      .from('training_types').select('*').eq('user_id', uid).order('sort_order');
    const types = (data ?? []).map(r => toTrainingType(r as Record<string, unknown>));
    const next = types.length ? types : DEFAULT_TRAINING_TYPES.map(t => ({ ...t }));
    this._types.set(next);
    this._writeToStorage(uid, next);
  }

  /** How many built-in defaults the user is missing (matched by id) — lets
   *  existing users pull in the defaults if they'd removed them. */
  readonly missingDefaultCount = computed(() => {
    const have = new Set(this._types().map(t => t.id));
    return DEFAULT_TRAINING_TYPES.filter(t => !have.has(t.id)).length;
  });

  /** Adds any missing built-in defaults without touching the user's own. */
  async addMissingDefaults(): Promise<number> {
    const uid = this._uid();
    const have = new Set(this._types().map(t => t.id));
    const missing = DEFAULT_TRAINING_TYPES.filter(t => !have.has(t.id));
    if (missing.length === 0) return 0;
    const base = this._types().length;
    await this.supabase.from('training_types').insert(
      missing.map((t, i) => ({
        user_id: uid, id: t.id, name: t.name, icon: t.icon,
        color: t.color, muscles: t.muscles ?? null, sort_order: base + i,
      })),
    );
    await this._load(uid);
    return missing.length;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async createType(payload: Pick<TrainingType, 'name' | 'icon' | 'color' | 'muscles'>): Promise<void> {
    const uid = this._uid();
    const id  = crypto.randomUUID();
    const sortOrder = this._types().length;
    const { error } = await this.supabase.from('training_types').insert({
      user_id: uid, id, name: payload.name, icon: payload.icon,
      color: payload.color, muscles: payload.muscles ?? null, sort_order: sortOrder,
    });
    if (error) throw error;
    await this._load(uid);
  }

  async updateType(id: string, payload: Partial<Pick<TrainingType, 'name' | 'icon' | 'color' | 'muscles'>>): Promise<void> {
    const uid = this._uid();
    const dbPayload: Record<string, unknown> = {};
    if (payload.name    !== undefined) dbPayload['name']    = payload.name;
    if (payload.icon    !== undefined) dbPayload['icon']    = payload.icon;
    if (payload.color   !== undefined) dbPayload['color']   = payload.color;
    if (payload.muscles !== undefined) dbPayload['muscles'] = payload.muscles ?? null;

    const { error } = await this.supabase.from('training_types').update(dbPayload)
      .eq('id', id).eq('user_id', uid);
    if (error) throw error;
    await this._load(uid);
  }

  async deleteType(id: string): Promise<void> {
    const uid = this._uid();
    const { error } = await this.supabase.from('training_types')
      .delete().eq('id', id).eq('user_id', uid);
    if (error) throw error;
    const updated = this._types().filter(t => t.id !== id);
    this._types.set(updated);
    this._writeToStorage(uid, updated);
  }

  // ── localStorage cache ────────────────────────────────────────────────────

  private _lsKey(uid: string): string { return `gymgoli_training_types_${uid}`; }

  private _writeToStorage(uid: string, types: TrainingType[]): void {
    try { localStorage.setItem(this._lsKey(uid), JSON.stringify(types)); } catch { /* quota — non-fatal */ }
  }

  private _readFromStorage(uid: string): TrainingType[] | null {
    try {
      const raw = localStorage.getItem(this._lsKey(uid));
      if (!raw) return null;
      return (JSON.parse(raw) as Record<string, unknown>[]).map(toTrainingType);
    } catch { return null; }
  }

  private _uid(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    return uid;
  }
}
