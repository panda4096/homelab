package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// AuditEvent is one row in the unified audit log — both human UI mutations and
// agent skill calls (PRD §8 agent contract).
type AuditEvent struct {
	ID               int64           `json:"id"`
	RequestID        string          `json:"request_id"`
	Actor            string          `json:"actor"`
	Source           string          `json:"source"` // ui | agent | apikey
	SkillName        *string         `json:"skill_name"`
	SkillType        *string         `json:"skill_type"`
	InputJSON        json.RawMessage `json:"input_json,omitempty"`
	OutputRowCount   *int            `json:"output_row_count"`
	AffectedEntities json.RawMessage `json:"affected_entities,omitempty"`
	NLSource         *string         `json:"natural_language_source"`
	ConfirmedByUser  bool            `json:"confirmed_by_user"`
	Status           string          `json:"status"`
	ErrorCode        *string         `json:"error_code"`
	HTTPMethod       *string         `json:"http_method"`
	HTTPPath         *string         `json:"http_path"`
	CreatedAt        time.Time       `json:"created_at"`
}

func rawOrNil(r json.RawMessage) any {
	if len(r) == 0 {
		return nil
	}
	return string(r)
}

func (s *Store) InsertAuditEvent(ctx context.Context, e AuditEvent) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO agent_audit (
			request_id, actor, source, skill_name, skill_type, input_json,
			output_row_count, affected_entities, natural_language_source,
			confirmed_by_user, status, error_code, http_method, http_path
		)
		VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11,$12,$13,$14)`,
		e.RequestID, nonBlank(e.Actor, "owner"), nonBlank(e.Source, "agent"),
		e.SkillName, e.SkillType, rawOrNil(e.InputJSON), e.OutputRowCount,
		rawOrNil(e.AffectedEntities), e.NLSource, e.ConfirmedByUser,
		nonBlank(e.Status, "ok"), e.ErrorCode, e.HTTPMethod, e.HTTPPath,
	)
	return err
}

const auditCols = `id, request_id, actor, source, skill_name, skill_type,
	COALESCE(input_json,'null')::text, output_row_count,
	COALESCE(affected_entities,'null')::text, natural_language_source,
	confirmed_by_user, status, error_code, http_method, http_path, created_at`

func (s *Store) ListAuditEvents(ctx context.Context, source string, limit int) ([]AuditEvent, error) {
	if limit <= 0 || limit > 1000 {
		limit = 200
	}
	rows, err := s.pool.Query(ctx, `
		SELECT `+auditCols+` FROM agent_audit
		WHERE ($1 = '' OR source = $1)
		ORDER BY created_at DESC, id DESC LIMIT $2`, source, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AuditEvent{}
	for rows.Next() {
		var e AuditEvent
		var input, affected string
		if err := rows.Scan(&e.ID, &e.RequestID, &e.Actor, &e.Source, &e.SkillName, &e.SkillType,
			&input, &e.OutputRowCount, &affected, &e.NLSource, &e.ConfirmedByUser, &e.Status,
			&e.ErrorCode, &e.HTTPMethod, &e.HTTPPath, &e.CreatedAt); err != nil {
			return nil, err
		}
		if input != "" && input != "null" {
			e.InputJSON = json.RawMessage(input)
		}
		if affected != "" && affected != "null" {
			e.AffectedEntities = json.RawMessage(affected)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// APIKey identifies an external agent caller. The secret is never stored — only
// its sha256 hash; the plaintext is returned once at creation.
type APIKey struct {
	ID         int64      `json:"id"`
	Name       string     `json:"name"`
	Prefix     string     `json:"prefix"`
	Scopes     string     `json:"scopes"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
	RevokedAt  *time.Time `json:"revoked_at"`
}

const apiKeyCols = `id, name, prefix, scopes, created_at, last_used_at, revoked_at`

func scanAPIKey(row rowScanner) (APIKey, error) {
	var k APIKey
	err := row.Scan(&k.ID, &k.Name, &k.Prefix, &k.Scopes, &k.CreatedAt, &k.LastUsedAt, &k.RevokedAt)
	return k, err
}

func (s *Store) CreateAPIKey(ctx context.Context, name, hash, prefix, scopes string) (APIKey, error) {
	var id int64
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO api_keys (name, key_hash, prefix, scopes) VALUES ($1,$2,$3,$4) RETURNING id`,
		name, hash, prefix, scopes).Scan(&id); err != nil {
		return APIKey{}, err
	}
	return s.GetAPIKey(ctx, id)
}

func (s *Store) GetAPIKey(ctx context.Context, id int64) (APIKey, error) {
	k, err := scanAPIKey(s.pool.QueryRow(ctx, `SELECT `+apiKeyCols+` FROM api_keys WHERE id=$1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return APIKey{}, ErrNotFound
	}
	return k, err
}

func (s *Store) ListAPIKeys(ctx context.Context) ([]APIKey, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+apiKeyCols+` FROM api_keys ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []APIKey{}
	for rows.Next() {
		k, err := scanAPIKey(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

func (s *Store) RevokeAPIKey(ctx context.Context, id int64) error {
	ct, err := s.pool.Exec(ctx, `UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ResolveAPIKey returns the live (non-revoked) key for a secret hash and stamps
// last_used_at. ErrNotFound when no active key matches.
func (s *Store) ResolveAPIKey(ctx context.Context, hash string) (APIKey, error) {
	k, err := scanAPIKey(s.pool.QueryRow(ctx, `SELECT `+apiKeyCols+` FROM api_keys WHERE key_hash=$1 AND revoked_at IS NULL`, hash))
	if errors.Is(err, pgx.ErrNoRows) {
		return APIKey{}, ErrNotFound
	}
	if err != nil {
		return APIKey{}, err
	}
	_, _ = s.pool.Exec(ctx, `UPDATE api_keys SET last_used_at=now() WHERE id=$1`, k.ID)
	return k, nil
}

func nonBlank(v, def string) string {
	if v == "" {
		return def
	}
	return v
}
