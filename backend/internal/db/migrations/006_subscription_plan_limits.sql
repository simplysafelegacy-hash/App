-- 006_subscription_plan_limits.sql — configurable plan gates.
-- Handlers read these rows at runtime, so counts and document access can be
-- changed with ordinary data updates instead of a code deploy.

CREATE TABLE IF NOT EXISTS subscription_plan_limits (
    plan_code                    TEXT PRIMARY KEY,
    name                         TEXT NOT NULL,
    price_cents                  INTEGER NOT NULL DEFAULT 0,
    cadence                      TEXT NOT NULL DEFAULT 'per month',
    display_order                INTEGER NOT NULL DEFAULT 0,
    max_authorized_people        INTEGER NOT NULL DEFAULT 0,
    allow_will                   BOOLEAN NOT NULL DEFAULT TRUE,
    allow_power_of_attorney      BOOLEAN NOT NULL DEFAULT FALSE,
    allow_health_care_directive  BOOLEAN NOT NULL DEFAULT FALSE,
    active                       BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_plan_limits (
    plan_code, name, price_cents, cadence, display_order,
    max_authorized_people, allow_will, allow_power_of_attorney,
    allow_health_care_directive, active
) VALUES
    ('free', 'Free', 0, 'per month', 10, 0, TRUE, FALSE, FALSE, TRUE),
    ('individual', 'Individual', 800, 'per month', 20, 4, TRUE, TRUE, TRUE, TRUE),
    ('family', 'Family', 2000, 'per month', 30, 15, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (plan_code) DO UPDATE SET
    name = EXCLUDED.name,
    price_cents = EXCLUDED.price_cents,
    cadence = EXCLUDED.cadence,
    display_order = EXCLUDED.display_order,
    max_authorized_people = EXCLUDED.max_authorized_people,
    allow_will = EXCLUDED.allow_will,
    allow_power_of_attorney = EXCLUDED.allow_power_of_attorney,
    allow_health_care_directive = EXCLUDED.allow_health_care_directive,
    active = EXCLUDED.active,
    updated_at = NOW();
