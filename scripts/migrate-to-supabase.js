/**
 * One-time migration script: Firebase Firestore → Supabase
 *
 * Usage:
 *   1. npm install firebase-admin @supabase/supabase-js
 *   2. Download your Firebase service account JSON from:
 *      Firebase Console → Project Settings → Service Accounts → Generate new private key
 *   3. Create a Supabase service-role key from:
 *      Supabase Dashboard → Project Settings → API → service_role key
 *   4. Run:
 *      SUPABASE_URL=https://xxx.supabase.co \
 *      SUPABASE_SERVICE_KEY=your_service_role_key \
 *      FIREBASE_SERVICE_ACCOUNT=./serviceAccountKey.json \
 *      node scripts/migrate-to-supabase.js
 *
 * The script:
 *  - Reads all Firestore users/{uid}/exercises and users/{uid}/workouts
 *  - Inserts exercises into Supabase (skipping duplicates by name)
 *  - Inserts workouts into Supabase (skipping duplicates by date+user)
 *  - Remaps exercise IDs in workout entries (Firestore ID → Supabase UUID)
 *  - Skips users already migrated (idempotent)
 *
 * IMPORTANT: Use the service_role key (not anon key) to bypass RLS.
 */

const admin      = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL         = process.env['SUPABASE_URL'];
const SUPABASE_SERVICE_KEY = process.env['SUPABASE_SERVICE_KEY'];
const SERVICE_ACCOUNT_PATH = process.env['FIREBASE_SERVICE_ACCOUNT'] ?? './serviceAccountKey.json';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

// ── Init Firebase Admin ──────────────────────────────────────────────────────
const serviceAccount = require(require('path').resolve(SERVICE_ACCOUNT_PATH));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Init Supabase (service role bypasses RLS) ────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function migrate() {
  console.log('🚀  Starting migration…\n');

  // List all users from Firestore users/ collection
  const usersSnap = await db.collection('users').listDocuments();
  console.log(`Found ${usersSnap.length} user(s) to migrate\n`);

  let totalExercises = 0;
  let totalWorkouts  = 0;

  for (const userRef of usersSnap) {
    const uid = userRef.id;
    console.log(`── User: ${uid}`);

    // ── Migrate exercises ──────────────────────────────────────────────────
    const exSnap = await db.collection(`users/${uid}/exercises`).get();
    const oldIdToNewId = new Map(); // Firestore ID → Supabase UUID

    // Fetch existing exercises in Supabase for this user
    const { data: existingEx } = await supabase
      .from('exercises')
      .select('id, name')
      .eq('user_id', uid);

    const existingByName = new Map((existingEx ?? []).map(e => [e.name.toLowerCase(), e.id]));

    let exImported = 0;
    for (const exDoc of exSnap.docs) {
      const data = exDoc.data();
      const nameLower = (data.name ?? '').toLowerCase();

      if (existingByName.has(nameLower)) {
        // Already exists — just record the mapping
        oldIdToNewId.set(exDoc.id, existingByName.get(nameLower));
        continue;
      }

      const row = { user_id: uid, name: data.name, category: data.category };
      if (data.subcategory) row.subcategory = data.subcategory;
      if (data.notes)       row.notes       = data.notes;

      const { data: inserted, error } = await supabase
        .from('exercises')
        .insert(row)
        .select('id')
        .single();

      if (error) {
        console.warn(`  ⚠️  Exercise "${data.name}": ${error.message}`);
        continue;
      }
      oldIdToNewId.set(exDoc.id, inserted.id);
      existingByName.set(nameLower, inserted.id);
      exImported++;
    }
    console.log(`  exercises: ${exImported} imported, ${exSnap.docs.length - exImported} skipped`);
    totalExercises += exImported;

    // ── Migrate workouts ───────────────────────────────────────────────────
    const wSnap = await db.collection(`users/${uid}/workouts`).get();

    // Fetch existing workout dates in Supabase for this user
    const { data: existingW } = await supabase
      .from('workouts')
      .select('date')
      .eq('user_id', uid);
    const existingDates = new Set((existingW ?? []).map(w => w.date));

    let wImported = 0;
    for (const wDoc of wSnap.docs) {
      const data = wDoc.data();
      const date = data.date;

      if (existingDates.has(date)) {
        console.log(`  skip workout ${date} (already exists)`);
        continue;
      }

      // Remap exerciseIds in entries
      const entries = (data.entries ?? []).map(e => {
        const newId = oldIdToNewId.get(e.exerciseId);
        return newId ? { ...e, exerciseId: newId } : e;
      });

      const row = {
        user_id:    uid,
        date:       date,
        entries:    entries,
        categories: data.categories ?? (data.category ? [data.category] : []),
      };
      if (data.category) row.category = data.category;
      if (data.notes)    row.notes    = data.notes;

      const { error } = await supabase.from('workouts').insert(row);
      if (error) {
        console.warn(`  ⚠️  Workout ${date}: ${error.message}`);
        continue;
      }
      existingDates.add(date);
      wImported++;
    }
    console.log(`  workouts:  ${wImported} imported, ${wSnap.docs.length - wImported} skipped\n`);
    totalWorkouts += wImported;
  }

  // ── Also migrate root-level legacy data ────────────────────────────────
  // Only if you have data in root /exercises and /workouts collections
  // (the old pre-user-scoped version). Skip if not applicable.

  console.log('✅  Migration complete!');
  console.log(`   Total exercises imported: ${totalExercises}`);
  console.log(`   Total workouts imported:  ${totalWorkouts}`);
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌  Migration failed:', err);
  process.exit(1);
});
