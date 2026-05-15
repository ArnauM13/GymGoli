import { Injectable } from '@angular/core';

export interface FitData {
  durationSecs?: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  calories?: number;
  sport?: 'running' | 'cycling' | 'walking' | 'swimming' | 'other';
}

// Global message number for the "session" record
const MSG_SESSION = 18;

// FIT session field definition numbers
const F_SPORT    = 5;
const F_ELAPSED  = 7;   // uint32, scale ×1000 → seconds
const F_DISTANCE = 9;   // uint32, scale ×100  → metres
const F_CALORIES = 11;  // uint16
const F_AVG_HR   = 16;  // uint8
const F_MAX_HR   = 17;  // uint8

const SPORT_MAP: Record<number, FitData['sport']> = {
  1: 'running', 2: 'cycling', 5: 'swimming', 11: 'walking',
};

interface FieldDef { fieldNum: number; size: number; }
interface MsgDef   { globalMsgNum: number; le: boolean; fields: FieldDef[]; }

@Injectable({ providedIn: 'root' })
export class FitImportService {

  async parse(file: File): Promise<FitData> {
    const buf = await file.arrayBuffer();
    const view = new DataView(buf);

    if (view.byteLength < 12) throw new Error('Fitxer massa petit');

    const headerSize = view.getUint8(0);
    const magic = String.fromCharCode(
      view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11),
    );
    if (magic !== '.FIT') throw new Error('No és un fitxer .FIT vàlid');

    const dataEnd = headerSize + view.getUint32(4, true);
    const msgDefs = new Map<number, MsgDef>();
    const result: FitData = {};
    let offset = headerSize;

    while (offset < dataEnd && offset < view.byteLength) {
      const recHdr = view.getUint8(offset++);

      // Compressed timestamp record — skip data payload
      if (recHdr & 0x80) {
        const localType = (recHdr >> 5) & 0x03;
        const def = msgDefs.get(localType);
        if (def) offset += def.fields.reduce((s, f) => s + f.size, 0);
        continue;
      }

      const isDefinition  = !!(recHdr & 0x40);
      const hasDevData    = !!(recHdr & 0x20);
      const localMsgType  = recHdr & 0x0F;

      if (isDefinition) {
        offset++;                                          // reserved
        const le           = view.getUint8(offset++) === 0;
        const globalMsgNum = le
          ? view.getUint16(offset, true)
          : view.getUint16(offset, false);
        offset += 2;
        const numFields = view.getUint8(offset++);
        const fields: FieldDef[] = [];
        for (let i = 0; i < numFields; i++) {
          fields.push({ fieldNum: view.getUint8(offset), size: view.getUint8(offset + 1) });
          offset += 3;
        }
        // Skip developer field definitions if present
        if (hasDevData) {
          const numDevFields = view.getUint8(offset++);
          offset += numDevFields * 3;
        }
        msgDefs.set(localMsgType, { globalMsgNum, le, fields });

      } else {
        const def = msgDefs.get(localMsgType);
        if (!def) break;

        if (def.globalMsgNum === MSG_SESSION) {
          for (const f of def.fields) {
            const v = readUint(view, offset, f.size, def.le);
            switch (f.fieldNum) {
              case F_SPORT:
                result.sport = SPORT_MAP[v] ?? 'other'; break;
              case F_ELAPSED:
                if (v !== 0xFFFFFFFF) result.durationSecs = v / 1000; break;
              case F_DISTANCE:
                if (v !== 0xFFFFFFFF) result.distanceMeters = v / 100; break;
              case F_CALORIES:
                if (v !== 0xFFFF) result.calories = v; break;
              case F_AVG_HR:
                if (v !== 0xFF) result.avgHeartRate = v; break;
              case F_MAX_HR:
                if (v !== 0xFF) result.maxHeartRate = v; break;
            }
            offset += f.size;
          }
        } else {
          offset += def.fields.reduce((s, f) => s + f.size, 0);
        }
      }
    }

    if (result.durationSecs === undefined && result.distanceMeters === undefined) {
      throw new Error('No s\'han trobat dades de sessió al fitxer');
    }
    return result;
  }
}

function readUint(view: DataView, offset: number, size: number, le: boolean): number {
  switch (size) {
    case 1: return view.getUint8(offset);
    case 2: return view.getUint16(offset, le);
    case 4: return view.getUint32(offset, le);
    default: return 0;
  }
}
