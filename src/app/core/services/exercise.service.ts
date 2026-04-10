import { Injectable, Signal, effect, inject, signal } from '@angular/core';

import {
  DEFAULT_EXERCISES,
  Exercise,
  ExerciseCategory,
} from '../models/exercise.model';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class ExerciseService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private _exercises = signal<Exercise[]>([]);
  readonly exercises: Signal<Exercise[]> = this._exercises.asReadonly();

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      if (uid) this._load(uid);
      else     this._exercises.set([]);
    });
  }

  // ── Load ──────────────────────────────────────────────────────

  private async _load(uid: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('exercises')
      .select('*')
      .eq('user_id', uid)
      .order('name');

    if (error) { console.error('ExerciseService._load', error); return; }

    this._exercises.set(
      (data ?? []).map(r => ({
        id:          r['id'],
        name:        r['name'],
        category:    r['category'] as ExerciseCategory,
        subcategory: r['subcategory'] ?? undefined,
        notes:       r['notes'] ?? undefined,
        createdAt:   new Date(r['created_at']),
      }))
    );
  }

  // ── Public API ────────────────────────────────────────────────

  getById(id: string): Exercise | undefined {
    return this._exercises().find(e => e.id === id);
  }

  readonly byCategory = (category: ExerciseCategory) =>
    this._exercises().filter(e => e.category === category);

  async create(data: Omit<Exercise, 'id' | 'createdAt'>): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');

    const clean: Record<string, unknown> = { user_id: uid, name: data.name, category: data.category };
    if (data.subcategory) clean['subcategory'] = data.subcategory;
    if (data.notes)       clean['notes']       = data.notes;

    const { data: inserted, error } = await this.supabase
      .from('exercises')
      .insert(clean)
      .select()
      .single();

    if (error) throw error;

    const newEx: Exercise = {
      id:          inserted['id'],
      name:        inserted['name'],
      category:    inserted['category'] as ExerciseCategory,
      subcategory: inserted['subcategory'] ?? undefined,
      notes:       inserted['notes'] ?? undefined,
      createdAt:   new Date(inserted['created_at']),
    };
    this._exercises.set(
      [...this._exercises(), newEx].sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  async update(id: string, data: Partial<Omit<Exercise, 'id' | 'createdAt'>>): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');

    const patch: Record<string, unknown> = {};
    if (data.name        !== undefined) patch['name']        = data.name;
    if (data.category    !== undefined) patch['category']    = data.category;
    if (data.subcategory !== undefined) patch['subcategory'] = data.subcategory;
    else                                patch['subcategory'] = null;
    if (data.notes       !== undefined) patch['notes']       = data.notes;
    else                                patch['notes']       = null;

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

  async seedIfEmpty(uid: string): Promise<void> {
    const { count, error } = await this.supabase
      .from('exercises')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid);

    if (error || (count ?? 0) > 0) return;

    const rows = DEFAULT_EXERCISES.map(e => {
      const r: Record<string, unknown> = { user_id: uid, name: e.name, category: e.category };
      if (e.subcategory) r['subcategory'] = e.subcategory;
      return r;
    });

    await this.supabase.from('exercises').insert(rows);
    await this._load(uid);
  }
}
