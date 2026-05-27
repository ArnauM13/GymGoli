import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { WorkoutTemplate } from '../models/template.model';
import { ExerciseService } from './exercise.service';

const FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0);

const CRC_TABLE = [
  0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
  0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
];

function fitCrc(bytes: number[]): number {
  let crc = 0;
  for (const b of bytes) {
    let tmp = CRC_TABLE[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc ^= tmp ^ CRC_TABLE[b & 0xF];
    tmp = CRC_TABLE[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc ^= tmp ^ CRC_TABLE[(b >> 4) & 0xF];
  }
  return crc;
}

function w8(buf: number[], v: number): void  { buf.push(v & 0xFF); }
function w16(buf: number[], v: number): void { buf.push(v & 0xFF, (v >> 8) & 0xFF); }
function w32(buf: number[], v: number): void { buf.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF); }
function wStr(buf: number[], s: string, size: number): void {
  for (let i = 0; i < size; i++) buf.push(i < s.length ? s.charCodeAt(i) & 0x7F : 0x00);
}

@Injectable({ providedIn: 'root' })
export class FitWorkoutExportService {
  private exerciseService = inject(ExerciseService);
  private snackBar        = inject(MatSnackBar);

  export(template: WorkoutTemplate): void {
    if (template.entries.length === 0) {
      this.snackBar.open('La plantilla no té exercicis', '', { duration: 3000 });
      return;
    }

    const data: number[] = [];

    // ── file_id definition (local=0, global=0) ──────────────────
    w8(data, 0x40);       // definition record header
    w8(data, 0x00);       // reserved
    w8(data, 0x00);       // little-endian
    w16(data, 0);         // global msg 0
    w8(data, 3);          // 3 fields
    w8(data, 0); w8(data, 1); w8(data, 0x00);   // field 0: type, uint8
    w8(data, 1); w8(data, 2); w8(data, 0x84);   // field 1: manufacturer, uint16
    w8(data, 4); w8(data, 4); w8(data, 0x86);   // field 4: time_created, uint32

    // ── file_id data ─────────────────────────────────────────────
    const fitTs = Math.floor((Date.now() - FIT_EPOCH_MS) / 1000);
    w8(data, 0x00);   // local msg 0
    w8(data, 5);      // type = workout (5)
    w16(data, 1);     // manufacturer = Garmin (1)
    w32(data, fitTs);

    // ── workout definition (local=1, global=26) ──────────────────
    w8(data, 0x41);
    w8(data, 0x00);
    w8(data, 0x00);
    w16(data, 26);
    w8(data, 3);
    w8(data, 4);  w8(data, 1);  w8(data, 0x00);   // field 4: sport, uint8
    w8(data, 6);  w8(data, 2);  w8(data, 0x84);   // field 6: num_valid_steps, uint16
    w8(data, 8);  w8(data, 16); w8(data, 0x07);   // field 8: wkt_name, string[16]

    // ── workout data ─────────────────────────────────────────────
    const steps = this._buildSteps(template);
    w8(data, 0x01);
    w8(data, 4);                             // sport = training
    w16(data, steps.length);
    wStr(data, template.name.slice(0, 15), 16);

    // ── workout_step definition (local=2, global=27) ─────────────
    w8(data, 0x42);
    w8(data, 0x00);
    w8(data, 0x00);
    w16(data, 27);
    w8(data, 6);
    w8(data, 254); w8(data, 2); w8(data, 0x84);   // field 254: message_index, uint16
    w8(data, 0);   w8(data, 16); w8(data, 0x07);  // field 0: wkt_step_name, string[16]
    w8(data, 1);   w8(data, 1);  w8(data, 0x00);  // field 1: duration_type, uint8
    w8(data, 2);   w8(data, 4);  w8(data, 0x86);  // field 2: duration_value, uint32
    w8(data, 5);   w8(data, 1);  w8(data, 0x00);  // field 5: intensity, uint8
    w8(data, 11);  w8(data, 1);  w8(data, 0x02);  // field 11: num_reps_to_complete, uint8

    // ── workout_step data ─────────────────────────────────────────
    for (const step of steps) {
      w8(data, 0x02);
      w16(data, step.index);
      wStr(data, step.name, 16);
      w8(data, step.durationType);
      w32(data, step.durationValue);
      w8(data, step.intensity);
      w8(data, step.reps);
    }

    // ── header ────────────────────────────────────────────────────
    const header: number[] = [
      14, 0x10, 0xD0, 0x07,
      data.length & 0xFF, (data.length >> 8) & 0xFF, (data.length >> 16) & 0xFF, (data.length >> 24) & 0xFF,
      0x2E, 0x46, 0x49, 0x54,
      0x00, 0x00,
    ];

    const crc = fitCrc(data);
    const fileBytes = new Uint8Array([...header, ...data, crc & 0xFF, (crc >> 8) & 0xFF]);

    const safeName = template.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const filename  = `${safeName}.fit`;
    const url = URL.createObjectURL(new Blob([fileBytes], { type: 'application/octet-stream' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);

    this.snackBar.open(
      "Fitxer descarregat — Importa'l a Garmin Connect o Polar Flow per sincronitzar al rellotge",
      '',
      { duration: 5000 },
    );
  }

  private _buildSteps(template: WorkoutTemplate): Array<{
    index: number; name: string;
    durationType: number; durationValue: number;
    intensity: number; reps: number;
  }> {
    const steps: ReturnType<typeof this._buildSteps> = [];
    let idx = 0;

    for (const entry of template.entries) {
      const ex   = this.exerciseService.getById(entry.exerciseId);
      const sets = ex?.setsRange?.[0] ?? 3;
      const reps = ex?.repsRange?.[0] ?? 10;

      for (let s = 0; s < sets; s++) {
        steps.push({
          index: idx++,
          name: entry.exerciseName.slice(0, 15),
          durationType: 5,     // open
          durationValue: 0,
          intensity: 0,        // active
          reps,
        });
        steps.push({
          index: idx++,
          name: 'Descans',
          durationType: 0,     // time
          durationValue: 90_000,
          intensity: 1,        // rest
          reps: 0xFF,          // invalid / N/A
        });
      }
    }

    return steps;
  }
}
