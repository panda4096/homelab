package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Account is a fund/holding container at an institution (PRD §5.2.1). Institution
// is referenced by institution_id; Institution/InstitutionKind are joined names
// (read-only). CurrentBalance/LastSnapshotDate are computed and only set on reads.
type Account struct {
	ID               int64     `json:"id"`
	Name             string    `json:"name"`
	InstitutionID    int64     `json:"institution_id"`
	Institution      string    `json:"institution"`      // joined institutions.name
	InstitutionKind  *string   `json:"institution_kind"` // joined institutions.kind
	Currency         string    `json:"currency"`
	Kind             string    `json:"kind"`
	DisplayOrder     int       `json:"display_order"`
	IsArchived       bool      `json:"is_archived"`
	Note             *string   `json:"note"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
	CurrentBalance   *string   `json:"current_balance,omitempty"`
	LastSnapshotDate *string   `json:"last_snapshot_date,omitempty"`
}

// accountFull selects account + joined institution + computed fields (param $1 = today).
const accountFull = `
	SELECT a.id, a.name, a.institution_id, i.name, i.kind, a.currency, a.kind, a.display_order, a.is_archived, a.note, a.created_at, a.updated_at,
	  COALESCE(
	    (SELECT bs.balance::text FROM balance_snapshots bs
	       WHERE bs.account_id = a.id AND bs.snapshot_date <= $1::date
	       ORDER BY bs.snapshot_date DESC LIMIT 1),
	    (SELECT ROUND(SUM(lp.quantity * lp.avg_cost), 2)::text
	       FROM (
	         SELECT DISTINCT ON (ps.symbol)
	                ps.symbol, ps.quantity, ps.avg_cost,
	                COALESCE(ps.cost_currency, ins.quote_currency, a.currency) value_currency
	           FROM position_snapshots ps
	           LEFT JOIN instruments ins ON ins.symbol = ps.symbol
	          WHERE ps.account_id = a.id AND ps.snapshot_date <= $1::date
	          ORDER BY ps.symbol, ps.snapshot_date DESC
	       ) lp
	      WHERE lp.quantity > 0 AND lp.avg_cost IS NOT NULL AND lp.value_currency = a.currency)
	  ),
	  (SELECT max(d)::text FROM (
	     SELECT max(snapshot_date) d FROM balance_snapshots WHERE account_id = a.id
	     UNION ALL
	     SELECT max(snapshot_date)   FROM position_snapshots WHERE account_id = a.id) t)
	FROM accounts a JOIN institutions i ON i.id = a.institution_id AND i.user_id = a.user_id`

// accountMeta selects account + joined institution, no computed fields (NULLs).
const accountMeta = `
	SELECT a.id, a.name, a.institution_id, i.name, i.kind, a.currency, a.kind, a.display_order, a.is_archived, a.note, a.created_at, a.updated_at, NULL::text, NULL::text
	FROM accounts a JOIN institutions i ON i.id = a.institution_id AND i.user_id = a.user_id`

func scanAccount(row rowScanner) (Account, error) {
	var a Account
	err := row.Scan(&a.ID, &a.Name, &a.InstitutionID, &a.Institution, &a.InstitutionKind,
		&a.Currency, &a.Kind, &a.DisplayOrder, &a.IsArchived, &a.Note, &a.CreatedAt, &a.UpdatedAt,
		&a.CurrentBalance, &a.LastSnapshotDate)
	return a, err
}

// ListAccounts returns all accounts grouped-orderable by institution then account order.
func (s *Store) ListAccounts(ctx context.Context, userID int64, today string) ([]Account, error) {
	rows, err := s.pool.Query(ctx, accountFull+` WHERE a.user_id = $2 /* OWNED accounts */ ORDER BY a.is_archived, i.display_order, i.name, a.display_order, a.kind, a.name`, today, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Account{}
	for rows.Next() {
		a, err := scanAccount(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// GetAccount returns one account (with computed fields) or ErrNotFound.
func (s *Store) GetAccount(ctx context.Context, userID, id int64, today string) (Account, error) {
	a, err := scanAccount(s.pool.QueryRow(ctx, accountFull+` WHERE a.user_id = $2 AND a.id = $3 /* OWNED accounts */`, today, userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrNotFound
	}
	return a, err
}

func (s *Store) accountMetaByID(ctx context.Context, userID, id int64) (Account, error) {
	a, err := scanAccount(s.pool.QueryRow(ctx, accountMeta+` WHERE a.user_id = $1 AND a.id = $2 /* OWNED accounts */`, userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrNotFound
	}
	return a, err
}

// CreateAccount inserts a new account (institution_id must exist).
func (s *Store) CreateAccount(ctx context.Context, userID int64, a Account) (Account, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO accounts (user_id, name, institution_id, currency, kind, note, display_order)
		VALUES ($1, $2, $3, $4, $5, $6,
		        (SELECT COALESCE(MAX(display_order), -10) + 10 FROM accounts WHERE user_id = $1 AND institution_id = $3 /* OWNED accounts */))
		RETURNING id`,
		userID, a.Name, a.InstitutionID, a.Currency, a.Kind, a.Note).Scan(&id)
	if err != nil {
		return Account{}, err
	}
	return s.accountMetaByID(ctx, userID, id)
}

// UpdateAccount updates mutable fields by id. Institution and currency are fixed
// at creation because they define the account identity and snapshot semantics.
func (s *Store) UpdateAccount(ctx context.Context, userID int64, a Account) (Account, error) {
	ct, err := s.pool.Exec(ctx, `
		UPDATE accounts SET name=$2, kind=$3, display_order=$4, note=$5, is_archived=$6, updated_at=now()
		WHERE id=$1 AND user_id=$7 /* OWNED accounts */`,
		a.ID, a.Name, a.Kind, a.DisplayOrder, a.Note, a.IsArchived, userID)
	if err != nil {
		return Account{}, err
	}
	if ct.RowsAffected() == 0 {
		return Account{}, ErrNotFound
	}
	return s.accountMetaByID(ctx, userID, a.ID)
}

// AccountHasData reports whether the account has any balance or position snapshot.
func (s *Store) AccountHasData(ctx context.Context, userID, id int64) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM accounts a WHERE a.user_id=$1 AND a.id=$2 /* OWNED accounts */)
		   AND (
		       EXISTS(SELECT 1 FROM balance_snapshots WHERE account_id=$2)
		    OR EXISTS(SELECT 1 FROM position_snapshots WHERE account_id=$2)
		    OR EXISTS(SELECT 1 FROM credit_card_bills WHERE account_id=$2 OR payment_account_id=$2)
		    OR EXISTS(SELECT 1 FROM transactions WHERE account_id=$2)
		    OR EXISTS(SELECT 1 FROM transfers WHERE from_account_id=$2 OR to_account_id=$2)
		    OR EXISTS(SELECT 1 FROM income_events WHERE account_id=$2 OR payment_account_id=$2)
		   )`, userID, id).Scan(&exists)
	return exists, err
}

// DeleteAccount removes an account; caller must ensure AccountHasData is false.
func (s *Store) DeleteAccount(ctx context.Context, userID, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM accounts WHERE user_id=$1 AND id=$2 /* OWNED accounts */`, userID, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteAccountIfEmpty removes an account only if it has no balance/position data.
// The existence check and delete run in one transaction to avoid check-then-delete races.
func (s *Store) DeleteAccountIfEmpty(ctx context.Context, userID, id int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var lockedID int64
	if err := tx.QueryRow(ctx, `SELECT id FROM accounts WHERE user_id=$1 AND id=$2 /* OWNED accounts */ FOR UPDATE`, userID, id).Scan(&lockedID); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}

	var hasData bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM balance_snapshots WHERE account_id=$1)
		    OR EXISTS(SELECT 1 FROM position_snapshots WHERE account_id=$1)
		    OR EXISTS(SELECT 1 FROM credit_card_bills WHERE account_id=$1 OR payment_account_id=$1)
		    OR EXISTS(SELECT 1 FROM transactions WHERE account_id=$1)
		    OR EXISTS(SELECT 1 FROM transfers WHERE from_account_id=$1 OR to_account_id=$1)
		    OR EXISTS(SELECT 1 FROM income_events WHERE account_id=$1 OR payment_account_id=$1)`, id).Scan(&hasData); err != nil {
		return err
	}
	if hasData {
		return ErrInUse
	}

	ct, err := tx.Exec(ctx, `DELETE FROM accounts WHERE user_id=$1 AND id=$2 /* OWNED accounts */`, userID, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}

// CreateAccountsFromTemplate creates one account per blueprint under the given
// institution, in a single transaction. Account name = "<institution> <name_suffix>".
func (s *Store) CreateAccountsFromTemplate(ctx context.Context, userID, templateID, institutionID int64) ([]Account, error) {
	t, err := s.GetAccountTemplate(ctx, templateID)
	if err != nil {
		return nil, err
	}
	var blueprints []AccountBlueprint
	if err := json.Unmarshal(t.Blueprints, &blueprints); err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var institutionExists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM institutions WHERE user_id=$1 AND id=$2 /* OWNED institutions */)`, userID, institutionID).Scan(&institutionExists); err != nil {
		return nil, err
	}
	if !institutionExists {
		return nil, ErrNotFound
	}

	ids := make([]int64, 0, len(blueprints))
	for _, bp := range blueprints {
		var id int64
		name := bp.NameSuffix
		if err := tx.QueryRow(ctx, `
			INSERT INTO accounts (user_id, name, institution_id, currency, kind, note, display_order)
			VALUES ($1, $2, $3, $4, $5, $6,
			        (SELECT COALESCE(MAX(display_order), -10) + 10 FROM accounts WHERE user_id = $1 AND institution_id = $3 /* OWNED accounts */))
			RETURNING id`,
			userID, name, institutionID, bp.Currency, bp.Kind, bp.Note).Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, accountMeta+` WHERE a.user_id = $1 AND a.id = ANY($2::bigint[]) /* OWNED accounts */ ORDER BY a.id`, userID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Account{}
	for rows.Next() {
		a, err := scanAccount(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
