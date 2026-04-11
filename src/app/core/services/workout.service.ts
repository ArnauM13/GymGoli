import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';

import { ExerciseService } from './exercise.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { FeelingLevel, Workout, WorkoutEntry, WorkoutSet } from '../models/workout.model';

// ── Supabase row → typed Workout ────────────────────────────────────────────
function toWorkout(row: Record<string, unknown>): Workout {
  return {
    id:         row['id'] as string,
    date:       row['date'] as string,
    category:   (row['category'] as string | undefined) ?? undefined,
    categories: (row['categories'] as string[] | undefined) ?? [],
    entries:    (row['entries'] as WorkoutEntry[] | undefined) ?? [],
    notes:      (row['notes'] as string | undefined) ?? undefined,
    createdAt:  new Date(row['created_at'] as string),
  };
}

@Injectable({ providedIn: 'root' })
export class WorkoutService {
  private supabase        = inject(SupabaseService).client;
  private auth            = inject(AuthService);
  private exerciseService = inject(ExerciseService);

  private readonly _todayStr = new Date().toISOString().split('T')[0];

  // ── Single unified cache (all dates including today) ─────────────────────
  private readonly _monthCache = new Map<string, Workout[]>();
  private readonly _historical = signal<Workout[]>([]);
  private _allLoaded = false;
  private _realtimeChannel: RealtimeChannel | null = null;

  readonly isLoading = signal(false);

  // ── Public signals ───────────────────────────────────────────────────────

  readonly todayWorkout = computed((): Workout | null =>
    this._historical().find(w => w.date === this._todayStr) ?? null
  );

  readonly workouts = computed((): Workout[] =>
    [...this._historical()].sort((a, b) => b.date.localeCompare(a.date))
  );

  readonly pastWorkouts = computed(() =>
    this.workouts().filter(w => w.date !== this._todayStr)
  );

  readonly exercisesWithData = computed((): Set<string> =>
    new Set(
      this.workouts()
        .flatMap(w => w.entries.filter(e => e.sets.length > 0).map(e => e.exerciseId))
    )
  );

  // ── Constructor ──────────────────────────────────────────────────────────
  constructor() {
    effect(() => {
      const uid = this.auth.uid();

      this._realtimeChannel?.unsubscribe();
      this._realtimeChannel = null;
      this._monthCache.clear();
      this._allLoaded = false;
      this._historical.set([]);

      if (uid) {
        this._subscribeToday(uid);
        this._preloadRecentMonths();
        this.exerciseService.seedIfEmpty(uid);
      }
    });
  }

  // ── Realtime subscription for today ─────────────────────────────────────
  private _subscribeToday(uid: string): void {
    this._fetchToday(uid);

    this._realtimeChannel = this.supabase
      .channel(`workouts-today-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workouts', filter: `user_id=eq.${uid}` },
        () => this._fetchToday(uid)
      )
      .subscribe();
  }

  private async _fetchToday(uid: string): Promise<void> {
    const { data } = await this.supabase
      .from('workouts')
      .select('*')
      .eq('user_id', uid)
      .eq('date', this._todayStr);

    const fresh = (data ?? []).map(r => toWorkout(r as Record<string, unknown>));
    const key   = this._todayStr.substring(0, 7);
    const existing = (this._monthCache.get(key) ?? []).filter(w => w.date !== this._todayStr);
    this._monthCache.set(key, [...fresh, ...existing]);
    this._rebuildHistorical();
  }

  // ── Load API ─────────────────────────────────────────────────────────────
  private _preloadRecentMonths(): void {
    const now  = new Date();
    this.ensureMonthLoaded(now.getFullYear(), now.getMonth());
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    this.ensureMonthLoaded(prev.getFullYear(), prev.getMonth());
  }

  async ensureMonthLoaded(year: number, month: number): Promise<void> {
    const key = this._monthKey(year, month);
    if (this._monthCache.has(key) || this._allLoaded) return;

    this.isLoading.set(true);
    try {
      const start   = `${key}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end     = `${key}-${String(lastDay).padStart(2, '0')}`;

      const { data } = await this.supabase
        .from('workouts')
        .select('*')
        .eq('user_id', this._uid())
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false });

      this._monthCache.set(key, (data ?? []).map(r => toWorkout(r as Record<string, unknown>)));
      this._rebuildHistorical();
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadAllWorkouts(): Promise<void> {
    if (this._allLoaded) return;
    this.isLoading.set(true);
    try {
      const { data } = await this.supabase
        .from('workouts')
        .select('*')
        .eq('user_id', this._uid())
        .order('date', { ascending: false });

      for (const row of data ?? []) {
        const w   = toWorkout(row as Record<string, unknown>);
        const key = w.date.substring(0, 7);
        if (!this._monthCache.has(key)) this._monthCache.set(key, []);
        const bucket = this._monthCache.get(key)!;
        if (!bucket.find(x => x.id === w.id)) bucket.push(w);
      }
      this._rebuildHistorical();
      this._allLoaded = true;
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  todayDateString(): string { return this._todayStr; }

  getWorkoutForDate(date: string): Workout | null {
    return this.workouts().find(w => w.date === date) ?? null;
  }

  getWorkoutsForExercise(exerciseId: string): Workout[] {
    return this.workouts()
      .filter(w => w.entries.some(e => e.exerciseId === exerciseId))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  getLastSessionInfo(exerciseId: string, excludeWorkoutId?: string): { date: string; maxWeight: number; feeling?: FeelingLevel } | null {
    const past = this.workouts()
      .filter(w =>
        w.id !== excludeWorkoutId &&
        w.entries.some(e => e.exerciseId === exerciseId && e.sets.length > 0)
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!past.length) return null;
    const entry     = past[0].entries.find(e => e.exerciseId === exerciseId)!;
    const maxWeight = Math.max(...entry.sets.map(s => s.weight));
    return { date: past[0].date, maxWeight, feeling: entry.feeling };
  }

  // ── Query helpers ────────────────────────────────────────────────────────
  getLastWorkoutByCategory(category: string): Workout | null {
    return this.workouts().find(w =>
      w.categories?.includes(category) || w.category === category
    ) ?? null;
  }

  // ── Create ───────────────────────────────────────────────────────────────
  async createWorkoutForDate(date: string, category?: string): Promise<string> {
    const uid = this._uid();
    const row: Record<string, unknown> = {
      user_id: uid, date, entries: [], categories: category ? [category] : [],
    };
    if (category) row['category'] = category;

    const { data, error } = await this.supabase.from('workouts').insert(row).select().single();
    if (error) throw error;

    const newWorkout = toWorkout(data as Record<string, unknown>);
    const monthKey   = newWorkout.date.substring(0, 7);
    const existing   = this._monthCache.get(monthKey) ?? [];
    this._monthCache.set(monthKey, [newWorkout, ...existing]);
    this._rebuildHistorical();

    return data['id'] as string;
  }

  async createTodayWorkout(category?: string): Promise<string> {
    return this.createWorkoutForDate(this._todayStr, category);
  }

  async createWorkoutFromTemplate(date: string, category: string, templateEntries: WorkoutEntry[]): Promise<string> {
    const entries: WorkoutEntry[] = templateEntries.map(e => ({
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      sets: [],
    }));
    const id = await this.createWorkoutForDate(date, category);
    if (entries.length > 0) {
      await this._updateWorkout(id, { entries });
    }
    return id;
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  async addExerciseToWorkout(workoutId: string, entry: WorkoutEntry): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries     = [...workout.entries, entry];
    const exerciseCat = this.exerciseService.getById(entry.exerciseId)?.category;
    const categories  = this._mergeCategories(workout.categories ?? (workout.category ? [workout.category] : []), exerciseCat);
    await this._updateWorkout(workoutId, { entries, categories });
  }

  async addSetsToEntry(workoutId: string, exerciseId: string, sets: WorkoutSet[]): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e =>
      e.exerciseId === exerciseId ? { ...e, sets: [...e.sets, ...sets] } : e
    );
    await this._updateWorkout(workoutId, { entries });
  }

  async updateSetInEntry(workoutId: string, exerciseId: string, setIndex: number, updated: WorkoutSet): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e => {
      if (e.exerciseId !== exerciseId) return e;
      const sets = [...e.sets]; sets[setIndex] = updated; return { ...e, sets };
    });
    await this._updateWorkout(workoutId, { entries });
  }

  async removeSetFromEntry(workoutId: string, exerciseId: string, setIndex: number): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e =>
      e.exerciseId !== exerciseId ? e : { ...e, sets: e.sets.filter((_, i) => i !== setIndex) }
    );
    await this._updateWorkout(workoutId, { entries });
  }

  async removeEntryFromWorkout(workoutId: string, exerciseId: string): Promise<void> {
    const workout    = this._find(workoutId);
    if (!workout) return;
    const entries    = workout.entries.filter(e => e.exerciseId !== exerciseId);
    const categories = this._computeCategories(entries, workout.category);
    await this._updateWorkout(workoutId, { entries, categories });
  }

  async updateEntryFeeling(workoutId: string, exerciseId: string, feeling: FeelingLevel | undefined): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e => {
      if (e.exerciseId !== exerciseId) return e;
      if (feeling === undefined) {
        const { feeling: _f, ...rest } = e as WorkoutEntry & { feeling?: FeelingLevel };
        return rest as WorkoutEntry;
      }
      return { ...e, feeling };
    });
    await this._updateWorkout(workoutId, { entries });
  }

  async reorderEntries(workoutId: string, entries: WorkoutEntry[]): Promise<void> {
    await this._updateWorkout(workoutId, { entries });
  }

  async deleteWorkout(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('workouts')
      .delete()
      .eq('id', id)
      .eq('user_id', this._uid());
    if (error) throw error;
    this._removeFromCache(id);
  }

  // ── Private helpers ───────────────────────────────────────────────────────
  private _uid(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    return uid;
  }

  private async _updateWorkout(id: string, changes: Partial<Workout>): Promise<void> {
    const uid = this._uid();
    const patch: Record<string, unknown> = {};
    if (changes.entries    !== undefined) patch['entries']    = changes.entries;
    if (changes.categories !== undefined) patch['categories'] = changes.categories;
    if (changes.category   !== undefined) patch['category']   = changes.category;
    if (changes.notes      !== undefined) patch['notes']      = changes.notes;

    const { error } = await this.supabase
      .from('workouts')
      .update(patch)
      .eq('id', id)
      .eq('user_id', uid);
    if (error) throw error;
    this._patch(id, changes);
  }

  private _mergeCategories(existing: string[], newCat?: string): string[] {
    if (!newCat) return existing;
    return existing.includes(newCat) ? existing : [...existing, newCat];
  }

  private _computeCategories(entries: WorkoutEntry[], primaryCategory?: string): string[] {
    const fromEntries: string[] = entries
      .map(e => this.exerciseService.getById(e.exerciseId)?.category as string | undefined)
      .filter((c): c is string => c !== undefined && c !== '');
    const all: string[] = primaryCategory ? [primaryCategory, ...fromEntries] : fromEntries;
    return [...new Set(all)];
  }

  private _monthKey(y: number, m: number): string {
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  }

  private _rebuildHistorical(): void {
    const all = Array.from(this._monthCache.values()).flat();
    all.sort((a, b) => b.date.localeCompare(a.date));
    this._historical.set(all);
  }

  private _find(id: string): Workout | undefined {
    return this._historical().find(w => w.id === id);
  }

  private _patch(workoutId: string, changes: Partial<Workout>): void {
    for (const [key, workouts] of this._monthCache) {
      const idx = workouts.findIndex(w => w.id === workoutId);
      if (idx !== -1) {
        const updated = [...workouts];
        updated[idx]  = { ...updated[idx], ...changes };
        this._monthCache.set(key, updated);
        this._rebuildHistorical();
        return;
      }
    }
  }

  private _removeFromCache(workoutId: string): void {
    for (const [key, workouts] of this._monthCache) {
      const filtered = workouts.filter(w => w.id !== workoutId);
      if (filtered.length !== workouts.length) {
        this._monthCache.set(key, filtered);
        this._rebuildHistorical();
        return;
      }
    }
  }
}
