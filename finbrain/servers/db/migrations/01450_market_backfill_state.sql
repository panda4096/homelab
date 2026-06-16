-- +goose Up
-- Tracks which instruments have had their full price history fetched by the auto-feed.
-- Existence of a price row is NOT a sufficient signal (the latest-price refresh writes a
-- few recent bars), so backfill is gated on this explicit marker, set only on success.
CREATE TABLE IF NOT EXISTS market_backfill_state (
    symbol        text PRIMARY KEY REFERENCES instruments(symbol) ON DELETE CASCADE,
    backfilled_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS market_backfill_state;
