# GymTracker

App de seguiment d'entrenaments construïda amb Angular 19 i Firebase Firestore.

## Stack

- **Angular 19** — Standalone components, Signals, nova sintaxi de control flow (`@if`, `@for`)
- **Angular Material 19** — UI components amb tema Material Design 3
- **Firebase Firestore** — Base de dades en temps real al núvol
- **Chart.js 4** — Gràfiques d'evolució

## Funcionalitats

- **Avui** — Registra l'entrenament del dia: exercicis, sèries, pes, repeticions i sensació (💀😓😐💪🔥)
- **Historial** — Consulta entrenaments passats per data, expandible per veure detalls
- **Exercicis** — Biblioteca d'exercicis organitzats per Push / Pull / Cames, amb CRUD complet
- **Progrés** — Gràfiques d'evolució per exercici: pes màxim, volum total i fatiga

## Configuració Firebase

1. Crea un projecte a [Firebase Console](https://console.firebase.google.com)
2. Activa **Firestore Database** en mode test
3. Ve a **Project Settings → Your apps** i copia la configuració
4. Edita `src/environments/environment.ts` amb les teves credencials:

```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: 'xxx',
    authDomain: 'xxx.firebaseapp.com',
    projectId: 'xxx',
    storageBucket: 'xxx.appspot.com',
    messagingSenderId: 'xxx',
    appId: 'xxx',
  },
};
```

### Regles de Firestore (desenvolupament)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> Per producció, afegeix autenticació i restringeix les regles.

## Instal·lació i execució

```bash
npm install
ng serve
```

## Estructura del projecte

```
src/app/
├── core/
│   ├── models/          # exercise.model.ts, workout.model.ts
│   └── services/        # exercise.service.ts, workout.service.ts
├── features/
│   ├── today/           # Entrenament del dia
│   ├── history/         # Historial d'entrenaments
│   ├── library/         # Biblioteca d'exercicis
│   └── charts/          # Gràfiques de progrés
├── shared/
│   └── components/
│       └── nav-bar/     # Navegació inferior
├── app.component.ts     # Shell (standalone)
├── app.config.ts        # Providers (Firebase, Router...)
└── app.routes.ts        # Rutes amb lazy loading
```

## Commits suggerits

| Commit | Contingut |
|--------|-----------|
| `feat: migrate to Angular 19 standalone` | package.json, angular.json, main.ts, app.config, app.routes, app.component |
| `feat: add data models and Firebase services` | core/models/, core/services/ |
| `feat: add shared navbar` | shared/components/nav-bar/ |
| `feat: add exercise library` | features/library/ |
| `feat: add today workout tracker` | features/today/ |
| `feat: add workout history` | features/history/ |
| `feat: add progress charts` | features/charts/ |
| `feat: global styles and cleanup` | styles.scss, index.html, README |
