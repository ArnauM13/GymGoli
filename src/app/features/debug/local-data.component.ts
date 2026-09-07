import { Component, computed, inject, signal } from '@angular/core';

import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/** Una sessió tal com viu al localStorage, sense passar per cap servei: el que
 *  volem veure aquí és exactament el que hi ha guardat, no el que l'app en fa. */
interface RawWorkout {
  id?:         string;
  date?:       string;
  entries?:    { exerciseId?: string; exerciseName?: string; sets?: unknown[] }[];
  categories?: string[];
  category?:   string;
  status?:     string;
  notes?:      string;
  feeling?:    number;
  createdAt?:  string;
  updatedAt?:  string;
}

/** Una sessió llesta per pintar: comptadors ja calculats i marcada si és buida. */
interface LocalWorkout {
  id:        string;
  date:      string;
  status:    string;
  source:    'month' | 'snapshot';
  /** Clau de localStorage d'on surt, per poder-la buscar a mà. */
  storeKey:  string;
  entries:   { name: string; id: string; sets: number; detail: string }[];
  setCount:  number;
  updatedAt: string;
  raw:       RawWorkout;
}

/** El mateix entrenament, vist a localStorage i al servidor. */
interface DiffRow {
  id:            string;
  date:          string;
  localEntries:  number;
  localSets:     number;
  serverEntries: number | null;
  serverSets:    number | null;
  verdict:       'ok' | 'server-empty' | 'server-missing' | 'local-missing' | 'different';
}

const VERDICT_LABEL: Record<DiffRow['verdict'], string> = {
  'ok':             'Coincideix',
  'server-empty':   'Servidor buit',
  'server-missing': 'Només en local',
  'local-missing':  'Només al servidor',
  'different':      'Difereixen',
};

@Component({
  selector: 'app-debug-local-data',
  standalone: true,
  imports: [PageHeaderComponent],
  template: `
    <div class="page">
      <app-page-header title="Dades locals" [showBack]="true" backFallback="/settings" />

      <p class="lead">
        Tot el que hi ha al <code>localStorage</code> d'aquest dispositiu, llegit en
        cru. Serveix per comparar-ho amb el que hi ha a la base de dades.
      </p>

      <!-- ── Resum ────────────────────────────────────────────────────── -->
      <div class="card-section">
        <div class="section-header">
          <span class="material-symbols-outlined section-icon">database</span>
          <h2 class="section-title">Resum</h2>
        </div>
        <div class="stats">
          <div class="stat"><b>{{ workouts().length }}</b><span>sessions en local</span></div>
          <div class="stat" [class.bad]="emptyWorkouts().length > 0">
            <b>{{ emptyWorkouts().length }}</b><span>sense cap sèrie</span>
          </div>
          <div class="stat" [class.warn]="pendingIds().length > 0">
            <b>{{ pendingIds().length }}</b><span>pendents de pujar</span>
          </div>
          <div class="stat"><b>{{ months().length }}</b><span>mesos a la cau</span></div>
        </div>
        <div class="meta">
          <span>Usuari: <code>{{ uid() ?? '—' }}</code></span>
          <span>Espai ocupat: <code>{{ totalKb() }} KB</code></span>
        </div>
      </div>

      <!-- ── Cua de sincronització ────────────────────────────────────── -->
      <div class="card-section">
        <div class="section-header">
          <span class="material-symbols-outlined section-icon">cloud_upload</span>
          <h2 class="section-title">Cua de sincronització</h2>
          <span class="section-count">{{ pendingIds().length }}</span>
        </div>
        @if (pendingIds().length === 0) {
          <p class="empty">Res pendent d'enviar al servidor.</p>
        } @else {
          @for (id of pendingIds(); track id) {
            <div class="kv">
              <code>{{ id }}</code>
              <span class="tag" [class.tag-new]="insertIds().includes(id)">
                {{ insertIds().includes(id) ? 'alta' : 'edició' }}
              </span>
              <span class="tag" [class.tag-bad]="snapSetCount(id) === 0">
                {{ snapSetCount(id) }} sèries
              </span>
            </div>
          }
        }
      </div>

      <!-- ── Comparació amb el servidor ───────────────────────────────── -->
      <div class="card-section">
        <div class="section-header">
          <span class="material-symbols-outlined section-icon">compare_arrows</span>
          <h2 class="section-title">Local contra servidor</h2>
          @if (diff().length) { <span class="section-count">{{ mismatches().length }} diferències</span> }
        </div>
        <div class="row-actions">
          <button class="btn-primary" (click)="compare()" [disabled]="comparing()">
            {{ comparing() ? 'Consultant…' : 'Comparar amb la base de dades' }}
          </button>
          @if (diff().length) {
            <button class="btn-ghost" (click)="onlyMismatches.set(!onlyMismatches())">
              {{ onlyMismatches() ? 'Mostra-ho tot' : 'Només les diferències' }}
            </button>
          }
        </div>
        @if (diffError()) { <p class="err">{{ diffError() }}</p> }
        @if (diff().length) {
          <div class="table">
            <div class="tr th"><span>Dia</span><span>Local</span><span>Servidor</span><span>Estat</span></div>
            @for (d of visibleDiff(); track d.id) {
              <div class="tr" [class.bad]="d.verdict !== 'ok'">
                <span>{{ d.date }}</span>
                <span>{{ d.localEntries }} ex · {{ d.localSets }} sèr</span>
                <span>
                  @if (d.serverEntries === null) { — }
                  @else { {{ d.serverEntries }} ex · {{ d.serverSets }} sèr }
                </span>
                <span class="verdict">{{ verdictLabel(d.verdict) }}</span>
              </div>
            }
          </div>
        }
      </div>

      <!-- ── Sessions en local ────────────────────────────────────────── -->
      <div class="card-section">
        <div class="section-header">
          <span class="material-symbols-outlined section-icon">fitness_center</span>
          <h2 class="section-title">Sessions a localStorage</h2>
          <span class="section-count">{{ visibleWorkouts().length }}</span>
        </div>
        <div class="chips">
          <button class="chip" [class.on]="!onlyEmpty()" (click)="onlyEmpty.set(false)">Totes</button>
          <button class="chip" [class.on]="onlyEmpty()" (click)="onlyEmpty.set(true)">Sense sèries</button>
        </div>

        @for (w of visibleWorkouts(); track w.id) {
          <div class="item-card" [class.bad]="w.setCount === 0">
            <div class="ic-bar" [style.background]="w.setCount === 0 ? 'var(--c-danger)' : 'var(--c-brand)'"></div>
            <div class="ic-info">
              <span class="ic-name">
                {{ w.date }}
                <span class="tag">{{ w.status }}</span>
                <span class="tag">{{ w.source === 'snapshot' ? 'pendent' : 'cau' }}</span>
              </span>
              <span class="ic-detail">{{ w.entries.length }} exercicis · {{ w.setCount }} sèries · {{ w.id }}</span>
              @if (expanded() === w.id) {
                <div class="detail">
                  @for (e of w.entries; track e.id) {
                    <div class="entry" [class.bad]="e.sets === 0">
                      <b>{{ e.name || e.id }}</b>
                      <span>{{ e.detail || 'cap sèrie' }}</span>
                    </div>
                  }
                  @if (!w.entries.length) { <div class="entry bad"><b>Cap entrada</b></div> }
                  <div class="kv"><span>clau</span><code>{{ w.storeKey }}</code></div>
                  <div class="kv"><span>modificat</span><code>{{ w.updatedAt || '—' }}</code></div>
                  <pre>{{ pretty(w.raw) }}</pre>
                </div>
              }
            </div>
            <button class="ic-action" (click)="toggle(w.id)" [attr.aria-label]="expanded() === w.id ? 'Plegar' : 'Desplegar'">
              <span class="material-symbols-outlined">{{ expanded() === w.id ? 'expand_less' : 'expand_more' }}</span>
            </button>
          </div>
        }
        @if (!visibleWorkouts().length) {
          <p class="empty">Cap sessió que encaixi amb el filtre.</p>
        }
      </div>

      <!-- ── Claus en cru ─────────────────────────────────────────────── -->
      <div class="card-section">
        <div class="section-header">
          <span class="material-symbols-outlined section-icon">key</span>
          <h2 class="section-title">Totes les claus</h2>
          <span class="section-count">{{ keys().length }}</span>
        </div>
        @for (k of keys(); track k.key) {
          <div class="kv"><code>{{ k.key }}</code><span class="tag">{{ k.kb }} KB</span></div>
        }
        <div class="row-actions">
          <button class="btn-primary" (click)="copyAll()">Copiar-ho tot en JSON</button>
          <button class="btn-ghost" (click)="refresh()">Rellegir</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 0 0 84px; max-width: 720px; margin: 0 auto; }
    .lead { margin: 0 16px; font-size: 13px; color: var(--c-text-2); line-height: 1.45; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; word-break: break-all; }

    .card-section {
      margin: 12px 16px 0; padding: 14px 14px 16px;
      background: var(--c-card); border-radius: 18px; box-shadow: 0 2px 10px var(--c-shadow);
    }
    .section-header { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; }
    .section-icon { font-size: 18px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 300; }
    .section-title { margin: 0; flex: 1; font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px; }
    .section-count { font-size: 11px; font-weight: 700; color: var(--c-text-3); background: var(--c-subtle); border-radius: 10px; padding: 2px 8px; }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 8px; }
    .stat {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      padding: 10px 6px; border-radius: 14px; border: 1.5px solid var(--c-border-2); background: var(--c-subtle);
      b { font-size: 19px; font-weight: 800; color: var(--c-text); }
      span { font-size: 10.5px; font-weight: 600; color: var(--c-text-3); text-align: center; line-height: 1.2; }
      &.bad  { border-color: color-mix(in srgb, var(--c-danger) 55%, transparent); b { color: var(--c-danger); } }
      &.warn { border-color: color-mix(in srgb, var(--c-amber) 55%, transparent);  b { color: var(--c-amber); } }
    }
    .meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 10px; font-size: 11px; color: var(--c-text-3); }

    .chips { display: flex; gap: 6px; margin-bottom: 10px; }
    .chip {
      padding: 5px 12px; border-radius: 20px; border: 1.5px solid var(--c-border-2);
      background: var(--c-card); color: var(--c-text-2); font-size: 12px; font-weight: 700; cursor: pointer;
      &.on { background: var(--c-brand); border-color: var(--c-brand); color: #fff; }
    }

    .item-card {
      display: flex; align-items: flex-start; margin-bottom: 6px;
      border: 1.5px solid var(--c-border-2); border-radius: 14px; background: var(--c-card); overflow: hidden;
      &.bad { border-color: color-mix(in srgb, var(--c-danger) 45%, transparent); }
    }
    .ic-bar { width: 5px; align-self: stretch; flex-shrink: 0; }
    .ic-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding: 10px; }
    .ic-name { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--c-text); }
    .ic-detail { font-size: 11px; color: var(--c-text-3); overflow: hidden; text-overflow: ellipsis; }
    .ic-action {
      width: 36px; height: 36px; flex-shrink: 0; margin: 4px 4px 0 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; color: var(--c-text-3); cursor: pointer;
      .material-symbols-outlined { font-size: 19px; }
    }

    .detail { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
    .entry {
      display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px;
      border-radius: 8px; background: var(--c-subtle); font-size: 11.5px; color: var(--c-text-2);
      b { color: var(--c-text); font-weight: 700; }
      &.bad { background: color-mix(in srgb, var(--c-danger) 10%, var(--c-card)); }
    }
    pre {
      margin: 4px 0 0; padding: 8px; border-radius: 8px; background: var(--c-subtle);
      font-size: 10px; line-height: 1.35; color: var(--c-text-2); max-height: 260px; overflow: auto;
    }

    .kv { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--c-border-2); font-size: 11px; color: var(--c-text-3); &:last-of-type { border-bottom: none; } code { flex: 1; } }
    .tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; background: var(--c-subtle); color: var(--c-text-3); border: 1px solid var(--c-border-2); white-space: nowrap; }
    .tag-new { color: var(--c-brand); border-color: color-mix(in srgb, var(--c-brand) 45%, transparent); }
    .tag-bad { color: var(--c-danger); border-color: color-mix(in srgb, var(--c-danger) 45%, transparent); }

    .table { display: flex; flex-direction: column; margin-top: 10px; }
    .tr {
      display: grid; grid-template-columns: 1fr 1.1fr 1.1fr 0.9fr; gap: 6px;
      padding: 7px 6px; border-bottom: 1px solid var(--c-border-2); font-size: 11.5px; color: var(--c-text-2);
      &.th { font-weight: 700; color: var(--c-text-3); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px; }
      &.bad { background: color-mix(in srgb, var(--c-danger) 8%, transparent); .verdict { color: var(--c-danger); font-weight: 700; } }
    }

    .row-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .btn-primary {
      padding: 9px 16px; border-radius: 10px; border: none; background: var(--c-brand); color: #fff;
      font-size: 13px; font-weight: 700; cursor: pointer;
      &:disabled { opacity: 0.55; cursor: default; }
    }
    .btn-ghost {
      padding: 9px 16px; border-radius: 10px; border: 1.5px solid var(--c-border-2);
      background: var(--c-card); color: var(--c-text-2); font-size: 13px; font-weight: 700; cursor: pointer;
    }
    .empty { margin: 0; font-size: 12px; color: var(--c-text-3); }
    .err { margin: 10px 0 0; font-size: 12px; color: var(--c-danger); }
  `],
})
export class DebugLocalDataComponent {
  private auth     = inject(AuthService);
  private supabase = inject(SupabaseService).client;
  private feedback = inject(FeedbackService);

  readonly uid = this.auth.uid;

  /** Es rellegeix el localStorage cada cop que aquest comptador canvia. */
  private readonly tick = signal(0);

  readonly expanded       = signal<string | null>(null);
  readonly onlyEmpty      = signal(false);
  readonly onlyMismatches = signal(true);
  readonly comparing      = signal(false);
  readonly diff           = signal<DiffRow[]>([]);
  readonly diffError      = signal<string | null>(null);

  // ── Lectura en cru ────────────────────────────────────────────────────────
  readonly keys = computed(() => {
    this.tick();
    const out: { key: string; kb: string }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const kb = ((localStorage.getItem(key)?.length ?? 0) / 1024).toFixed(1);
      out.push({ key, kb });
    }
    return out.sort((a, b) => Number(b.kb) - Number(a.kb));
  });

  readonly totalKb = computed(() =>
    this.keys().reduce((sum, k) => sum + Number(k.kb), 0).toFixed(1)
  );

  readonly months = computed(() =>
    this.keys().filter(k => k.key.startsWith('gymgoli_month_')).map(k => k.key)
  );

  readonly pendingIds = computed((): string[] => {
    this.tick();
    const uid = this.uid();
    if (!uid) return [];
    return this.parse<string[]>(`gymgoli_sync_dirty_${uid}`) ?? [];
  });

  readonly insertIds = computed((): string[] => {
    this.tick();
    const uid = this.uid();
    if (!uid) return [];
    return this.parse<string[]>(`gymgoli_sync_inserts_${uid}`) ?? [];
  });

  /**
   * Totes les sessions guardades en local: la cau de mesos més les instantànies
   * de la cua de sincronització. Si un id surt a tots dos llocs mana la
   * instantània, que és l'última cosa que l'app ha volgut guardar.
   */
  readonly workouts = computed((): LocalWorkout[] => {
    const byId = new Map<string, LocalWorkout>();

    for (const { key } of this.keys()) {
      if (!key.startsWith('gymgoli_month_')) continue;
      for (const raw of this.parse<RawWorkout[]>(key) ?? []) {
        const w = this.toLocal(raw, 'month', key);
        if (w) byId.set(w.id, w);
      }
    }
    for (const { key } of this.keys()) {
      if (!key.startsWith('gymgoli_sync_snap_')) continue;
      const w = this.toLocal(this.parse<RawWorkout>(key), 'snapshot', key);
      if (w) byId.set(w.id, w);
    }

    return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly emptyWorkouts   = computed(() => this.workouts().filter(w => w.setCount === 0));
  readonly visibleWorkouts = computed(() => this.onlyEmpty() ? this.emptyWorkouts() : this.workouts());
  readonly mismatches      = computed(() => this.diff().filter(d => d.verdict !== 'ok'));
  readonly visibleDiff     = computed(() => this.onlyMismatches() ? this.mismatches() : this.diff());

  // ── Accions ───────────────────────────────────────────────────────────────
  toggle(id: string): void { this.expanded.set(this.expanded() === id ? null : id); }
  refresh(): void { this.tick.update(n => n + 1); }

  verdictLabel(v: DiffRow['verdict']): string { return VERDICT_LABEL[v]; }

  snapSetCount(id: string): number {
    const uid = this.uid();
    if (!uid) return 0;
    const snap = this.parse<RawWorkout>(`gymgoli_sync_snap_${uid}_${id}`);
    return this.countSets(snap);
  }

  pretty(raw: unknown): string { return JSON.stringify(raw, null, 2); }

  /** Demana al servidor tot l'historial i el posa costat per costat amb el
   *  que hi ha en local, que és l'única manera de veure què s'ha perdut. */
  async compare(): Promise<void> {
    const uid = this.uid();
    if (!uid) { this.diffError.set('Cal haver iniciat sessió.'); return; }

    this.comparing.set(true);
    this.diffError.set(null);
    try {
      const { data, error } = await this.supabase
        .from('workouts')
        .select('id, date, entries, status')
        .eq('user_id', uid)
        .order('date', { ascending: false });
      if (error) throw error;

      const server = new Map<string, RawWorkout>(
        (data ?? []).map(r => [(r as RawWorkout).id as string, r as RawWorkout])
      );
      const rows: DiffRow[] = [];

      for (const w of this.workouts()) {
        const s = server.get(w.id);
        const serverEntries = s ? (s.entries ?? []).length : null;
        const serverSets    = s ? this.countSets(s) : null;
        rows.push({
          id: w.id, date: w.date,
          localEntries: w.entries.length, localSets: w.setCount,
          serverEntries, serverSets,
          verdict: this.verdict(w.entries.length, w.setCount, serverEntries, serverSets),
        });
        server.delete(w.id);
      }
      for (const [id, s] of server) {
        rows.push({
          id, date: s.date ?? '—',
          localEntries: 0, localSets: 0,
          serverEntries: (s.entries ?? []).length, serverSets: this.countSets(s),
          verdict: 'local-missing',
        });
      }

      this.diff.set(rows.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (e) {
      this.diffError.set(`No s'ha pogut consultar el servidor: ${(e as Error).message}`);
    } finally {
      this.comparing.set(false);
    }
  }

  async copyAll(): Promise<void> {
    const dump: Record<string, unknown> = {};
    for (const { key } of this.keys()) dump[key] = this.parse(key) ?? localStorage.getItem(key);
    try {
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
      this.feedback.success('Copiat al porta-retalls');
    } catch {
      this.feedback.error('El navegador no ha deixat copiar');
    }
  }

  // ── Ajudants ──────────────────────────────────────────────────────────────
  /** Com queda un entrenament quan es mira als dos llocs alhora. La fila
   *  interessant és `server-empty`: en local hi ha sèries i al servidor no. */
  private verdict(
    localEntries: number, localSets: number,
    serverEntries: number | null, serverSets: number | null,
  ): DiffRow['verdict'] {
    if (serverEntries === null) return 'server-missing';
    if (localSets > 0 && serverSets === 0) return 'server-empty';
    if (localEntries !== serverEntries || localSets !== serverSets) return 'different';
    return 'ok';
  }

  private parse<T>(key: string): T | null {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; }
    catch { return null; }
  }

  private countSets(w: RawWorkout | null): number {
    return (w?.entries ?? []).reduce((sum, e) => sum + (e?.sets?.length ?? 0), 0);
  }

  private toLocal(raw: RawWorkout | null, source: LocalWorkout['source'], storeKey: string): LocalWorkout | null {
    if (!raw?.id) return null;
    return {
      id:        raw.id,
      date:      raw.date ?? '—',
      status:    raw.status ?? 'done',
      source, storeKey,
      entries:   (raw.entries ?? []).map(e => ({
        id:     e?.exerciseId ?? '?',
        name:   e?.exerciseName ?? '',
        sets:   e?.sets?.length ?? 0,
        detail: this.setsDetail(e?.sets),
      })),
      setCount:  this.countSets(raw),
      updatedAt: raw.updatedAt ?? raw.createdAt ?? '',
      raw,
    };
  }

  private setsDetail(sets: unknown[] | undefined): string {
    if (!Array.isArray(sets) || !sets.length) return '';
    return sets
      .map(s => { const x = s as { weight?: number; reps?: number }; return `${x?.weight ?? 0}×${x?.reps ?? 0}`; })
      .join(' · ');
  }
}
