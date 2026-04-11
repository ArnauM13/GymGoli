import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { SportSession, SportType } from '../models/sport.model';

// ── Supabase row → typed SportSession ───────────────────────────────────────
function toSportSession(row: Record<string, unknown>): SportSession {
  return {
    id:              row['id'] as string,
    date:            row['date'] as string,
    sport:           row['sport'] as SportType,
    durationMinutes: row['duration_minutes'] as number | undefined,
    notes:           row['notes'] as string | undefined,
    createdAt:       new Date(row['created_at'] as string),
  };
}

@Injectable({ providedIn: 'root' })
export class SportService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _todayStr = new Date().toISOString().split('T')[0];

  private readonly _monthCache = new Map<string, SportSession[]>();
  private readonly _sessions   = signal<SportSession[]>([]);
  readonly isLoading = signal(false);

  readonly sessions = this._sessions.asReadonly();

  readonly todaySessions = computed(() =>
    this._sessions().filter(s => s.date === this._todayStr)
  );

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      this._monthCache.clear();
      this._sessions.set([]);
      if (uid) {
        this._preloadRecentMonths();
      }
    });
  }

  // ── Load API ──────────────────────────────────────────────────────────────

  private _preloadRecentMonths(): void {
    const now  = new Date();
    this.ensureMonthLoaded(now.getFullYear(), now.getMonth());
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    this.ensureMonthLoaded(prev.getFullYear(), prev.getMonth());
  }

  async ensureMonthLoaded(year: number, month: number): Promise<void> {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (this._monthCache.has(key)) return;

    // Mark as loaded immediately to prevent duplicate fetches
    this._monthCache.set(key, []);

    this.isLoading.set(true);
    try {
      const start   = `${key}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end     = `${key}-${String(lastDay).padStart(2, '0')}`;

      const { data } = await this.supabase
        .from('sport_sessions')
        .select('*')
        .eq('user_id', this._uid())
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false });

      this._monthCache.set(key, (data ?? []).map(r => toSportSession(r as Record<string, unknown>)));
      this._rebuild();
    } catch (err) {
      console.warn('[SportService] ensureMonthLoaded error:', err);
      // Keep empty array in cache so we don't retry endlessly
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  todayDateString(): string { return this._todayStr; }

  getSessionsForDate(date: string): SportSession[] {
    return this._sessions().filter(s => s.date === date);
  }

  getSportsForDate(date: string): SportType[] {
    return this._sessions()
      .filter(s => s.date === date)
      .map(s => s.sport);
  }

  hasSportOnDate(date: string, sport: SportType): boolean {
    return this._sessions().some(s => s.date === date && s.sport === sport);
  }

  hasAnySportOnDate(date: string): boolean {
    return this._sessions().some(s => s.date === date);
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  async toggleSport(date: string, sport: SportType): Promise<void> {
    const existing = this._sessions().find(s => s.date === date && s.sport === sport);
    if (existing) {
      await this._deleteSession(existing.id, date);
    } else {
      await this._createSession(date, sport);
    }
  }

  // ── Private mutations ─────────────────────────────────────────────────────

  private async _createSession(date: string, sport: SportType): Promise<void> {
    const uid = this._uid();
    const { data, error } = await this.supabase
      .from('sport_sessions')
      .insert({ user_id: uid, date, sport })
      .select()
      .single();
    if (error) throw error;

    const session = toSportSession(data as Record<string, unknown>);
    const key     = date.substring(0, 7);
    const bucket  = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, [...bucket, session]);
    this._rebuild();
  }

  private async _deleteSession(id: string, date: string): Promise<void> {
    const { error } = await this.supabase
      .from('sport_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', this._uid());
    if (error) throw error;

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, bucket.filter(s => s.id !== id));
    this._rebuild();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _rebuild(): void {
    const all = Array.from(this._monthCache.values()).flat();
    all.sort((a, b) => b.date.localeCompare(a.date));
    this._sessions.set(all);
  }

  private _uid(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    return uid;
  }
}
