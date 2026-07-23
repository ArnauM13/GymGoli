import {
  Exercise, ExerciseCategory, ExerciseSubcategory,
  SUBCATEGORY_LABELS, SUBCATEGORY_OPTIONS,
} from '../../core/models/exercise.model';

/**
 * Smart "next exercise" engine.
 *
 * Learns from the user's own history (past workouts + saved templates) which
 * exercise they tend to reach for next, given the workout they're building
 * right now. It blends four signals, each derived only from that user's data:
 *
 *  · frequency  — how often an exercise shows up in this kind of day
 *  · sequence   — what they usually do right after the last exercise, and
 *                 what tends to follow the exercises already logged today
 *  · position   — what tends to sit in this slot (1st, 2nd, 3rd… exercise)
 *  · balance    — how many of each muscle group they usually train that day.
 *                 If they normally do 2 biceps + 1 back on pull days and have
 *                 already done 2 biceps, back gets pushed up and biceps down.
 *
 * The function is pure so it can be unit-tested with fixed fixtures.
 */

export interface ExerciseSuggestion {
  exerciseId: string;
  exerciseName: string;
  /** Blended score, higher is a better guess. Only relative order matters. */
  score: number;
  /** Short Catalan explanation shown to the user. */
  reason: string;
}

/** One ordered training day the engine can learn from. */
export interface SuggestionSource {
  /** Exercise ids in the order they were performed / planned. */
  exerciseIds: string[];
  /** Relative importance (recency for workouts, a flat factor for templates). */
  weight: number;
}

export interface SuggestionInput {
  category: ExerciseCategory;
  /** Exercises already in the workout being built, in order. */
  currentEntryIds: string[];
  sources: SuggestionSource[];
  /** Catalog lookup — provides name, category and subcategory per id. */
  exerciseById: Map<string, Exercise>;
  limit?: number;
}

// Signal weights — tuned so sequence and balance lead, with frequency and the
// "follows what I've already done" signal as supporting evidence.
const W_FREQ    = 1.0;
const W_BIGRAM  = 1.7;
const W_POS     = 1.0;
const W_FOLLOW  = 0.8;
const W_BALANCE = 1.5;

/** Soft suppression applied to a muscle group the user has already filled. */
const SATISFIED_GATE = 0.25;

function subcatsOf(category: ExerciseCategory): Set<ExerciseSubcategory> {
  // Defensive: `category` originates from an untyped Workout.category string
  // cast to ExerciseCategory, so a legacy/foreign value (anything that isn't a
  // real gym category) has no subcategory table. Fall back to an empty set
  // instead of crashing on `undefined.map(...)` — a throw here bubbles up
  // through the template expression that reads the suggestions and, via the
  // global error handler, into an unstoppable toast loop.
  return new Set((SUBCATEGORY_OPTIONS[category] ?? []).map(o => o.value));
}

function normalize(map: Map<string, number>): (id: string) => number {
  let max = 0;
  for (const v of map.values()) if (v > max) max = v;
  return (id: string) => (max > 0 ? (map.get(id) ?? 0) / max : 0);
}

export function suggestNextExercises(input: SuggestionInput): ExerciseSuggestion[] {
  const { category, currentEntryIds, sources, exerciseById } = input;
  const limit = input.limit ?? 5;

  const catSubs   = subcatsOf(category);
  const currentSet = new Set(currentEntryIds);

  // ── Aggregate the four raw signals across every source day ────────────────
  const freq      = new Map<string, number>();                 // id → weight seen
  const bigram    = new Map<string, Map<string, number>>();    // prev → next → weight
  const afterAny  = new Map<string, Map<string, number>>();    // prev → laterId → weight
  const posFreq   = new Map<number, Map<string, number>>();    // slot → id → weight

  // Typical count of each subcategory per day of this category.
  const subTargetSum = new Map<ExerciseSubcategory, number>();
  let totalWeight = 0;

  const bump = (m: Map<string, Map<string, number>>, a: string, b: string, w: number) => {
    let inner = m.get(a);
    if (!inner) { inner = new Map(); m.set(a, inner); }
    inner.set(b, (inner.get(b) ?? 0) + w);
  };

  for (const src of sources) {
    const ids = src.exerciseIds;
    if (ids.length === 0) continue;
    totalWeight += src.weight;

    const seenSub = new Map<ExerciseSubcategory, number>();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      freq.set(id, (freq.get(id) ?? 0) + src.weight);

      let slot = posFreq.get(i);
      if (!slot) { slot = new Map(); posFreq.set(i, slot); }
      slot.set(id, (slot.get(id) ?? 0) + src.weight);

      if (i > 0) bump(bigram, ids[i - 1], id, src.weight);
      for (let j = 0; j < i; j++) bump(afterAny, ids[j], id, src.weight);

      const sub = exerciseById.get(id)?.subcategory;
      if (sub && catSubs.has(sub)) seenSub.set(sub, (seenSub.get(sub) ?? 0) + 1);
    }
    for (const [sub, count] of seenSub) {
      subTargetSum.set(sub, (subTargetSum.get(sub) ?? 0) + count * src.weight);
    }
  }

  if (totalWeight === 0) return [];

  // Average count per day → the user's typical volume for each muscle group.
  const subTarget = new Map<ExerciseSubcategory, number>();
  for (const [sub, sum] of subTargetSum) subTarget.set(sub, sum / totalWeight);

  // What's already covered in the day being built.
  const subCurrent = new Map<ExerciseSubcategory, number>();
  for (const id of currentEntryIds) {
    const sub = exerciseById.get(id)?.subcategory;
    if (sub && catSubs.has(sub)) subCurrent.set(sub, (subCurrent.get(sub) ?? 0) + 1);
  }

  // ── Candidate pool: catalog exercises of this category, not already added ──
  const candidates = [...exerciseById.values()]
    .filter(e => e.category === category && !currentSet.has(e.id));
  if (candidates.length === 0) return [];

  const lastId   = currentEntryIds[currentEntryIds.length - 1] ?? null;
  const nextPos  = currentEntryIds.length;

  // Per-candidate raw components (normalized afterwards for a fair blend).
  const freqRaw   = new Map<string, number>();
  const bigramRaw = new Map<string, number>();
  const posRaw    = new Map<string, number>();
  const followRaw = new Map<string, number>();
  const balRaw    = new Map<string, number>();          // unmet need for the group
  const needBySub = new Map<ExerciseSubcategory, number>();

  for (const e of candidates) {
    freqRaw.set(e.id, freq.get(e.id) ?? 0);

    const bg = lastId ? (bigram.get(lastId)?.get(e.id) ?? 0)
                      : (posFreq.get(0)?.get(e.id) ?? 0);
    bigramRaw.set(e.id, bg);

    posRaw.set(e.id, posFreq.get(nextPos)?.get(e.id) ?? 0);

    let follow = 0;
    for (const prev of currentSet) follow += afterAny.get(prev)?.get(e.id) ?? 0;
    followRaw.set(e.id, currentEntryIds.length ? follow / currentEntryIds.length : 0);

    const sub = e.subcategory;
    let need = 0;
    if (sub && catSubs.has(sub)) {
      need = (subTarget.get(sub) ?? 0) - (subCurrent.get(sub) ?? 0);
      needBySub.set(sub, need);
    }
    balRaw.set(e.id, Math.max(need, 0));
  }

  const nFreq   = normalize(freqRaw);
  const nBigram = normalize(bigramRaw);
  const nPos    = normalize(posRaw);
  const nFollow = normalize(followRaw);
  const nBal    = normalize(balRaw);

  const catLabel = { push: 'empenta', pull: 'tracció', legs: 'cames' }[category];

  const scored = candidates.map(e => {
    const sub = e.subcategory;
    const target = sub ? (subTarget.get(sub) ?? 0) : 0;
    const need   = sub ? (needBySub.get(sub) ?? 0) : 0;
    // A muscle group the user has already filled for the day is suppressed,
    // but only when we actually have a target for it.
    const gate = sub && catSubs.has(sub) && target > 0 && need <= 0.0001
      ? SATISFIED_GATE : 1;

    const parts = {
      freq:   W_FREQ    * nFreq(e.id),
      bigram: W_BIGRAM  * nBigram(e.id),
      pos:    W_POS     * nPos(e.id),
      follow: W_FOLLOW  * nFollow(e.id),
      bal:    W_BALANCE * nBal(e.id),
    };
    const score = (parts.freq + parts.bigram + parts.pos + parts.follow + parts.bal) * gate;

    return { e, score, parts, need, sub };
  })
  .filter(s => s.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);

  return scored.map(({ e, score, parts, need, sub }) => {
    const subLabel = sub ? (SUBCATEGORY_LABELS[sub] ?? '').toLowerCase() : '';
    const lastName = lastId ? exerciseById.get(lastId)?.name : undefined;

    let reason: string;
    const dominant = Math.max(parts.bal, parts.bigram, parts.pos, parts.freq, parts.follow);
    if (dominant === parts.bal && need >= 0.75 && subLabel) {
      reason = `Sols fer ${subLabel} en aquest punt`;
    } else if (dominant === parts.bigram && lastName) {
      reason = `Acostumes a fer-lo després de ${lastName}`;
    } else if (dominant === parts.pos && nextPos > 0) {
      reason = `Sol ser el teu exercici ${nextPos + 1}`;
    } else if (dominant === parts.follow && lastName) {
      reason = `Encaixa amb el que ja has fet`;
    } else {
      reason = `El fas sovint en dies de ${catLabel}`;
    }

    return { exerciseId: e.id, exerciseName: e.name, score, reason };
  });
}
