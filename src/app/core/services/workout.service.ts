import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

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

const DRAFT_KEY = 'gym_workout_draft';

@Injectable({ providedIn: 'root' })
export class WorkoutService {
  private supabase        = inject(SupabaseService).client;
  private auth            = inject(AuthService);
  private exerciseService = inject(ExerciseService);

  private readonly _todayStr = new Date().toISOString().split('T')[0];

  // ── Today: realtime ──────────────────────────────────────────────────────
  private readonly _todayFirestore = signal<Workout[]>([]);
  private _realtimeChannel: RealtimeChannel | null = null;

  // ── Local draft ──────────────────────────────────────────────────────────
  private readonly _draft = signal<Workout | null>(null);
  readonly pendingSync = signal(false);
  private _pendingOldDraft: Workout | null = null;

  // ── History cache ────────────────────────────────────────────────────────
  private readonly _monthCache = new Map<string, Workout[]>();
  private readonly _historical = signal<Workout[]>([]);
  private _allLoaded = false;

  readonly isLoading = signal(false);

  // ── Public signals ───────────────────────────────────────────────────────

  readonly todayWorkout = computed((): Workout | null => {
    const draft = this._draft();
    if (draft && draft.date === this._todayStr) return draft;
    return this._todayFirestore()[0] ?? null;
  });

  readonly workouts = computed((): Workout[] => {
    const today = this.todayWorkout();
    const hist  = this._historical().filter(w => w.date !== this._todayStr);
    const arr   = today ? [today, ...hist] : hist;
    return arr.sort((a, b) => b.date.localeCompare(a.date));
  });

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
    this._loadDraftFromStorage();

    effect(() => {
      const uid = this.auth.uid();

      // Tear down previous realtime subscription
      this._realtimeChannel?.unsubscribe();
      this._realtimeChannel = null;
      this._monthCache.clear();
      this._allLoaded = false;
      this._historical.set([]);

      if (uid) {
        this._subscribeToday(uid);
        this._preloadRecentMonths();
        this.exerciseService.seedIfEmpty(uid);

        if (this._pendingOldDraft) {
          const pending = this._pendingOldDraft;
          this._pendingOldDraft = null;
          this._finalizeOldDraft(pending);
        }
      }
    });

    // When realtime delivers today's workout and we have no active draft, sync it
    effect(() => {
      const firestoreToday = this._todayFirestore()[0];
      const draft = this._draft();
      if (firestoreToday && (!draft || draft.date !== this._todayStr)) {
        this._draft.set(firestoreToday);
        this.pendingSync.set(false);
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._autoSync());
    }
  }

  // ── Realtime subscription for today ─────────────────────────────────────
  private _subscribeToday(uid: string): void {
    // Initial fetch
    this._fetchToday(uid);

    // Realtime updates
    this._realtimeChannel = this.supabase
      .channel(`workouts-today-${uid}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'workouts',
          filter: `user_id=eq.${uid}`,
        },
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

    this._todayFirestore.set((data ?? []).map(r => toWorkout(r as Record<string, unknown>)));
  }

  // ── Draft persistence ────────────────────────────────────────────────────
  private _loadDraftFromStorage(): void {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (!stored) return;
      const draft = JSON.parse(stored) as Workout;
      if (draft.date === this._todayStr) {
        this._draft.set(draft);
        this.pendingSync.set(true);
      } else if (draft.id.startsWith('draft_')) {
        this._pendingOldDraft = draft;
        localStorage.removeItem(DRAFT_KEY);
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch { localStorage.removeItem(DRAFT_KEY); }
  }

  private _saveDraftToStorage(workout: Workout): void {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(workout));
  }

  private _clearDraft(): void {
    this._draft.set(null);
    this.pendingSync.set(false);
    localStorage.removeItem(DRAFT_KEY);
  }

  private async _finalizeOldDraft(draft: Workout): Promise<void> {
    try {
      await this._writeDraftToSupabase(draft);
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* silent — past-day drafts are best-effort */ }
  }

  private async _autoSync(): Promise<void> {
    if (!this.pendingSync() || !this._draft()) return;
    try { await this.finalizeToday(); } catch { /* retry on next online */ }
  }

  // ── Supabase write helpers ───────────────────────────────────────────────
  private _uid(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    return uid;
  }

  private async _writeDraftToSupabase(draft: Workout): Promise<void> {
    const uid = this._uid();
    const row: Record<string, unknown> = {
      user_id:    uid,
      date:       draft.date,
      entries:    draft.entries,
      categories: draft.categories ?? [],
    };
    if (draft.category) row['category'] = draft.category;
    if (draft.notes)    row['notes']    = draft.notes;

    if (draft.id.startsWith('draft_')) {
      const { error } = await this.supabase.from('workouts').insert(row);
      if (error) throw error;
    } else {
      const { error } = await this.supabase
        .from('workouts')
        .update({ entries: draft.entries, categories: draft.categories ?? [], category: draft.category ?? null, notes: draft.notes ?? null })
        .eq('id', draft.id)
        .eq('user_id', uid);
      if (error) throw error;
    }
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
  todayDateString(): string {
    return this._todayStr;
  }

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

  // ── Create ───────────────────────────────────────────────────────────────
  async createWorkoutForDate(date: string, category?: string): Promise<string> {
    if (date === this._todayStr) return this._createLocalDraft(category);

    const uid = this._uid();
    const row: Record<string, unknown> = { user_id: uid, date, entries: [], categories: category ? [category] : [] };
    if (category) row['category'] = category;

    const { data, error } = await this.supabase.from('workouts').insert(row).select().single();
    if (error) throw error;
    return data['id'];
  }

  async createTodayWorkout(category?: string): Promise<string> {
    return this._createLocalDraft(category);
  }

  private _createLocalDraft(category?: string): string {
    const tempId = `draft_${Date.now()}`;
    const draft: Workout = {
      id: tempId, date: this._todayStr, entries: [],
      category, categories: category ? [category] : [], createdAt: new Date(),
    };
    this._draft.set(draft);
    this._saveDraftToStorage(draft);
    this.pendingSync.set(true);
    return tempId;
  }

  resetDraftFromCloud(): void {
    this._clearDraft();
  }

  // ── Finalize ─────────────────────────────────────────────────────────────
  async finalizeToday(): Promise<void> {
    const draft = this._draft();
    if (!draft) return;
    if (draft.date !== this._todayStr) { this._clearDraft(); return; }
    await this._writeDraftToSupabase(draft);
    this._clearDraft();
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  async addExerciseToWorkout(workoutId: string, entry: WorkoutEntry): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries     = [...workout.entries, entry];
    const exerciseCat = this.exerciseService.getById(entry.exerciseId)?.category;
    const categories  = this._mergeCategories(workout.categories ?? (workout.category ? [workout.category] : []), exerciseCat);
    if (this._isTodayWorkout(workoutId)) {
      this._updateDraft({ entries, categories });
    } else {
      await this._updateWorkout(workoutId, { entries, categories });
    }
  }

  async addSetsToEntry(workoutId: string, exerciseId: string, sets: WorkoutSet[]): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e =>
      e.exerciseId === exerciseId ? { ...e, sets: [...e.sets, ...sets] } : e
    );
    if (this._isTodayWorkout(workoutId)) {
      this._updateDraft({ entries });
    } else {
      await this._updateWorkout(workoutId, { entries });
    }
  }

  async updateSetInEntry(workoutId: string, exerciseId: string, setIndex: number, updated: WorkoutSet): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e => {
      if (e.exerciseId !== exerciseId) return e;
      const sets = [...e.sets]; sets[setIndex] = updated; return { ...e, sets };
    });
    if (this._isTodayWorkout(workoutId)) {
      this._updateDraft({ entries });
    } else {
      await this._updateWorkout(workoutId, { entries });
    }
  }

  async removeSetFromEntry(workoutId: string, exerciseId: string, setIndex: number): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e =>
      e.exerciseId !== exerciseId ? e : { ...e, sets: e.sets.filter((_, i) => i !== setIndex) }
    );
    if (this._isTodayWorkout(workoutId)) {
      this._updateDraft({ entries });
    } else {
      await this._updateWorkout(workoutId, { entries });
    }
  }

  async removeEntryFromWorkout(workoutId: string, exerciseId: string): Promise<void> {
    const workout    = this._find(workoutId);
    if (!workout) return;
    const entries    = workout.entries.filter(e => e.exerciseId !== exerciseId);
    const categories = this._computeCategories(entries, workout.category);
    if (this._isTodayWorkout(workoutId)) {
      this._updateDraft({ entries, categories });
    } else {
      await this._updateWorkout(workoutId, { entries, categories });
    }
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
    if (this._isTodayWorkout(workoutId)) {
      this._updateDraft({ entries });
    } else {
      await this._updateWorkout(workoutId, { entries });
    }
  }

  async reorderEntries(workoutId: string, entries: WorkoutEntry[]): Promise<void> {
    if (this._isTodayWorkout(workoutId)) {
      this._updateDraft({ entries });
    } else {
      await this._updateWorkout(workoutId, { entries });
    }
  }

  async deleteWorkout(id: string): Promise<void> {
    if (this._isTodayWorkout(id)) this._clearDraft();
    if (!id.startsWith('draft_')) {
      const { error } = await this.supabase
        .from('workouts')
        .delete()
        .eq('id', id)
        .eq('user_id', this._uid());
      if (error) throw error;
    }
    this._removeFromCache(id);
  }

  // ── Private helpers ───────────────────────────────────────────────────────
  private _isTodayWorkout(id: string): boolean { return this._draft()?.id === id; }

  private _updateDraft(changes: Partial<Workout>): void {
    const current = this._draft();
    if (!current) return;
    const updated = { ...current, ...changes };
    this._draft.set(updated);
    this._saveDraftToStorage(updated);
    this.pendingSync.set(true);
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
    const draft = this._draft();
    if (draft?.id === id) return draft;
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
