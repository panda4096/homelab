// Package store is the data-access layer: a pgx connection pool plus query
// methods. P0 hand-writes SQL with pgx; sqlc is introduced in P1 as the query
// surface grows (see docs/IMPLEMENTATION_PLAN.md §1.2).
package store

import (
	"context"
	"errors"

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
	pool *pgxpool.Pool
}

// New opens and verifies a connection pool.
func New(ctx context.Context, databaseURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

// Close releases the pool.
func (s *Store) Close() { s.pool.Close() }
