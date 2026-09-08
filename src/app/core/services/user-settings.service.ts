import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { onAppResume } from './app-resume.util';
import { DEFAULT_USER_SETTINGS, DifficultyScale, FitnessGoal, ThemeMode, UserSettings } from '../models/user-settings.model';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../models/weekly-plan.model';

/**
 * Els paràmetres de l'usuari, amb el mateix criteri que la resta de l'app:
 * primer el dispositiu, després el servidor.
 *
 * **Es pugen per camps, no el bloc sencer.** Abans cada canvi enviava tot
 * l'objecte tal com el tenia aquest dispositiu, i com que només es llegia una
 * vegada en entrar, era un bloc vell: canviaves l'objectiu setmanal al mòbil i
 * a la nit, tocant el tema fosc a l'ordinador, l'objectiu tornava al d'abans.
 * Cap dels dos dispositius feia res estrany — el segon simplement escrivia a
 * sobre amb una foto anterior. Ara puja només el que has canviat i el servidor
 * ho fusiona amb el que hi ha (`merge_user_settings`, migració 029), així que
 * dos dispositius que toquen coses diferents conserven les dues.
 *
 * **I el que no ha pujat es recorda.** Un canvi fet sense cobertura es perdia
 * en silenci; ara espera a `gymgoli_settings_pending_<uid>` fins que arriba, i
 * mentrestant mana per damunt del que digui el servidor.
 */
@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _settings    = signal<UserSettings>(DEFAULT_USER_SETTINGS);
  private readonly _loaded      = signal(false);
  private readonly _systemDark  = signal(
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  readonly settings            = this._settings.asReadonly();
  readonly loaded              = this._loaded.asReadonly();
  readonly metricsEnabled      = computed(() => this._settings().metricsEnabled);
  readonly goalMode            = computed(() => this._settings().goalMode);
  readonly weeklyActivityGoal  = computed(() => this._settings().weeklyActivityGoal ?? null);
  readonly weeklyGymGoal       = computed(() => this._settings().weeklyGymGoal ?? null);
  readonly weeklySportGoal     = computed(() => this._settings().weeklySportGoal ?? null);
  /** Whether the user has defined a weekly goal. This is deliberately
   *  independent of {@link metricsEnabled}: the weekly goal and the personalised
   *  insights are separate concepts — you can track a goal without insights, and
   *  insights merely lean on the goal (plus routines/history) when it exists. */
  readonly hasWeeklyGoal       = computed(() => {
    const s = this._settings();
    return (s.goalMode ?? 'combined') === 'combined'
      ? s.weeklyActivityGoal != null
      : s.weeklyGymGoal != null || s.weeklySportGoal != null;
  });
  readonly themeMode           = computed(() => this._settings().themeMode ?? 'system' as ThemeMode);
  readonly darkMode            = computed(() => {
    const mode = this.themeMode();
    if (mode === 'dark')   return true;
    if (mode === 'light')  return false;
    return this._systemDark();
  });
  readonly weightUnit          = computed(() => this._settings().weightUnit ?? 'kg');
  readonly restTimerSeconds    = computed(() => this._settings().restTimerSeconds ?? 90);
  readonly fitnessGoal         = computed(() => (this._settings().fitnessGoal ?? null) as FitnessGoal | null);
  readonly weeklyPlan          = computed(() => this._settings().weeklyPlan ?? EMPTY_WEEKLY_PLAN);
  readonly supersetsEnabled    = computed(() => this._settings().supersetsEnabled ?? false);
  readonly dropsetsEnabled     = computed(() => this._settings().dropsetsEnabled ?? false);
  readonly nextExerciseSuggestionEnabled = computed(() => this._settings().nextExerciseSuggestionEnabled ?? true);
  readonly rirEnabled          = computed(() => this._settings().rirEnabled ?? false);
  readonly manualRestEnabled   = computed(() => this._settings().manualRestEnabled ?? false);
  readonly difficultyScale     = computed(() => (this._settings().difficultyScale ?? 'emoji') as DifficultyScale);
  readonly bodyweightKg        = computed(() => this._settings().bodyweightKg ?? null);
  readonly bodyweightFactorEnabled = computed(() => this._settings().bodyweightFactorEnabled ?? false);
  readonly catalogSyncedVersion    = computed(() => this._settings().catalogSyncedVersion ?? 0);
  readonly dismissedBuiltInTemplateIds = computed(() => this._settings().dismissedBuiltInTemplateIds ?? []);
  readonly dismissedHints              = computed(() => this._settings().dismissedHints ?? []);
  readonly insightDismissedAt          = computed(() => this._settings().insightDismissedAt ?? {});
  readonly insightShownAt              = computed(() => this._settings().insightShownAt ?? {});
  readonly insightCelebrated           = computed(() => this._settings().insightCelebrated ?? []);
  readonly dismissedProposalDates      = computed(() => this._settings().dismissedProposalDates ?? []);
  readonly dismissedRoutinePlans       = computed(() => this._settings().dismissedRoutinePlans ?? []);
  readonly guidedTourDone              = computed(() => this._settings().guidedTourDone ?? false);

  constructor() {
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', e => this._systemDark.set(e.matches));
    }

    effect(() => {
      const uid = this.auth.uid();
      this._settings.set(DEFAULT_USER_SETTINGS);
      this._loaded.set(false);
      if (uid) this._load(uid);
    });

    // Una pestanya oberta des del matí es quedava amb els paràmetres del matí:
    // el mode fosc que havies posat al mòbil no hi arribava mai. De pas es
    // torna a provar el que hagi quedat pendent de pujar.
    onAppResume(() => {
      const uid = this.auth.uid();
      if (!uid) return;
      void this._pushPending(uid).then(() => this._pull(uid));
    });
  }

  private _lsKey(uid: string): string {
    return `gymgoli_settings_${uid}`;
  }

  private _pendingKey(uid: string): string {
    return `gymgoli_settings_pending_${uid}`;
  }

  private _readLocalStorage(uid: string): Partial<UserSettings> | null {
    try {
      const raw = localStorage.getItem(this._lsKey(uid));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  private _writeLocalStorage(uid: string, s: UserSettings): void {
    try { localStorage.setItem(this._lsKey(uid), JSON.stringify(s)); } catch { }
  }

  private _readPending(uid: string): Partial<UserSettings> {
    try {
      const raw = localStorage.getItem(this._pendingKey(uid));
      return raw ? JSON.parse(raw) as Partial<UserSettings> : {};
    } catch { return {}; }
  }

  private _writePending(uid: string, patch: Partial<UserSettings>): void {
    try {
      if (Object.keys(patch).length) localStorage.setItem(this._pendingKey(uid), JSON.stringify(patch));
      else localStorage.removeItem(this._pendingKey(uid));
    } catch { /* best-effort */ }
  }

  private async _load(uid: string): Promise<void> {
    const local = this._readLocalStorage(uid);

    if (local) {
      this._settings.set({ ...DEFAULT_USER_SETTINGS, ...local });
      this._loaded.set(true);
    }

    // Primer el que va quedar per pujar l'últim cop (sense cobertura, o amb el
    // servidor caigut): si no, la lectura de sota se l'endú per davant.
    await this._pushPending(uid);
    await this._pull(uid);
    this._loaded.set(true);
  }

  /** Llegeix el servidor i hi posa a sobre el que encara espera pujar — que és
   *  més nou que qualsevol cosa que el servidor pugui contestar. */
  private async _pull(uid: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', uid)
        .maybeSingle();

      if (error || !data?.settings) return;
      const merged = {
        ...DEFAULT_USER_SETTINGS,
        ...(data.settings as Partial<UserSettings>),
        ...this._readPending(uid),
      };
      this._settings.set(merged);
      this._writeLocalStorage(uid, merged);
    } catch { /* best-effort */ }
  }

  async update(patch: Partial<UserSettings>): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    if (!Object.keys(patch).length) return;

    const next = { ...this._settings(), ...patch };
    this._settings.set(next);
    this._writeLocalStorage(uid, next);
    // A la cua abans d'intentar res: si la pujada falla o l'usuari tanca
    // l'app ara mateix, el canvi continua constant com a pendent.
    this._writePending(uid, { ...this._readPending(uid), ...patch });

    await this._pushPending(uid);
  }

  /**
   * Puja el que espera, i el treu de la cua només si mentrestant no s'ha
   * tornat a tocar — la mateixa comparació que fa `SyncService` amb les
   * revisions dels entrenaments.
   *
   * El servidor fusiona per camps. Si la funció encara no hi és (una base de
   * dades sense la migració 029), es torna al `upsert` del bloc sencer: pitjor
   * entre dispositius, però millor que no guardar res.
   */
  private async _pushPending(uid: string): Promise<void> {
    // Una tanda cada cop: `update()` i el refresc en tornar a l'app poden
    // coincidir, i dues pujades alhora es trepitjarien la cua l'una a l'altra.
    this._pushing = this._pushing
      .catch(() => { /* la tanda d'abans ja s'ho ha mirat */ })
      .then(() => this._pushOnce(uid));
    return this._pushing;
  }

  private _pushing: Promise<void> = Promise.resolve();

  private async _pushOnce(uid: string): Promise<void> {
    const patch = this._readPending(uid);
    if (!Object.keys(patch).length) return;

    try {
      const { error } = await this.supabase.rpc('merge_user_settings', { p_patch: patch });
      if (error) {
        const missing = (error.code === 'PGRST202' || /merge_user_settings/i.test(error.message ?? ''));
        if (!missing) return; // xarxa o servidor KO: es queda pendent
        const { error: fallbackError } = await this.supabase
          .from('user_settings')
          .upsert(
            { user_id: uid, settings: this._settings(), updated_at: new Date().toISOString() },
            { onConflict: 'user_id' },
          );
        if (fallbackError) return;
      }
    } catch { return; /* es queda pendent */ }

    // Només marxa de la cua el que s'acaba d'enviar tal com s'ha enviat: el
    // que s'hagi tornat a canviar mentre la petició viatjava encara no ha
    // arribat enlloc i ha de sortir a la propera tanda.
    const now  = this._readPending(uid) as Record<string, unknown>;
    const sent = patch as Record<string, unknown>;
    const rest = Object.fromEntries(
      Object.entries(now).filter(([k, v]) => !(k in sent) || JSON.stringify(v) !== JSON.stringify(sent[k])),
    ) as Partial<UserSettings>;
    this._writePending(uid, rest);
  }

  async updateWeeklyPlan(plan: WeeklyPlan): Promise<void> {
    await this.update({ weeklyPlan: plan });
  }
}
