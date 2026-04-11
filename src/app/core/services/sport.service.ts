import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { DEFAULT_SPORTS, Sport, SportSession } from '../models/sport.model';

// ── Row mappers ──────────────────────────────────────────────────────────────

function toSport(row: Record<string, unknown>): Sport {
  return {
    id:        row['id'] as string,
    name:      row['name'] as string,
    icon:      row['icon'] as string,
    color:     row['color'] as string,
    createdAt: new Date(row['created_at'] as string),
  };
}

function toSportSession(row: Record<string, unknown>): SportSession {
  return {
    id:              row['id'] as string,
    date:            row['date'] as string,
    sportId:         row['sport_id'] as string,
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

  // ── Sport definitions ────────────────────────────────────────────────────
  private readonly _sports = signal<Sport[]>([]);
  readonly sports = this._sports.asReadonly();

  // ── Sessions cache ────────────────────────────────────────────────────────
  private readonly _monthCache = new Map<string, SportSession[]>();
  private readonly _sessions   = signal<SportSession[]>([]);
  readonly isLoading = signal(false);
  readonly sessions  = this._sessions.asReadonly();

  readonly todaySessions = computed(() =>
    this._sessions().filter(s => s.date === this._todayStr)
  );

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      this._sports.set([]);
      this._monthCache.clear();
      this._sessions.set([]);
      if (uid) {
        this._loadSports(uid);
        this._preloadRecentMonths();
      }
    });
  }

  // ── Sport CRUD ────────────────────────────────────────────────────────────

  private async _loadSports(uid: string): Promise<void> {
    const { data } = await this.supabase
      .from('sports')
      .select('*')
      .eq('user_id', uid)
      .order('created_at');

    const sports = (data ?? []).map(r => toSport(r as Record<string, unknown>));
    if (sports.length === 0) {
      await this._seedDefaults(uid);
    } else {
      this._sports.set(sports);
    }
  }

  private async _seedDefaults(uid: string): Promise<void> {
    for (const s of DEFAULT_SPORTS) {
      await this.supabase.from('sports').insert({ user_id: uid, ...s });
    }
    const { data } = await this.supabase
      .from('sports').select('*').eq('user_id', uid).order('created_at');
    this._sports.set((data ?? []).map(r => toSport(r as Record<string, unknown>)));
  }

  async createSport(payload: Pick<Sport, 'name' | 'icon' | 'color'>): Promise<void> {
    const uid = this._uid();
    const { error } = await this.supabase
      .from('sports')
      .insert({ user_id: uid, ...payload });
    if (error) throw error;
    await this._loadSports(uid);
  }

  async updateSport(id: string, payload: Partial<Pick<Sport, 'name' | 'icon' | 'color'>>): Promise<void> {
    const uid = this._uid();
    const { error } = await this.supabase
      .from('sports')
      .update(payload)
      .eq('id', id)
      .eq('user_id', uid);
    if (error) throw error;
    await this._loadSports(uid);
  }

  async deleteSport(id: string): Promise<void> {
    const uid = this._uid();
    const { error } = await this.supabase
      .from('sports')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);
    if (error) throw error;
    this._sports.set(this._sports().filter(s => s.id !== id));
    // Remove cached sessions for this sport
    for (const [key, sessions] of this._monthCache) {
      this._monthCache.set(key, sessions.filter(s => s.sportId !== id));
    }
    this._rebuild();
  }

  // ── Sessions load ─────────────────────────────────────────────────────────

  private _preloadRecentMonths(): void {
    const now  = new Date();
    this.ensureMonthLoaded(now.getFullYear(), now.getMonth());
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    this.ensureMonthLoaded(prev.getFullYear(), prev.getMonth());
  }

  async ensureMonthLoaded(year: number, month: number): Promise<void> {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (this._monthCache.has(key)) return;

    this._monthCache.set(key, []); // mark loading

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
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  todayDateString(): string { return this._todayStr; }

  /** Returns full Sport objects for a given date (sorted by creation order). */
  getSportsForDate(date: string): Sport[] {
    const sessions  = this._sessions().filter(s => s.date === date);
    const sportsMap = new Map(this._sports().map(s => [s.id, s]));
    return sessions
      .map(s => sportsMap.get(s.sportId))
      .filter((s): s is Sport => !!s);
  }

  hasSportOnDate(date: string, sportId: string): boolean {
    return this._sessions().some(s => s.date === date && s.sportId === sportId);
  }

  hasAnySportOnDate(date: string): boolean {
    return this._sessions().some(s => s.date === date);
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  async toggleSport(date: string, sportId: string): Promise<void> {
    const existing = this._sessions().find(s => s.date === date && s.sportId === sportId);
    if (existing) {
      await this._deleteSession(existing.id, date);
    } else {
      await this._createSession(date, sportId);
    }
  }

  // ── Private mutations ─────────────────────────────────────────────────────

  private async _createSession(date: string, sportId: string): Promise<void> {
    const uid = this._uid();
    const { data, error } = await this.supabase
      .from('sport_sessions')
      .insert({ user_id: uid, date, sport_id: sportId })
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
