import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';

import { ExerciseService } from './exercise.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { SyncService } from './sync.service';
import { FeelingLevel, PlannedSource, Workout, WorkoutEntry, WorkoutSet, WorkoutStatus } from '../models/workout.model';

// ── Supabase row → typed Workout (snake_case keys) ──────────────────────────
function toWorkout(row: Record<string, unknown>): Workout {
  return {
    id:               row['id'] as string,
    date:             row['date'] as string,
    category:         (row['category'] as string | undefined) ?? undefined,
    categories:       (row['categories'] as string[] | undefined) ?? [],
    entries:          (row['entries'] as WorkoutEntry[] | undefined) ?? [],
    notes:            (row['notes'] as string | undefined) ?? undefined,
    feeling:          (row['feeling'] as FeelingLevel | undefined) ?? undefined,
    sourceProposalId: (row['source_proposal_id'] as string | null | undefined) ?? undefined,
    createdAt:        new Date(row['created_at'] as string),
    status:           (row['status'] as WorkoutStatus | undefined) ?? 'done',
    plannedSource:    (row['planned_source'] as PlannedSource | undefined) ?? undefined,
  };
}

// ── localStorage cache row → typed Workout (camelCase keys) ─────────────────
function workoutFromCache(raw: Record<string, unknown>): Workout {
  return {
    id:               raw['id'] as string,
    date:             raw['date'] as string,
    category:         (raw['category'] as string | undefined) ?? undefined,
    categories:       (raw['categories'] as string[] | undefined) ?? [],
    entries:          (raw['entries'] as WorkoutEntry[] | undefined) ?? [],
    notes:            (raw['notes'] as string | undefined) ?? undefined,
    feeling:          (raw['feeling'] as FeelingLevel | undefined) ?? undefined,
    sourceProposalId: (raw['sourceProposalId'] as string | null | undefined) ?? undefined,
    createdAt:        new Date(raw['createdAt'] as string),
    status:           (raw['status'] as WorkoutStatus | undefined) ?? 'done',
    plannedSource:    (raw['plannedSource'] as PlannedSource | undefined) ?? undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class WorkoutService {
  private supabase        = inject(SupabaseService).client;
  private auth            = inject(AuthService);
  private exerciseService = inject(ExerciseService);
  private syncService     = inject(SyncService);

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

  readonly plannedWorkouts = computed(() =>
    this._historical().filter(w => w.status === 'planned')
  );

  readonly doneWorkouts = computed((): Workout[] =>
    this.workouts().filter(w => (w.status ?? 'done') !== 'planned')
  );

  readonly plannedByDate = computed(() => {
    const map = new Map<string, Workout[]>();
    for (const w of this.plannedWorkouts()) {
      const bucket = map.get(w.date) ?? [];
      bucket.push(w);
      map.set(w.date, bucket);
    }
    return map;
  });

  readonly exercisesWithData = computed((): Set<string> =>
    new Set(
      this.doneWorkouts()
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

    const fresh    = (data ?? []).map(r => toWorkout(r as Record<string, unknown>));
    const key      = this._todayStr.substring(0, 7);
    const existing = (this._monthCache.get(key) ?? []).filter(w => w.date !== this._todayStr);
    // Keep local dirty versions — don't overwrite unsent changes with stale server data
    const dirtyIds = new Set(this.syncService.pendingIds());
    const inCache  = this._monthCache.get(key) ?? [];
    const dirtyLocal = inCache.filter(w => dirtyIds.has(w.id) && w.date === this._todayStr);
    const freshClean = fresh.filter(w => !dirtyIds.has(w.id));
    this._monthCache.set(key, [...freshClean, ...dirtyLocal, ...existing]);
    this._rebuildHistorical();
  }

  // ── Load API ─────────────────────────────────────────────────────────────
  private _preloadRecentMonths(): void {
    const now  = new Date();
    this.ensureMonthLoaded(now.getFullYear(), now.getMonth());
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    this.ensureMonthLoaded(prev.getFullYear(), prev.getMonth());
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    this.ensureMonthLoaded(next.getFullYear(), next.getMonth());
  }

  async ensureMonthLoaded(year: number, month: number): Promise<void> {
    const key = this._monthKey(year, month);
    if (this._monthCache.has(key) || this._allLoaded) return;

    const uid = this._uid();

    // ── Step 1: serve from localStorage immediately (no spinner if cached) ──
    const lsCached = this._readMonthFromStorage(uid, key);
    const dirtySnaps = this.syncService.pendingIds()
      .map(id => this.syncService.getSnapshot(id))
      .filter((w): w is Workout => w !== null && w.date.substring(0, 7) === key);
    const dirtyMap = new Map(dirtySnaps.map(w => [w.id, w]));

    if (lsCached) {
      const merged = lsCached.map(w => dirtyMap.get(w.id) ?? w);
      for (const [id, snap] of dirtyMap) {
        if (!lsCached.find(w => w.id === id)) merged.push(snap);
      }
      this._monthCache.set(key, merged);
      this._rebuildHistorical();
    } else {
      this._monthCache.set(key, [...dirtySnaps]); // show locally-created offline workouts
      this.isLoading.set(true);
    }

    // ── Step 2: background refresh from Supabase ────────────────────────────
    try {
      const start   = `${key}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end     = `${key}-${String(lastDay).padStart(2, '0')}`;

      const { data } = await this.supabase
        .from('workouts')
        .select('*')
        .eq('user_id', uid)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false });

      const fetched  = (data ?? []).map(r => toWorkout(r as Record<string, unknown>));
      const inFlight = this._monthCache.get(key) ?? [];
      const freshDirtyIds = new Set(this.syncService.pendingIds());
      const dirtyLocal    = inFlight.filter(w => freshDirtyIds.has(w.id));
      const fetchedClean  = fetched.filter(w => !freshDirtyIds.has(w.id));
      const localOnly     = inFlight.filter(w => !fetched.find(f => f.id === w.id) && !freshDirtyIds.has(w.id));
      const final         = [...fetchedClean, ...dirtyLocal, ...localOnly];
      this._monthCache.set(key, final);
      this._rebuildHistorical();
      this._writeMonthToStorage(uid, key, fetched); // persist clean server data
    } catch {
      // Network failure — keep whatever we have from localStorage/local state
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

  // ── Paginated query ──────────────────────────────────────────────────────
  async loadWorkoutPage(opts: {
    page: number;
    pageSize: number;
    category?: string;
    ascending?: boolean;
  }): Promise<{ workouts: Workout[]; total: number }> {
    const { page, pageSize, category, ascending = false } = opts;
    const from = page * pageSize;
    const to   = from + pageSize - 1;

    const base = this.supabase
      .from('workouts')
      .select('*', { count: 'exact' })
      .eq('user_id', this._uid())
      .order('date', { ascending });

    const q = category ? base.contains('categories', [category]) : base;
    const { data, count, error } = await (q as typeof base).range(from, to);
    if (error) throw error;

    return {
      workouts: (data ?? []).map(r => toWorkout(r as Record<string, unknown>)),
      total: count ?? 0,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  todayDateString(): string { return this._todayStr; }

  getWorkoutForDate(date: string): Workout | null {
    return this.workouts().find(w => w.date === date) ?? null;
  }

  getWorkoutsForDate(date: string): Workout[] {
    return this.workouts().filter(w => w.date === date);
  }

  getPlannedForDate(date: string): Workout[] {
    return this.plannedWorkouts().filter(w => w.date === date);
  }

  getDoneWorkoutsForDate(date: string): Workout[] {
    return this.getWorkoutsForDate(date).filter(w => (w.status ?? 'done') !== 'planned');
  }

  getWorkoutsForExercise(exerciseId: string): Workout[] {
    return this.doneWorkouts()
      .filter(w => w.entries.some(e => e.exerciseId === exerciseId))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  getAllTimeMaxWeight(exerciseId: string, excludeWorkoutId?: string): number {
    let max = 0;
    for (const w of this._historical()) {
      if (w.id === excludeWorkoutId) continue;
      const entry = w.entries.find(e => e.exerciseId === exerciseId);
      if (entry) for (const s of entry.sets) if (s.weight > max) max = s.weight;
    }
    return max;
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
    const id         = crypto.randomUUID();
    const newWorkout: Workout = {
      id, date,
      entries:    [],
      categories: category ? [category] : [],
      category,
      createdAt:  new Date(),
      status:     'done',
    };
    const monthKey = date.substring(0, 7);
    this._monthCache.set(monthKey, [newWorkout, ...(this._monthCache.get(monthKey) ?? [])]);
    this._rebuildHistorical();
    this.syncService.markDirty(id, newWorkout, true);
    return id;
  }

  async createTodayWorkout(category?: string): Promise<string> {
    return this.createWorkoutForDate(this._todayStr, category);
  }

  async createWorkoutFromProposal(date: string, proposalId: string, entries: WorkoutEntry[]): Promise<string> {
    const id         = crypto.randomUUID();
    const newWorkout: Workout = {
      id, date,
      entries:         entries.map(e => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, sets: [] })),
      categories:      [],
      sourceProposalId: proposalId,
      createdAt:       new Date(),
      status:          'done',
    };
    const monthKey = date.substring(0, 7);
    this._monthCache.set(monthKey, [newWorkout, ...(this._monthCache.get(monthKey) ?? [])]);
    this._rebuildHistorical();
    this.syncService.markDirty(id, newWorkout, true);
    return id;
  }

  async createPlannedWorkout(date: string, category?: string, entries: WorkoutEntry[] = []): Promise<string> {
    const id         = crypto.randomUUID();
    const newWorkout: Workout = {
      id, date,
      entries:       entries.map(e => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, sets: [] })),
      categories:    category ? [category] : [],
      category,
      createdAt:     new Date(),
      status:        'planned',
      plannedSource: 'self',
    };
    const monthKey = date.substring(0, 7);
    this._monthCache.set(monthKey, [newWorkout, ...(this._monthCache.get(monthKey) ?? [])]);
    this._rebuildHistorical();
    this.syncService.markDirty(id, newWorkout, true);
    return id;
  }

  async createPlannedFromProposal(date: string, proposalId: string, entries: WorkoutEntry[]): Promise<string> {
    const id         = crypto.randomUUID();
    const newWorkout: Workout = {
      id, date,
      entries:         entries.map(e => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, sets: [] })),
      categories:      [],
      sourceProposalId: proposalId,
      createdAt:       new Date(),
      status:          'planned',
      plannedSource:   'trainer',
    };
    const monthKey = date.substring(0, 7);
    this._monthCache.set(monthKey, [newWorkout, ...(this._monthCache.get(monthKey) ?? [])]);
    this._rebuildHistorical();
    this.syncService.markDirty(id, newWorkout, true);
    return id;
  }

  async startPlannedWorkout(workoutId: string): Promise<void> {
    await this._updateWorkout(workoutId, { status: 'done' });
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

    const allHadFeelingBefore = workout.entries.length > 0 && workout.entries.every(e => e.feeling != null);

    const entries = workout.entries.map(e => {
      if (e.exerciseId !== exerciseId) return e;
      if (feeling === undefined) {
        const { feeling: _f, ...rest } = e as WorkoutEntry & { feeling?: FeelingLevel };
        return rest as WorkoutEntry;
      }
      return { ...e, feeling };
    });

    const allHaveFeelingNow = entries.length > 0 && entries.every(e => e.feeling != null);
    const updates: Partial<Workout> = { entries };

    // Auto-set workout feeling when the last entry gets its feeling and no feeling is set yet
    if (!allHadFeelingBefore && allHaveFeelingNow && workout.feeling == null) {
      const total = entries.reduce((sum, e) => sum + (e.feeling as number), 0);
      updates.feeling = Math.min(5, Math.max(1, Math.round(total / entries.length))) as FeelingLevel;
    }

    await this._updateWorkout(workoutId, updates);
  }

  async updateWorkoutFeeling(workoutId: string, feeling: FeelingLevel | undefined): Promise<void> {
    await this._updateWorkout(workoutId, { feeling });
  }

  async reorderEntries(workoutId: string, entries: WorkoutEntry[]): Promise<void> {
    await this._updateWorkout(workoutId, { entries });
  }

  async deleteWorkout(id: string): Promise<void> {
    const wasPendingInsert = this.syncService.isInsert(id);
    this.syncService.cancelDirty(id);
    this._removeFromCache(id);
    if (wasPendingInsert) return; // never reached Supabase, nothing to delete
    const { error } = await this.supabase
      .from('workouts')
      .delete()
      .eq('id', id)
      .eq('user_id', this._uid());
    if (error) throw error;
  }

  // ── Private helpers ───────────────────────────────────────────────────────
  private _uid(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    return uid;
  }

  private _updateWorkout(id: string, changes: Partial<Workout>): void {
    this._patch(id, changes);
    const snap = this._find(id);
    if (snap) this.syncService.markDirty(id, snap);
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

  // ── localStorage month cache ──────────────────────────────────────────────
  private _lsMonthKey(uid: string, monthKey: string): string {
    return `gymgoli_month_${uid}_${monthKey}`;
  }

  private _writeMonthToStorage(uid: string, monthKey: string, workouts: Workout[]): void {
    try {
      localStorage.setItem(this._lsMonthKey(uid, monthKey), JSON.stringify(workouts));
    } catch { /* quota exceeded — non-fatal */ }
  }

  private _readMonthFromStorage(uid: string, monthKey: string): Workout[] | null {
    try {
      const raw = localStorage.getItem(this._lsMonthKey(uid, monthKey));
      if (!raw) return null;
      return (JSON.parse(raw) as Record<string, unknown>[]).map(workoutFromCache);
    } catch { return null; }
  }
}
