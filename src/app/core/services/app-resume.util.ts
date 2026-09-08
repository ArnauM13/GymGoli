/**
 * Tornar a l'app: el moment en què cal preguntar-se què ha canviat.
 *
 * Una pestanya oberta a l'ordinador des del matí no s'assabenta de res del
 * que has fet al mòbil pel camí. Els entrenaments i les sessions d'esport ja
 * es refresquen (cadascú amb el seu `refreshLoaded()`); els catàlegs —
 * exercicis, tipus, plantilles, paràmetres — es carregaven un sol cop en
 * entrar i es quedaven amb la foto d'aquell moment: l'exercici que has creat
 * al mòbil no existia a l'ordinador fins que no recarregaves la pàgina.
 *
 * Els tres senyals són el mateix esdeveniment vist de tres maneres i arriben
 * de cop, per això el marge: `focus` i `visibilitychange` es disparen alhora
 * quan tornes a l'app, i no cal demanar-ho tot dos cops.
 */

/** Marge mínim entre refrescos automàtics, el mateix que fan servir
 *  `WorkoutService` i `SportService`. */
export const RESUME_THROTTLE_MS = 10_000;

/**
 * Crida `handler` quan l'app torna a primer pla o recupera la connexió.
 *
 * Recuperar la connexió no espera el marge: és exactament el moment en què el
 * que tenim té més números de ser vell.
 */
export function onAppResume(handler: () => void, throttleMs = RESUME_THROTTLE_MS): void {
  if (typeof window === 'undefined') return;

  let last = 0;
  const run = (immediate: boolean): void => {
    const now = Date.now();
    if (!immediate && now - last < throttleMs) return;
    last = now;
    handler();
  };

  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(false); });
  window.addEventListener('focus', () => run(false));
  window.addEventListener('online', () => run(true));
}
