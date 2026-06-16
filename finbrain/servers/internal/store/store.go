// Package store is the data-access layer: a pgx connection pool plus query
// methods. P0 hand-writes SQL with pgx; sqlc is introduced in P1 as the query
// surface grows (see docs/IMPLEMENTATION_PLAN.md §1.2).
package store

import (
	"context"
	"errors"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a lookup matches no row.
var ErrNotFound = errors.New("not found")

// ErrInUse is returned when a delete would break an existing reference.
var ErrInUse = errors.New("in use")

// rowScanner is satisfied by both pgx.Row and pgx.Rows.
type rowScanner interface{ Scan(dest ...any) error }

// Store wraps a pgx pool.
type Store struct {
	pool   *pgxpool.Pool
	market *marketCache // global price/FX cache (TTL); shared, user-independent data
}

// New opens and verifies a connection pool.
func New(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	// Modest floor so the parallel net-worth trend (up to FINBRAIN_TREND_CONCURRENCY per-date
	// valuations) plus normal traffic don't starve, without hogging a small cloud DB's
	// max_connections (shared with other clients). Raise it for higher concurrency via the
	// DATABASE_URL, e.g. ?pool_max_conns=20 — an explicit URL value above this floor wins.
	if cfg.MaxConns < 12 {
		cfg.MaxConns = 12
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	ttl := 5 * time.Minute
	if v := strings.TrimSpace(os.Getenv("FINBRAIN_MARKET_CACHE_TTL")); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			ttl = d
		}
	}
	maxBars := 200_000 // ~25 MB of price bars; bounds cache memory regardless of #users/instruments
	if v := strings.TrimSpace(os.Getenv("FINBRAIN_MARKET_CACHE_MAX_BARS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxBars = n
		}
	}
	return &Store{pool: pool, market: newMarketCache(pool, ttl, maxBars)}, nil
}

// Close releases the pool.
func (s *Store) Close() { s.pool.Close() }
