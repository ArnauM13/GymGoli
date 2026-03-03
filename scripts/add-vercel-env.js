// Reads Firebase config from environment.ts and pushes to Vercel env vars.
// Run once: node scripts/add-vercel-env.js
const fs = require('fs');
const { execSync } = require('child_process');

const content = fs.readFileSync('src/environments/environment.ts', 'utf8');
const extract = key => content.match(new RegExp(key + ':\\s*["\']([^"\']+)["\']'))?.[1] || '';

const vars = {
  FIREBASE_API_KEY: extract('apiKey'),
  FIREBASE_AUTH_DOMAIN: extract('authDomain'),
  FIREBASE_PROJECT_ID: extract('projectId'),
  FIREBASE_STORAGE_BUCKET: extract('storageBucket'),
  FIREBASE_MESSAGING_SENDER_ID: extract('messagingSenderId'),
  FIREBASE_APP_ID: extract('appId'),
};

for (const [key, value] of Object.entries(vars)) {
  if (!value) { console.log('SKIP (empty):', key); continue; }
  try {
    // Remove existing (ignore error if not exists)
    try { execSync(`vercel env rm ${key} production --yes`, { stdio: 'pipe' }); } catch {}
    // Add new value
    execSync(`vercel env add ${key} production --yes`, {
      input: value + '\n',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log('✅', key);
  } catch (e) {
    console.log('❌', key, e.stderr?.toString().split('\n')[0] ?? e.message);
  }
}
console.log('\nDone. Run: vercel redeploy --prod');
