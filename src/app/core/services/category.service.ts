import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { CategoryChip, DEFAULT_CATEGORIES, ExerciseCategoryDef } from '../models/category.model';

function toCategory(row: Record<string, unknown>): ExerciseCategoryDef {
  return {
    id:        row['id'] as string,
    key:       row['key'] as string,
    name:      row['name'] as string,
    icon:      row['icon'] as string,
    color:     row['color'] as string,
    muscles:   (row['muscles'] as string | null) ?? undefined,
    sortOrder: (row['sort_order'] as number | null) ?? 0,
    createdAt: new Date(row['created_at'] as string),
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'categoria';
}

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _categories = signal<ExerciseCategoryDef[]>([]);
  readonly categories = computed(() =>
    [...this._categories()].sort((a, b) => a.sortOrder - b.sortOrder));
  readonly isLoaded = signal(false);
  private _loadPromise: Promise<void> | null = null;

  readonly categoryChips = computed<CategoryChip[]>(() =>
    this.categories().map(c => ({ value: c.key, label: c.name, icon: c.icon, color: c.color })));

  private readonly _byKey = computed(() => new Map(this._categories().map(c => [c.key, c])));

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      this._categories.set([]);
      this.isLoaded.set(false);
      this._loadPromise = null;
      if (uid) {
        const cached = this._readFromStorage(uid);
        if (cached) this._categories.set(cached);
        this._loadPromise = this._loadCategories(uid)
          .then(() => { this.isLoaded.set(true); })
          .finally(() => { this._loadPromise = null; });
      }
    });
  }

  ensureLoaded(): Promise<void> {
    if (this.isLoaded()) return Promise.resolve();
    if (this._loadPromise) return this._loadPromise;
    const uid = this.auth.uid();
    if (!uid) return Promise.resolve();
    this._loadPromise = this._loadCategories(uid)
      .then(() => { this.isLoaded.set(true); })
      .finally(() => { this._loadPromise = null; });
    return this._loadPromise;
  }

  // ── Lookups — never throw, fall back gracefully so a renamed/deleted key
  //    degrades instead of crashing a template ──────────────────────────────
  label(key: string): string { return this._byKey().get(key)?.name ?? key; }
  color(key: string): string { return this._byKey().get(key)?.color ?? '#bbb'; }
  icon(key: string): string  { return this._byKey().get(key)?.icon ?? 'fitness_center'; }
  muscles(key: string): string | undefined { return this._byKey().get(key)?.muscles; }
  getByKey(key: string): ExerciseCategoryDef | undefined { return this._byKey().get(key); }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async createCategory(payload: { name: string; icon: string; color: string; muscles?: string }): Promise<void> {
    const uid = this._uid();
    let key = slugify(payload.name);
    const existingKeys = new Set(this._categories().map(c => c.key));
    if (existingKeys.has(key)) {
      let n = 2;
      while (existingKeys.has(`${key}-${n}`)) n++;
      key = `${key}-${n}`;
    }
    const { error } = await this.supabase.from('exercise_categories').insert({
      user_id: uid, key, name: payload.name, icon: payload.icon,
      color: payload.color, muscles: payload.muscles ?? null,
      sort_order: this._categories().length,
    });
    if (error) throw error;
    await this._loadCategories(uid);
  }

  async updateCategory(id: string, payload: Partial<{ name: string; icon: string; color: string; muscles?: string }>): Promise<void> {
    const uid = this._uid();
    const dbPayload: Record<string, unknown> = {};
    if (payload.name    !== undefined) dbPayload['name']    = payload.name;
    if (payload.icon    !== undefined) dbPayload['icon']    = payload.icon;
    if (payload.color   !== undefined) dbPayload['color']   = payload.color;
    if (payload.muscles !== undefined) dbPayload['muscles'] = payload.muscles || null;

    const { error } = await this.supabase.from('exercise_categories').update(dbPayload)
      .eq('id', id).eq('user_id', uid);
    if (error) throw error;
    await this._loadCategories(uid);
  }

  /** Throws Error('IN_USE') if any exercise still references this category's
   *  key — categories are an attribute of exercises, not an owned child
   *  record, so a silent cascade would corrupt otherwise-valid rows. */
  async deleteCategory(id: string): Promise<void> {
    const uid = this._uid();
    const cat = this._categories().find(c => c.id === id);
    if (!cat) return;

    const { count } = await this.supabase.from('exercises')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid).eq('category', cat.key);
    if (count) throw new Error('IN_USE');

    const { error } = await this.supabase.from('exercise_categories')
      .delete().eq('id', id).eq('user_id', uid);
    if (error) throw error;

    const updated = this._categories().filter(c => c.id !== id);
    this._categories.set(updated);
    this._writeToStorage(uid, updated);
  }

  // ── Load / seed ───────────────────────────────────────────────────────────

  private async _loadCategories(uid: string): Promise<void> {
    const { data } = await this.supabase
      .from('exercise_categories')
      .select('*')
      .eq('user_id', uid)
      .order('sort_order');

    const categories = (data ?? []).map(r => toCategory(r as Record<string, unknown>));
    if (categories.length === 0) {
      await this._seedDefaults(uid);
    } else {
      this._categories.set(categories);
      this._writeToStorage(uid, categories);
    }
  }

  private async _seedDefaults(uid: string): Promise<void> {
    for (const c of DEFAULT_CATEGORIES) {
      await this.supabase.from('exercise_categories').insert({
        user_id: uid, key: c.key, name: c.name, icon: c.icon,
        color: c.color, muscles: c.muscles ?? null, sort_order: c.sortOrder,
      });
    }
    const { data } = await this.supabase
      .from('exercise_categories').select('*').eq('user_id', uid).order('sort_order');
    const categories = (data ?? []).map(r => toCategory(r as Record<string, unknown>));
    this._categories.set(categories);
    this._writeToStorage(uid, categories);
  }

  // ── localStorage cache ────────────────────────────────────────────────────

  private _lsKey(uid: string): string { return `gymgoli_categories_${uid}`; }

  private _writeToStorage(uid: string, categories: ExerciseCategoryDef[]): void {
    try { localStorage.setItem(this._lsKey(uid), JSON.stringify(categories)); } catch { }
  }

  private _readFromStorage(uid: string): ExerciseCategoryDef[] | null {
    try {
      const raw = localStorage.getItem(this._lsKey(uid));
      if (!raw) return null;
      return (JSON.parse(raw) as Record<string, unknown>[]).map(r => toCategory(r));
    } catch { return null; }
  }

  private _uid(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    return uid;
  }
}
