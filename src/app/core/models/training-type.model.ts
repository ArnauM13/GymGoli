/**
 * Training types (the "Gym" workout categories) are user-configurable, exactly
 * like sports. The three built-ins — Empenta / Tracció / Cames — keep the stable
 * ids `push` / `pull` / `legs` so every existing exercise and workout, whose
 * `category` field stores one of those ids, keeps resolving without a data
 * migration. Users can add, edit and remove their own on top.
 *
 * Muscle subgroups (see {@link ExerciseSubcategory}) are intentionally NOT tied
 * to a training type: an exercise's primary muscle group is chosen freely,
 * independent of which type the workout is.
 */
export interface TrainingType {
  /** Stable id. Built-ins are `push` / `pull` / `legs`; custom ones are UUIDs. */
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Optional descriptive muscle line, e.g. "Pit · Espatlles · Tríceps". */
  muscles?: string;
  /** True for the three shipped defaults. */
  builtIn?: boolean;
  createdAt?: Date;
}

/** The three defaults, seeded on first login. Ids MUST stay stable. */
export const DEFAULT_TRAINING_TYPES: TrainingType[] = [
  { id: 'push', name: 'Empenta', icon: 'fitness_center',    color: '#e57373', muscles: 'Pit · Espatlles · Tríceps',        builtIn: true },
  { id: 'pull', name: 'Tracció', icon: 'sports_gymnastics', color: '#64b5f6', muscles: 'Esquena · Bíceps · Avantbraços',   builtIn: true },
  { id: 'legs', name: 'Cames',   icon: 'directions_run',    color: '#81c784', muscles: 'Quàdriceps · Isquiotibials · Glutis', builtIn: true },
];

/** Selectable Material Symbol icons for training types. */
export const TRAINING_TYPE_ICONS: string[] = [
  'fitness_center', 'sports_gymnastics', 'directions_run', 'exercise',
  'sprint', 'self_improvement', 'sports_martial_arts', 'accessibility_new',
  'front_hand', 'back_hand', 'skateboarding', 'rowing', 'cardio_load',
  'health_and_safety', 'bolt', 'whatshot',
];

/** Preset colours for training types (kept distinct from the built-ins). */
export const TRAINING_TYPE_COLORS: string[] = [
  '#e57373', '#64b5f6', '#81c784', '#ffb74d',
  '#ba68c8', '#4db6ac', '#f06292', '#7986cb',
  '#a1887f', '#90a4ae', '#dce775', '#4fc3f7',
];

// ── Runtime registry ─────────────────────────────────────────────────────────
//
// A module-level registry lets the synchronous colour/label/icon accessors
// (used by pure utils and template helpers all over the app) resolve custom
// types without threading a service through every call site. It is seeded with
// the built-in defaults immediately and refreshed by TrainingTypeService once
// the user's list has loaded.

const _registry = new Map<string, TrainingType>();
function _seed(): void {
  _registry.clear();
  for (const t of DEFAULT_TRAINING_TYPES) _registry.set(t.id, { ...t });
}
_seed();

/** Replace the registry with the user's full list (built-ins + custom). */
export function setTrainingTypeRegistry(types: TrainingType[]): void {
  if (!types.length) { _seed(); return; }
  _registry.clear();
  for (const t of types) _registry.set(t.id, t);
}

/** All types currently in the registry, in insertion order. */
export function trainingTypeList(): TrainingType[] { return [..._registry.values()]; }

export function trainingTypeById(id: string): TrainingType | undefined { return _registry.get(id); }

export function categoryLabel(id: string): string { return _registry.get(id)?.name ?? id; }
export function categoryIcon(id: string): string { return _registry.get(id)?.icon ?? 'fitness_center'; }
export function categoryColor(id: string): string { return _registry.get(id)?.color ?? '#006874'; }
export function categoryMuscles(id: string): string { return _registry.get(id)?.muscles ?? ''; }

// ── Backwards-compatible record-shaped views ───────────────────────────────
//
// Historically the codebase indexed `CATEGORY_COLORS[cat]`, `CATEGORY_LABELS[cat]`
// etc. directly. Backing those names with a Proxy over the registry keeps every
// one of those resolution sites working AND makes them resolve custom types for
// free — no call-site change needed. Enumeration sites (grids, filters) read the
// live list from TrainingTypeService instead.

function recordView(pick: (t: TrainingType) => string, fallback?: (id: string) => string): Record<string, string> {
  return new Proxy({} as Record<string, string>, {
    get: (_t, key) => {
      if (typeof key !== 'string') return undefined;
      const t = _registry.get(key);
      return t ? pick(t) : fallback?.(key);
    },
    has: (_t, key) => typeof key === 'string' && _registry.has(key),
    ownKeys: () => [..._registry.keys()],
    getOwnPropertyDescriptor: (_t, key) =>
      typeof key === 'string' && _registry.has(key)
        ? { enumerable: true, configurable: true, value: pick(_registry.get(key)!) }
        : undefined,
  });
}

/** Custom-type ids are UUIDs; showing one raw would be noise, so orphaned ids
 *  (a deleted type still referenced by old workouts) get a human label. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Labels always resolve to something readable (call sites interpolate them
// directly); colours/icons/muscles return undefined for unknown ids so each
// call site's own `?? fallback` keeps working exactly as before.
export const CATEGORY_LABELS  = recordView(t => t.name, id => UUID_RE.test(id) ? 'Tipus eliminat' : id);
export const CATEGORY_ICONS   = recordView(t => t.icon);
export const CATEGORY_COLORS  = recordView(t => t.color);
export const CATEGORY_MUSCLES = recordView(t => t.muscles ?? '');
