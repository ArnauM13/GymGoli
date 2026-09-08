-- Migració 032: la rutina recurrent deixa de ser files
--
-- Executa-la a: Supabase Dashboard → SQL Editor → New query. És idempotent.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- QUÈ PASSAVA
-- ══════════════════════════════════════════════════════════════════════════════
-- Establir una rutina («els dilluns empenta, els dimecres cames, els dissabtes
-- córrer») escrivia **91 entrenaments planificats**: tretze setmanes per set
-- dies. Canviar-ne un dia els esborrava i els tornava a escriure tots.
--
-- Aquelles files no deien res que no se sabés ja. La rutina viu a
-- `user_settings.weeklyPlan` — un sol `jsonb`, petit, que ja se sincronitza
-- sol— i les 91 files n'eren una còpia desplegada: un càlcul guardat. Un càlcul
-- guardat que, a més, viatjava a cada consulta, ocupava espai a cada
-- dispositiu, s'havia de sincronitzar entre tots i es podia desaparellar de
-- l'original que el genera.
--
-- El client les projecta ara des del pla (`RoutineProjectionService`). El que
-- s'escriu a la base de dades és el que l'usuari **acaba fent**: començar un
-- dia projectat és el moment en què l'entrenament passa a existir.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- QUÈ FA AQUESTA MIGRACIÓ
-- ══════════════════════════════════════════════════════════════════════════════
-- Treu les files que van quedar de l'època anterior. Només toca:
--
--   * `status = 'planned'` — mai un entrenament fet. Un dia que va sortir de la
--     rutina però que l'usuari va entrenar de veritat és història seva i es
--     queda, com qualsevol altre.
--   * `planned_source = 'routine'` — ni les planificacions manuals (un dia
--     concret triat a mà, que no es dedueix de cap regla i continua sent una
--     fila) ni les antigues `'self'`, que són d'abans que existís la
--     distinció i no se sap de quina de les dues venien.
--
-- L'ordre en què s'apliquen aquesta migració i la versió nova del client no
-- importa: mentre les files hi siguin, el client no proposa el mateix dia dues
-- vegades —una fila real d'aquell dia i tipus tapa la projecció—, i quan
-- desapareguin la projecció ocupa el seu lloc. Cap dels dos ordres deixa
-- l'usuari amb duplicats ni amb el calendari buit.

DELETE FROM workouts
 WHERE status = 'planned'
   AND planned_source = 'routine';

DELETE FROM sport_sessions
 WHERE status = 'planned'
   AND planned_source = 'routine';
