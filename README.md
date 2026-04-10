# GymGoli

App personal de seguiment d'entrenaments construïda amb Angular 19 i Supabase.

## Stack

- **Angular 19** — Standalone components, Signals, control flow (`@if`, `@for`)
- **Angular Material 19** — UI components amb tema Material Design 3
- **Supabase** — Autenticació (Google OAuth + email/password) i base de dades PostgreSQL amb RLS
- **Chart.js 4** — Gràfiques d'evolució
- **Vercel** — Hosting i desplegament continu

## Funcionalitats

- **Avui** — Registra l'entrenament del dia: exercicis, sèries, pes, repeticions i sensació (🔥💪😐😓💀). Botó flotant per afegir exercicis, edició inline de sèries, botó de repetir l'última sèrie
- **Historial** — Consulta i edita entrenaments passats per calendari o llista
- **Exercicis** — Biblioteca organitzada per Push / Pull / Cames, amb subcategories i CRUD complet
- **Progrés** — Gràfiques d'evolució per exercici: pes màxim, volum total i fatiga

## Configuració Supabase

### 1. Crear les taules

Al **SQL Editor** del teu projecte Supabase, executa `supabase/schema.sql`.

### 2. Activar Google OAuth

- Authentication → Providers → Google → Enable
- Afegir el Client ID i Client Secret de [Google Cloud Console](https://console.cloud.google.com) (APIs & Services → Credentials → OAuth 2.0 Client ID)
- Redirect URI autoritzat: `https://<projecte>.supabase.co/auth/v1/callback`

### 3. Variables d'entorn

```bash
SUPABASE_URL=https://<projecte>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
ALLOWED_EMAILS=correu1@gmail.com,correu2@gmail.com  # opcional, deixar buit per permetre tothom
```

En local, edita directament `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  allowedEmails: [] as string[],
  supabase: {
    url: 'https://<projecte>.supabase.co',
    anonKey: '<anon-key>',
  },
};
```

## Instal·lació i execució

```bash
npm install
ng serve
```

## Desplegament (Vercel)

```bash
# Build de producció (equivalent al que fa Vercel)
node scripts/set-env.js && ng build
```

Les variables d'entorn `SUPABASE_URL`, `SUPABASE_ANON_KEY` i opcionalment `ALLOWED_EMAILS` s'han de configurar al dashboard de Vercel.

## Migració des de Firebase

Si tens dades a Firestore que vols migrar:

```bash
npm install firebase-admin
# Descarrega serviceAccountKey.json de Firebase Console → Project Settings → Service Accounts
SUPABASE_URL=... SUPABASE_SERVICE_KEY=<service-role-key> \
FIREBASE_SERVICE_ACCOUNT=./serviceAccountKey.json \
node scripts/migrate-to-supabase.js
```

## Estructura del projecte

```
src/app/
├── core/
│   ├── guards/          # auth.guard.ts
│   ├── models/          # exercise.model.ts, workout.model.ts
│   └── services/        # auth, supabase, exercise, workout services
├── features/
│   ├── auth/            # login.component.ts
│   ├── today/           # Entrenament del dia
│   ├── history/         # Historial d'entrenaments
│   ├── library/         # Biblioteca d'exercicis
│   └── charts/          # Gràfiques de progrés
├── shared/
│   └── components/      # nav-bar, workout-editor, exercise-stats-dialog
├── app.component.ts
├── app.config.ts
└── app.routes.ts
supabase/
└── schema.sql           # Taules, RLS i índexs
scripts/
├── set-env.js           # Genera environment.ts des de variables d'entorn
└── migrate-to-supabase.js  # Migració one-time des de Firebase
```
