package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// QueryResult is a generic tabular result for the NL-query feature (§8.2).
type QueryResult struct {
	Columns   []string `json:"columns"`
	Rows      [][]any  `json:"rows"`
	Truncated bool     `json:"truncated"`
}

// RunReadOnlyQuery executes a single SELECT in a READ ONLY transaction with a
// short statement timeout and a hard row cap. The read-only tx is the primary
// safety boundary (the DB rejects any write); on top of that we enforce a
// single-SELECT shape here. Callers must NEVER pass user-controlled SQL into this
// function — it has no table whitelist or parameterization of its own.
func (s *Store) RunReadOnlyQuery(ctx context.Context, sql string, maxRows int) (QueryResult, error) {
	if err := validateSingleSelect(sql); err != nil {
		return QueryResult{}, err
	}
	if maxRows <= 0 {
		maxRows = 500
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return QueryResult{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "SET LOCAL statement_timeout = 4000"); err != nil {
		return QueryResult{}, err
	}
	rows, err := tx.Query(ctx, sql)
	if err != nil {
		return QueryResult{}, err
	}
	defer rows.Close()

	fds := rows.FieldDescriptions()
	cols := make([]string, len(fds))
	for i, fd := range fds {
		cols[i] = string(fd.Name)
	}
	out := QueryResult{Columns: cols, Rows: [][]any{}}
	for rows.Next() {
		if len(out.Rows) >= maxRows {
			out.Truncated = true
			break
		}
		vals, err := rows.Values()
		if err != nil {
			return QueryResult{}, err
		}
		row := make([]any, len(vals))
		for i, v := range vals {
			row[i] = jsonSafe(v)
		}
		out.Rows = append(out.Rows, row)
	}
	if err := rows.Err(); err != nil {
		return QueryResult{}, err
	}
	return out, nil
}

// validateSingleSelect is a defence-in-depth shape check: it rejects multi-statement input and
// anything that isn't a read-only SELECT/WITH query. It is NOT a substitute for parameterization
// or a table whitelist — those remain the caller's responsibility.
func validateSingleSelect(sql string) error {
	trimmed := strings.TrimRight(strings.TrimSpace(sql), ";")
	if trimmed == "" {
		return fmt.Errorf("read-only query is empty")
	}
	if strings.Contains(trimmed, ";") {
		return fmt.Errorf("read-only query must be a single statement")
	}
	upper := strings.ToUpper(trimmed)
	if !strings.HasPrefix(upper, "SELECT") && !strings.HasPrefix(upper, "WITH") {
		return fmt.Errorf("read-only query must be a SELECT")
	}
	return nil
}

// jsonSafe coerces pgx-decoded values into JSON-friendly forms.
func jsonSafe(v any) any {
	switch x := v.(type) {
	case nil, bool, string, int16, int32, int64, float32, float64:
		return x
	case []byte:
		return string(x)
	case time.Time:
		return x.Format(time.RFC3339)
	default:
		return fmt.Sprintf("%v", x)
	}
}
