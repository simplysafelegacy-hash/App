-- 017_free_plan_will_only.sql — the free plan becomes will-only.
--
-- Signing up no longer amounts to a trial of the whole product. A free
-- account can record its will and where it's kept; every other section
-- (power of attorney, health care directive, personal property, non-probate
-- assets, funeral & burial wishes, important contacts) and every authorized
-- person now requires Individual or Family.
--
-- The two paid plans unlock exactly the same sections as each other — the
-- only thing separating them is max_authorized_people (4 vs 15, set in 006).

UPDATE subscription_plan_limits
SET max_authorized_people       = 0,
    allow_will                  = TRUE,
    allow_power_of_attorney     = FALSE,
    allow_health_care_directive = FALSE,
    allow_personal_property     = FALSE,
    allow_non_probate           = FALSE,
    allow_funeral               = FALSE,
    allow_contacts              = FALSE,
    updated_at                  = NOW()
WHERE plan_code = 'free';

UPDATE subscription_plan_limits
SET allow_will                  = TRUE,
    allow_power_of_attorney     = TRUE,
    allow_health_care_directive = TRUE,
    allow_personal_property     = TRUE,
    allow_non_probate           = TRUE,
    allow_funeral               = TRUE,
    allow_contacts              = TRUE,
    updated_at                  = NOW()
WHERE plan_code IN ('individual', 'family', 'safekeeping');
