-- 019: Distinguish the persistent recurring routine from the user's own
-- ad-hoc planning (single day picked directly on Train, or a single week
-- planned via the calendar's "Planificar" action), so deleting/editing one
-- never affects the other.
--
-- Previously every planned workout created outside a trainer proposal was
-- tagged planned_source = 'self', regardless of whether it came from the
-- recurring routine or from the user manually planning a day/week. That
-- made it impossible to retract just one of the two without also wiping
-- out the other. 'self' rows are left untouched by this migration (there's
-- no way to know which of the two they originally came from) and are
-- simply treated as belonging to neither going forward.

ALTER TYPE planned_source_t ADD VALUE IF NOT EXISTS 'routine';
ALTER TYPE planned_source_t ADD VALUE IF NOT EXISTS 'manual';

ALTER TABLE sport_sessions
  ADD COLUMN IF NOT EXISTS planned_source planned_source_t;
