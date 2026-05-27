#!/usr/bin/env node
/**
 * Genera un fitxer .FIT de prova amb dades d'entrenament de força
 * per testar l'import de GymGoli sense tenir un rellotge Garmin.
 *
 * Ús:   node scripts/generate-test-fit.js
 * Sortida: scripts/sample-garmin.fit
 */

const fs   = require('fs');
const path = require('path');

// L'epoch del protocol FIT: 1989-12-31 00:00:00 UTC
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0);
const fitNow = Math.floor((Date.now() - FIT_EPOCH_MS) / 1000);

// Buffer dinàmic
const bytes = [];
const w8  = v => bytes.push(v & 0xFF);
const w16 = v => bytes.push(v & 0xFF, (v >> 8) & 0xFF);
const w32 = v => bytes.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);

// ── Definició: sessió (local type 0) ────────────────────────────────────────
w8(0x40);     // record header: definició, local type 0
w8(0x00);     // reservat
w8(0x00);     // arquitectura: little endian
w16(18);      // global msg num: session
w8(6);        // 6 camps
//  camp      mida  baseType
w8(253); w8(4); w8(0x86);  // timestamp       uint32
w8(7);   w8(4); w8(0x86);  // elapsed_time    uint32 (÷1000 = segons)
w8(9);   w8(4); w8(0x86);  // distance        uint32 (÷100 = metres)
w8(11);  w8(2); w8(0x84);  // calories        uint16
w8(16);  w8(1); w8(0x02);  // avg_heart_rate  uint8
w8(17);  w8(1); w8(0x02);  // max_heart_rate  uint8

// ── Dades: sessió ────────────────────────────────────────────────────────────
w8(0x00);
w32(fitNow);          // timestamp avui
w32(48 * 60 * 1000);  // 48 minuts en ms (÷1000 = 2880 s)
w32(0xFFFFFFFF);      // sense distància (gimnàs, sense GPS)
w16(340);             // 340 kcal
w8(151);              // FC mitjana 151 bpm
w8(179);              // FC màxima 179 bpm

// ── Definició: set (local type 1) ────────────────────────────────────────────
w8(0x41);     // record header: definició, local type 1
w8(0x00);
w8(0x00);
w16(137);     // global msg num: set
w8(4);        // 4 camps
w8(3);  w8(2); w8(0x84);  // repeticions  uint16
w8(5);  w8(2); w8(0x84);  // pes          uint16 (÷1000 = kg)
w8(6);  w8(1); w8(0x00);  // set_type     enum  (0=actiu, 1=descans)
w8(8);  w8(4); w8(0x84);  // category     uint16[2] (4 bytes)

function set(category, reps, weightKg) {
  // Notes sobre els límits: uint16 max = 65535 → màx 65.535 kg amb escala 1000
  // Per pesos superiors caldria una codificació diferent; aquí usem ≤65 kg
  const wEncoded = Math.round(weightKg * 1000);
  if (wEncoded > 65535) throw new Error(`Pes ${weightKg}kg excedeix uint16 (max 65.535 kg)`);
  w8(0x01);          // dades, local type 1
  w16(reps);
  w16(wEncoded);
  w8(0x00);          // set_type = actiu
  w16(category);     // category[0]
  w16(0xFFFF);       // category[1] = invàlid
}

// ── Entrenament de prova: dia Push ───────────────────────────────────────────
// Garmin cat 0  = BENCH_PRESS   → "Press de pit"
// Garmin cat 24 = SHOULDER_PRESS → "Press d'espatlla"
// Garmin cat 30 = TRICEPS_EXTENSION → "Extensió de tríceps"

console.log('Generant entrenament Push...');

// Press de pit — 3 sèries
set(0, 12, 50);
set(0,  9, 57.5);
set(0,  7, 62.5);

// Press d'espatlla — 3 sèries
set(24, 12, 30);
set(24, 10, 35);
set(24,  8, 37.5);

// Extensió de tríceps — 2 sèries
set(30, 15, 20);
set(30, 12, 22.5);

// ── Construeix el fitxer final ────────────────────────────────────────────────
const data   = Buffer.from(bytes);
const header = Buffer.alloc(14, 0);
header[0] = 14;
header[1] = 0x10;                      // protocol version 1.0
header.writeUInt16LE(2000, 2);         // profile version
header.writeUInt32LE(data.length, 4);  // mida de les dades
Buffer.from('.FIT').copy(header, 8);   // magic string
// bytes [12-13]: header CRC = 0x0000 (omès, vàlid)

const output  = Buffer.concat([header, data]);
const outPath = path.join(__dirname, 'sample-garmin.fit');
fs.writeFileSync(outPath, output);

console.log(`✓  ${outPath}  (${output.length} bytes)`);
console.log('   Press de pit ×3  |  Press espatlla ×3  |  Extensió tríceps ×2');
console.log('   48 min · 340 kcal · FC avg 151 bpm · FC màx 179 bpm');
