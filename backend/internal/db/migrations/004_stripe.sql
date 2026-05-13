-- 004_stripe.sql — Stripe subscription columns + idempotent webhook log.
-- One subscription per user (matches the one-vault-per-owner rule).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS subscription_status    TEXT,
    ADD COLUMN IF NOT EXISTS subscription_plan      TEXT,
    ADD COLUMN IF NOT EXISTS current_period_end     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_end              TIMESTAMPTZ;

DO $$
BEGIN
    CREATE UNIQUE INDEX users_stripe_customer_key
        ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
END $$;

-- Webhook idempotency: every Stripe event id is recorded once and skipped on
-- replay. Stripe retries failed deliveries — without this we'd double-apply.
CREATE TABLE IF NOT EXISTS stripe_processed_events (
    event_id     TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
