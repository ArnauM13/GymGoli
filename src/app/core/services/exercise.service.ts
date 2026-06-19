import { Injectable, Signal, effect, inject, signal } from '@angular/core';

import {
  DEFAULT_EXERCISES,
  Exercise,
  ExerciseCategory,
  ExerciseSubcategory,
} from '../models/exercise.model';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

function toExercise(r: Record<string, unknown>): Exercise {
  const sMin = r['sets_min'] as number | null;
  const sMax = r['sets_max'] as number | null;
  const rMin = r['reps_min'] as number | null;
  const rMax = r['reps_max'] as number | null;
  return {
    id:          r['id'] as string,
    name:        r['name'] as string,
    category:    r['category'] as ExerciseCategory,
    subcategory: (r['subcategory'] as ExerciseSubcategory | null) ?? undefined,
    notes:       (r['notes'] as string | null) ?? undefined,
    muscles:     (r['muscles'] as string[] | null) ?? undefined,
    description: (r['description'] as string | null) ?? undefined,
    setsRange:   sMin != null && sMax != null ? [sMin, sMax] : undefined,
    repsRange:   rMin != null && rMax != null ? [rMin, rMax] : undefined,
    createdAt:   new Date(r['created_at'] as string),
  };
}

@Injectable({ providedIn: 'root' })
export class ExerciseService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private _exercises  = signal<Exercise[]>([]);
  readonly exercises: Signal<Exercise[]> = this._exercises.asReadonly();

  // Exposed so components can show a loading state while exercises are fetching
  readonly isLoaded = signal(false);
  private _loadPromise: Promise<void> | null = null;

  constructor() {
    // Clear cache on logout — don't auto-reload on login (lazy)
    effect(() => {
      if (!this.auth.uid()) {
        this._exercises.set([]);
        this.isLoaded.set(false);
        this._loadPromise = null;
      }
    });
  }

  // ── Lazy initialisation — call once per feature that needs exercises ──────

  ensureLoaded(): Promise<void> {
    if (this.isLoaded()) return Promise.resolve();
    if (this._loadPromise)  return this._loadPromise;
    this._loadPromise = this._initLoad().finally(() => { this._loadPromise = null; });
    return this._loadPromise;
  }

  private async _initLoad(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    await this._seedIfNeeded(uid);
    await this._fetch(uid);
    this.isLoaded.set(true);
  }

  private async _fetch(uid: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('exercises')
      .select('*')
      .eq('user_id', uid)
      .order('name');

    if (error) return;
    this._exercises.set((data ?? []).map(r => toExercise(r as Record<string, unknown>)));
  }

  // Inserts default exercises the very first time a user has none
  private async _seedIfNeeded(uid: string): Promise<void> {
    const { count, error } = await this.supabase
      .from('exercises')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid);

    if (error || (count ?? 0) > 0) return;

    const rows = DEFAULT_EXERCISES.map(e => this._toRow(uid, e));
    await this.supabase.from('exercises').insert(rows);
  }

  // ── Public API ────────────────────────────────────────────────

  getById(id: string): Exercise | undefined {
    return this._exercises().find(e => e.id === id);
  }

  readonly byCategory = (category: ExerciseCategory) =>
    this._exercises().filter(e => e.category === category);

  async create(data: Omit<Exercise, 'id' | 'createdAt'>): Promise<Exercise> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');

    const clean = this._toRow(uid, data);
    const { data: inserted, error } = await this.supabase
      .from('exercises')
      .insert(clean)
      .select()
      .single();

    if (error) throw error;

    const newEx = toExercise(inserted as Record<string, unknown>);
    this._exercises.set(
      [...this._exercises(), newEx].sort((a, b) => a.name.localeCompare(b.name))
    );
    return newEx;
  }

  async update(id: string, data: Partial<Omit<Exercise, 'id' | 'createdAt'>>): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');

    const patch: Record<string, unknown> = {};
    if (data.name        !== undefined) patch['name']        = data.name;
    if (data.category    !== undefined) patch['category']    = data.category;
    patch['subcategory'] = data.subcategory ?? null;
    patch['notes']       = data.notes ?? null;
    patch['muscles']     = data.muscles?.length ? data.muscles : null;
    patch['description'] = data.description ?? null;
    patch['sets_min']    = data.setsRange?.[0] ?? null;
    patch['sets_max']    = data.setsRange?.[1] ?? null;
    patch['reps_min']    = data.repsRange?.[0] ?? null;
    patch['reps_max']    = data.repsRange?.[1] ?? null;

    const { error } = await this.supabase
      .from('exercises')
      .update(patch)
      .eq('id', id)
      .eq('user_id', uid);

    if (error) throw error;

    this._exercises.set(
      this._exercises()
        .map(e => e.id === id ? { ...e, ...data } : e)
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  async delete(id: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');

    const { error } = await this.supabase
      .from('exercises')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);

    if (error) throw error;
    this._exercises.set(this._exercises().filter(e => e.id !== id));
  }

  private _toRow(uid: string, e: Omit<Exercise, 'id' | 'createdAt'>): Record<string, unknown> {
    return {
      user_id:     uid,
      name:        e.name,
      category:    e.category,
      subcategory: e.subcategory ?? null,
      notes:       e.notes ?? null,
      muscles:     e.muscles?.length ? e.muscles : null,
      description: e.description ?? null,
      sets_min:    e.setsRange?.[0] ?? null,
      sets_max:    e.setsRange?.[1] ?? null,
      reps_min:    e.repsRange?.[0] ?? null,
      reps_max:    e.repsRange?.[1] ?? null,
    };
  }
}
