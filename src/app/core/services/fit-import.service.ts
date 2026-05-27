import { Injectable } from '@angular/core';
import { ExerciseCategory } from '../models/exercise.model';

// ── Shared output types ──────────────────────────────────────────────────────

export interface ImportedSet     { reps: number; weightKg: number; }
export interface ImportedEntry   { exerciseName: string; category: ExerciseCategory; sets: ImportedSet[]; }
export interface ImportedWorkout {
  date: string;           // YYYY-MM-DD
  durationSecs?: number;
  calories?: number;
  avgHR?: number;
  maxHR?: number;
  entries: ImportedEntry[];
  source: 'garmin' | 'apple';
}

/** FIT sport-session data (used for the existing sport-session import flow). */
export interface FitData {
  durationSecs?: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  calories?: number;
  sport?: 'running' | 'cycling' | 'walking' | 'swimming' | 'other';
}

export type ImportResult =
  | { kind: 'workout'; data: ImportedWorkout }
  | { kind: 'sport';   data: FitData         };

// ── FIT protocol constants ───────────────────────────────────────────────────

const MSG_SESSION = 18;
const MSG_SET     = 137;

// Session fields
const SF_SPORT    = 5;
const SF_ELAPSED  = 7;   // uint32 / 1000 = seconds
const SF_DISTANCE = 9;   // uint32 / 100  = metres
const SF_CALORIES = 11;  // uint16
const SF_AVG_HR   = 16;  // uint8
const SF_MAX_HR   = 17;  // uint8

// Set fields
const SET_ELAPSED  = 0;   // uint32 / 1000 = seconds
const SET_REPS     = 3;   // uint16
const SET_WEIGHT   = 5;   // uint16 / 1000 = kg
const SET_TYPE     = 6;   // enum: 0=active, 1=rest
const SET_CATEGORY = 8;   // uint16[2] — first value = exercise category
const SET_SUBTYPE  = 9;   // uint16[2] — first value = exercise subtype

const SPORT_MAP: Record<number, FitData['sport']> = {
  1: 'running', 2: 'cycling', 5: 'swimming', 11: 'walking',
};

// Garmin exercise category → { Catalan name, GymGoli category }
const GARMIN_CAT: Record<number, { name: string; cat: ExerciseCategory }> = {
  0:  { name: 'Press de pit',           cat: 'push' },
  1:  { name: 'Elevació de panxell',     cat: 'legs' },
  6:  { name: 'Abdominals',             cat: 'legs' },
  7:  { name: 'Cúrls de bíceps',         cat: 'pull' },
  8:  { name: 'Pes mort',                cat: 'legs' },
  9:  { name: 'Obertures de pit',        cat: 'push' },
  13: { name: 'Hiperextensió',           cat: 'pull' },
  14: { name: 'Elevació lateral',        cat: 'push' },
  15: { name: 'Cúrl de cames',           cat: 'legs' },
  16: { name: 'Elevació de cames',       cat: 'legs' },
  17: { name: 'Estocades',               cat: 'legs' },
  18: { name: 'Aixecament olímpic',      cat: 'legs' },
  19: { name: 'Planxa',                  cat: 'push' },
  21: { name: 'Dominades',               cat: 'pull' },
  22: { name: 'Flexions',                cat: 'push' },
  23: { name: 'Rem',                     cat: 'pull' },
  24: { name: "Press d'espatlla",        cat: 'push' },
  26: { name: 'Encongiment espatlles',   cat: 'pull' },
  28: { name: 'Sentadilla',              cat: 'legs' },
  30: { name: 'Extensió de tríceps',     cat: 'push' },
};

// ── Parser internals ─────────────────────────────────────────────────────────

interface FieldDef { fieldNum: number; size: number; }
interface MsgDef   { globalMsgNum: number; le: boolean; fields: FieldDef[]; }

interface RawSet {
  category: number;     // Garmin exercise category enum
  reps: number;
  weightKg: number;
  isActive: boolean;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class FitImportService {

  /** Auto-detects strength training vs sport session and returns the right shape. */
  async parseAuto(file: File): Promise<ImportResult> {
    const buf  = await file.arrayBuffer();
    const view = new DataView(buf);

    if (view.byteLength < 12) throw new Error('Fitxer massa petit');

    const magic = String.fromCharCode(
      view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11),
    );
    if (magic !== '.FIT') throw new Error('No és un fitxer .FIT vàlid');

    const headerSize = view.getUint8(0);
    const dataEnd    = headerSize + view.getUint32(4, true);
    const msgDefs    = new Map<number, MsgDef>();

    const session: FitData = {};
    const rawSets: RawSet[] = [];
    let startTimestamp = 0;

    let offset = headerSize;
    while (offset < dataEnd && offset < view.byteLength) {
      const recHdr = view.getUint8(offset++);

      if (recHdr & 0x80) {
        // Compressed timestamp
        const localType = (recHdr >> 5) & 0x03;
        const def = msgDefs.get(localType);
        if (def) offset += def.fields.reduce((s, f) => s + f.size, 0);
        continue;
      }

      const isDefinition = !!(recHdr & 0x40);
      const hasDevData   = !!(recHdr & 0x20);
      const localType    = recHdr & 0x0F;

      if (isDefinition) {
        offset++;
        const le           = view.getUint8(offset++) === 0;
        const globalMsgNum = le ? view.getUint16(offset, true) : view.getUint16(offset, false);
        offset += 2;
        const numFields = view.getUint8(offset++);
        const fields: FieldDef[] = [];
        for (let i = 0; i < numFields; i++) {
          fields.push({ fieldNum: view.getUint8(offset), size: view.getUint8(offset + 1) });
          offset += 3;
        }
        if (hasDevData) {
          const n = view.getUint8(offset++);
          offset += n * 3;
        }
        msgDefs.set(localType, { globalMsgNum, le, fields });

      } else {
        const def = msgDefs.get(localType);
        if (!def) break;

        if (def.globalMsgNum === MSG_SESSION) {
          for (const f of def.fields) {
            const v = readUint(view, offset, f.size, def.le);
            switch (f.fieldNum) {
              case SF_SPORT:    session.sport    = SPORT_MAP[v] ?? 'other'; break;
              case SF_ELAPSED:  if (v !== 0xFFFFFFFF) session.durationSecs   = v / 1000; break;
              case SF_DISTANCE: if (v !== 0xFFFFFFFF) session.distanceMeters = v / 100;  break;
              case SF_CALORIES: if (v !== 0xFFFF) session.calories           = v; break;
              case SF_AVG_HR:   if (v !== 0xFF) session.avgHeartRate         = v; break;
              case SF_MAX_HR:   if (v !== 0xFF) session.maxHeartRate         = v; break;
            }
            if (f.fieldNum === 253 && startTimestamp === 0) startTimestamp = v; // session timestamp
            offset += f.size;
          }

        } else if (def.globalMsgNum === MSG_SET) {
          let reps = 0, weightKg = 0, cat = 0xFFFF, isActive = true;
          for (const f of def.fields) {
            switch (f.fieldNum) {
              case SET_REPS: {
                const v = readUint(view, offset, f.size, def.le);
                if (v !== 0xFFFF) reps = v;
                break;
              }
              case SET_WEIGHT: {
                const v = readUint(view, offset, f.size, def.le);
                if (v !== 0xFFFF) weightKg = v / 1000;
                break;
              }
              case SET_TYPE: {
                const v = readUint(view, offset, f.size, def.le);
                isActive = v === 0;
                break;
              }
              case SET_CATEGORY: {
                // Array of 2×uint16; only first element is the category
                const v = view.getUint16(offset, def.le);
                if (v !== 0xFFFF) cat = v;
                break;
              }
            }
            offset += f.size;
          }
          if (isActive && reps > 0) rawSets.push({ category: cat, reps, weightKg, isActive });

        } else {
          offset += def.fields.reduce((s, f) => s + f.size, 0);
        }
      }
    }

    // ── Classify result ──────────────────────────────────────────────────────

    if (rawSets.length > 0) {
      const entries = buildEntries(rawSets);
      const date    = startTimestamp > 0
        ? fitTimestampToDate(startTimestamp)
        : new Date().toISOString().split('T')[0];
      return {
        kind: 'workout',
        data: {
          date,
          durationSecs: session.durationSecs,
          calories:     session.calories,
          avgHR:        session.avgHeartRate,
          maxHR:        session.maxHeartRate,
          entries,
          source: 'garmin',
        },
      };
    }

    if (session.durationSecs === undefined && session.distanceMeters === undefined) {
      throw new Error('No s\'han trobat dades de sessió al fitxer');
    }
    return { kind: 'sport', data: session };
  }

  /** Legacy method kept for the existing sport-import flow. */
  async parse(file: File): Promise<FitData> {
    const result = await this.parseAuto(file);
    if (result.kind === 'sport') return result.data;
    // FIT workout used as sport session: extract summary fields
    const wk = result.data;
    return {
      durationSecs: wk.durationSecs,
      calories:     wk.calories,
      avgHeartRate: wk.avgHR,
      maxHeartRate: wk.maxHR,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readUint(view: DataView, offset: number, size: number, le: boolean): number {
  switch (size) {
    case 1: return view.getUint8(offset);
    case 2: return view.getUint16(offset, le);
    case 4: return view.getUint32(offset, le);
    default: return 0;
  }
}

function buildEntries(rawSets: RawSet[]): ImportedEntry[] {
  const map = new Map<number, ImportedEntry>();
  for (const s of rawSets) {
    const info = GARMIN_CAT[s.category];
    if (!info) continue;                         // unknown exercise category — skip
    if (!map.has(s.category)) {
      map.set(s.category, { exerciseName: info.name, category: info.cat, sets: [] });
    }
    map.get(s.category)!.sets.push({ reps: s.reps, weightKg: s.weightKg });
  }
  return [...map.values()];
}

// FIT timestamps are seconds since 1989-12-31 00:00:00 UTC
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0);

function fitTimestampToDate(ts: number): string {
  return new Date(FIT_EPOCH_MS + ts * 1000).toISOString().split('T')[0];
}
