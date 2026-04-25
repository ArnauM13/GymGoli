import { Injectable, computed, inject } from '@angular/core';

import { CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory } from '../models/exercise.model';
import { SportService } from './sport.service';
import { WorkoutService } from './workout.service';

export type InsightType =
  | 'setmana_fluixa'
  | 'prova_esport'
  | 'recupera_esport'
  | 'gran_setmana'
  | 'descansa'
  | 'equilibra_gym';

export interface FitnessInsight {
  type: InsightType;
  emoji: string;
  title: string;
  message: string;
  color: string;
}

const TODAY = (): string => new Date().toISOString().split('T')[0];

const GYM_CATS: ExerciseCategory[] = ['push', 'pull', 'legs'];

// "Push day?" / "Pull day?" / "Leg day?" — gym-culture shorthand the user already uses
const DAY_LABEL: Record<ExerciseCategory, string> = {
  push: 'Push day?',
  pull: 'Pull day?',
  legs: 'Leg day?',
};

function mondayOfWeek(dateStr: string): string {
  const d   = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000
  );
}

function daysAgoStr(n: number): string {
  if (n === 1) return 'ahir';
  if (n < 7)  return `fa ${n} dies`;
  if (n < 14) return 'fa una setmana';
  return `fa ${Math.round(n / 7)} setmanes`;
}

@Injectable({ providedIn: 'root' })
export class FitnessMetricsService {
  private workoutService = inject(WorkoutService);
  private sportService   = inject(SportService);

  readonly insights = computed((): FitnessInsight[] => {
    const today  = TODAY();
    const monday = mondayOfWeek(today);
    const weekAgo = offsetDate(today, -7);

    const workouts = this.workoutService.workouts();
    const sessions = this.sportService.sessions();
    const sports   = this.sportService.sports();

    // ── Current week ──────────────────────────────────────────────────────
    const weekWorkouts = workouts.filter(w => w.date >= monday && w.date <= today);
    const weekSessions = sessions.filter(s => s.date >= monday && s.date <= today);
    const weekTotal    = weekWorkouts.length + weekSessions.length;

    // ── Last 7 days ───────────────────────────────────────────────────────
    const last7Workouts = workouts.filter(w => w.date > weekAgo && w.date <= today);
    const last7Sessions = sessions.filter(s => s.date > weekAgo && s.date <= today);

    const candidates: FitnessInsight[] = [];

    // ── 1. Gran setmana (5+ activitats aquesta setmana) ───────────────────
    if (weekTotal >= 5) {
      candidates.push({
        type: 'gran_setmana',
        emoji: '🔥',
        title: 'Quin crack!',
        message: `Portes ${weekTotal} sessions aquesta setmana. Vas a tope i es nota!`,
        color: '#e65100',
      });
    }

    // ── 2. Descansa (6+ en 7 dies) ────────────────────────────────────────
    else if (last7Workouts.length + last7Sessions.length >= 6) {
      candidates.push({
        type: 'descansa',
        emoji: '😴',
        title: 'Ei, recorda el descans!',
        message: 'Has anat molt a tope els últims 7 dies. El descans també forma part de l\'entreno!',
        color: '#5e35b1',
      });
    }

    // ── 3. Setmana fluixa (<2 activitats i ja és dimecres o posterior) ────
    else {
      const dow = new Date(today + 'T12:00:00').getDay();
      if (weekTotal < 2 && (dow === 0 || dow >= 3)) {
        candidates.push({
          type: 'setmana_fluixa',
          emoji: '💤',
          title: 'Setmana tranquil·la...',
          message: 'Aquesta setmana has anat poc. Avui seria un bon dia per moure\'t una mica, no creus?',
          color: '#0288d1',
        });
      }
    }

    // ── 4. Prova esport (3+ gym però 0 esport en 7 dies) ─────────────────
    if (last7Workouts.length >= 3 && last7Sessions.length === 0 && sports.length > 0) {
      const favSport  = _favoriteSport(sessions, sports);
      const sportName = favSport ? favSport.name : 'algun esport';
      candidates.push({
        type: 'prova_esport',
        emoji: '🏃',
        title: 'Molta gym, gens d\'esport!',
        message: `Portes ${last7Workouts.length} entrenos seguits però res d\'esport. I si avui feies ${sportName}?`,
        color: '#2e7d32',
      });
    }

    // ── 5. Recupera esport preferit (fa 7+ dies sense fer-lo) ────────────
    if (sports.length > 0) {
      const favSport = _favoriteSport(sessions, sports);
      if (favSport) {
        const lastFav = sessions
          .filter(s => s.sportId === favSport.id)
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        const daysSince = lastFav ? daysBetween(lastFav.date, today) : 999;

        if (daysSince >= 7) {
          const ago = lastFav ? daysAgoStr(daysSince) : 'fa molt';
          candidates.push({
            type: 'recupera_esport',
            emoji: '😏',
            title: `Fa temps que no fas ${favSport.name}!`,
            message: `L'últim cop que vas fer ${favSport.name} va ser ${ago}. T'apuntes avui?`,
            color: favSport.color,
          });
        }
      }
    }

    // ── 6. Equilibra gym (desequilibri entre categories el darrer mes) ────
    const last28Str      = offsetDate(today, -28);
    const last28Workouts = workouts.filter(w => w.date > last28Str && w.date <= today);

    if (last28Workouts.length >= 3) {
      const counts = { push: 0, pull: 0, legs: 0 } as Record<ExerciseCategory, number>;
      for (const w of last28Workouts) {
        const cats = w.categories?.length ? w.categories : (w.category ? [w.category] : []);
        for (const c of cats) {
          if (c === 'push' || c === 'pull' || c === 'legs') counts[c as ExerciseCategory]++;
        }
      }

      const activeCats = GYM_CATS.filter(c => counts[c] > 0);
      if (activeCats.length >= 2) {
        const maxCount = Math.max(...GYM_CATS.map(c => counts[c]));
        const minCat   = GYM_CATS.reduce((a, b) => counts[a] <= counts[b] ? a : b);
        const gap      = maxCount - counts[minCat];

        if (gap >= 2) {
          const others = GYM_CATS
            .filter(c => c !== minCat && counts[c] > 0)
            .sort((a, b) => counts[b] - counts[a]);
          const othersStr = others
            .map(c => `${counts[c]} de ${CATEGORY_LABELS[c]}`)
            .join(' i ');
          const minLabel = CATEGORY_LABELS[minCat];
          const minStr   = counts[minCat] === 0
            ? `res de ${minLabel}`
            : `només ${counts[minCat]} de ${minLabel}`;

          candidates.push({
            type: 'equilibra_gym',
            emoji: '🏋️',
            title: DAY_LABEL[minCat],
            message: `El darrer mes has fet ${othersStr}, però ${minStr}. Li fotem?`,
            color: CATEGORY_COLORS[minCat],
          });
        }
      }
    }

    // ── Retorna màxim 2 per prioritat ─────────────────────────────────────
    const priority: InsightType[] = [
      'gran_setmana', 'descansa', 'setmana_fluixa',
      'recupera_esport', 'equilibra_gym', 'prova_esport',
    ];
    return candidates
      .sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type))
      .slice(0, 2);
  });
}

function _favoriteSport(
  sessions: { sportId: string }[],
  sports: { id: string; name: string; color: string }[]
): { id: string; name: string; color: string } | null {
  if (!sessions.length || !sports.length) return sports[0] ?? null;

  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(s.sportId, (counts.get(s.sportId) ?? 0) + 1);

  let bestId = '', bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) { bestCount = count; bestId = id; }
  }
  return sports.find(s => s.id === bestId) ?? sports[0] ?? null;
}
