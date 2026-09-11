-- Migració 036: el ioga deixa de fer boxa
--
-- Executa-la a: Supabase Dashboard → SQL Editor → New query. És idempotent:
-- passar-la dues vegades no canvia res la segona.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- EL PROBLEMA
-- ══════════════════════════════════════════════════════════════════════════════
-- El catàleg d'esports de sèrie donava al Yoga la icona `sports_martial_arts`
-- —un ninot fent un cop de puny— perquè a la roda d'icones no hi havia res
-- millor. Ara hi és `self_improvement`, la postura asseguda, i és la que porta
-- el catàleg (`DEFAULT_SPORTS`, a `core/models/sport.model.ts`).
--
-- Això, però, només arregla els comptes nous: la icona es guarda amb la fila
-- de l'esport, i qui ja tenia el Yoga sembrat continuava veient el ninot. Un
-- `UPDATE` és l'única manera d'arreglar-los tots alhora, i per aquí passa.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- QUÈ TOCA, I QUÈ NO
-- ══════════════════════════════════════════════════════════════════════════════
-- Només les files que encara porten **exactament** el que va sembrar el
-- catàleg: un esport que es diu Yoga i que encara té la icona antiga. Qui ja
-- se l'hagi canviada —a `self_improvement` o a qualsevol altra— no s'hi toca,
-- i el ninot es queda a tots els altres esports que el facin servir de debò
-- (arts marcials, boxa…), que és per al que és.
--
-- El nom es compara sense majúscules ni espais de vora perquè el catàleg l'ha
-- escrit «Yoga» però l'usuari se'l pot haver reanomenat «ioga» sense tocar la
-- icona; l'esport continua sent el mateix.
--
-- Els esports són del servidor: el client els torna a demanar a cada
-- arrencada i reescriu la còpia de `localStorage` amb el que arriba (vegeu
-- `SportService._doLoadSports`). No hi ha res pendent de pujar que pugui
-- desfer això, i tothom ho veurà el primer cop que obri l'app.
--
-- Cal executar-la des del SQL Editor (rol `postgres`): el RLS de `sports`
-- deixa veure només les files pròpies, i aquest `UPDATE` ha d'arribar a les
-- de tothom.

UPDATE sports
   SET icon = 'self_improvement'
 WHERE icon = 'sports_martial_arts'
   AND lower(trim(name)) IN ('yoga', 'ioga');

-- Comprovació: després de passar-la, això ha de tornar 0 files.
--
--   SELECT count(*) FROM sports
--    WHERE icon = 'sports_martial_arts'
--      AND lower(trim(name)) IN ('yoga', 'ioga');
