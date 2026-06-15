package store

import (
	"context"
	"errors"
	"sort"

	"github.com/jackc/pgx/v5"
)

func (s *Store) ListAllocationTargetSets(ctx context.Context, userID int64) ([]AllocationTargetSet, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, dimension, drift_threshold_pct::text, is_dashboard_visible, is_archived, note, created_at, updated_at
		FROM allocation_target_sets
		WHERE user_id=$1 /* OWNED allocation_target_sets */
		ORDER BY is_archived, name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AllocationTargetSet{}
	byID := map[int64]int{}
	for rows.Next() {
		var s AllocationTargetSet
		if err := rows.Scan(&s.ID, &s.Name, &s.Dimension, &s.DriftThresholdPct, &s.IsDashboardVisible, &s.IsArchived, &s.Note, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		s.Items = []AllocationTargetItem{}
		byID[s.ID] = len(out)
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	itemRows, err := s.pool.Query(ctx, `
		SELECT set_id, id, dimension_value, target_pct::text
		FROM allocation_target_items
		WHERE user_id=$1 /* OWNED allocation_target_items */
		ORDER BY set_id, dimension_value`, userID)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()
	for itemRows.Next() {
		var setID int64
		var it AllocationTargetItem
		if err := itemRows.Scan(&setID, &it.ID, &it.DimensionValue, &it.TargetPct); err != nil {
			return nil, err
		}
		if idx, ok := byID[setID]; ok {
			out[idx].Items = append(out[idx].Items, it)
		}
	}
	return out, itemRows.Err()
}

func (s *Store) GetAllocationTargetSet(ctx context.Context, userID, id int64) (AllocationTargetSet, error) {
	var set AllocationTargetSet
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, dimension, drift_threshold_pct::text, is_dashboard_visible, is_archived, note, created_at, updated_at
		FROM allocation_target_sets WHERE user_id=$1 AND id=$2 /* OWNED allocation_target_sets */`, userID, id).Scan(
		&set.ID, &set.Name, &set.Dimension, &set.DriftThresholdPct, &set.IsDashboardVisible, &set.IsArchived, &set.Note, &set.CreatedAt, &set.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return AllocationTargetSet{}, ErrNotFound
	}
	if err != nil {
		return AllocationTargetSet{}, err
	}
	set.Items = []AllocationTargetItem{}
	rows, err := s.pool.Query(ctx, `SELECT id, dimension_value, target_pct::text FROM allocation_target_items WHERE user_id=$1 AND set_id=$2 /* OWNED allocation_target_items */ ORDER BY dimension_value`, userID, id)
	if err != nil {
		return AllocationTargetSet{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var it AllocationTargetItem
		if err := rows.Scan(&it.ID, &it.DimensionValue, &it.TargetPct); err != nil {
			return AllocationTargetSet{}, err
		}
		set.Items = append(set.Items, it)
	}
	return set, rows.Err()
}

// SaveAllocationTargetSet inserts (id==0) or updates a set and replaces its items
// in one transaction.
func (s *Store) SaveAllocationTargetSet(ctx context.Context, userID int64, set AllocationTargetSet) (AllocationTargetSet, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AllocationTargetSet{}, err
	}
	defer tx.Rollback(ctx)

	id := set.ID
	if id == 0 {
		err = tx.QueryRow(ctx, `
			INSERT INTO allocation_target_sets (user_id, name, dimension, drift_threshold_pct, is_dashboard_visible, is_archived, note, updated_at) /* OWNED allocation_target_sets */
			VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, now()) RETURNING id`,
			userID, set.Name, set.Dimension, set.DriftThresholdPct, set.IsDashboardVisible, set.IsArchived, set.Note).Scan(&id)
		if err != nil {
			return AllocationTargetSet{}, err
		}
	} else {
		ct, err := tx.Exec(ctx, `
			UPDATE allocation_target_sets
			SET name=$3, dimension=$4, drift_threshold_pct=$5::numeric, is_dashboard_visible=$6, is_archived=$7, note=$8, updated_at=now()
			WHERE user_id=$1 AND id=$2 /* OWNED allocation_target_sets */`,
			userID, id, set.Name, set.Dimension, set.DriftThresholdPct, set.IsDashboardVisible, set.IsArchived, set.Note)
		if err != nil {
			return AllocationTargetSet{}, err
		}
		if ct.RowsAffected() == 0 {
			return AllocationTargetSet{}, ErrNotFound
		}
		if _, err := tx.Exec(ctx, `DELETE FROM allocation_target_items WHERE user_id=$1 AND set_id=$2 /* OWNED allocation_target_items */`, userID, id); err != nil {
			return AllocationTargetSet{}, err
		}
	}
	for _, it := range set.Items {
		if _, err := tx.Exec(ctx, `
			INSERT INTO allocation_target_items (user_id, set_id, dimension_value, target_pct, updated_at) /* OWNED allocation_target_items */
			VALUES ($1, $2, $3, $4::numeric, now())`, userID, id, it.DimensionValue, it.TargetPct); err != nil {
			return AllocationTargetSet{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return AllocationTargetSet{}, err
	}
	return s.GetAllocationTargetSet(ctx, userID, id)
}

func (s *Store) DeleteAllocationTargetSet(ctx context.Context, userID, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM allocation_target_sets WHERE user_id=$1 AND id=$2 /* OWNED allocation_target_sets */`, userID, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func completeTargetItemsForActuals(set *AllocationTargetSet, actualByKey map[string]string) {
	seen := map[string]bool{}
	for _, it := range set.Items {
		seen[it.DimensionValue] = true
	}
	var missing []string
	for key := range actualByKey {
		if !seen[key] {
			missing = append(missing, key)
		}
	}
	sort.Strings(missing)
	for _, key := range missing {
		set.Items = append(set.Items, AllocationTargetItem{
			DimensionValue: key,
			TargetPct:      "0.00",
		})
	}
}

// EvaluateDrift fills Actual/Drift/Rebalance/OverThreshold for each item by
// comparing target percentages to the live allocation for the set's dimension
// (§6.10), using net worth for the rebalance amount.
func (s *Store) EvaluateDrift(ctx context.Context, userID, id int64, onDate, displayCurrency, fxMode string) (AllocationTargetSet, error) {
	set, err := s.GetAllocationTargetSet(ctx, userID, id)
	if err != nil {
		return AllocationTargetSet{}, err
	}
	val, err := s.GetValuation(ctx, userID, onDate, displayCurrency, fxMode, onDate)
	if err != nil {
		return AllocationTargetSet{}, err
	}
	actualByKey := map[string]string{}
	for _, b := range val.Allocations[set.Dimension] {
		actualByKey[b.Key] = b.Percent
	}
	completeTargetItemsForActuals(&set, actualByKey)
	netWorth, _ := decimalFromString(val.NetWorth)
	threshold := mustDec(set.DriftThresholdPct)
	for i := range set.Items {
		it := &set.Items[i]
		actual := mustDec(actualByKey[it.DimensionValue]) // 0 if absent
		target := mustDec(it.TargetPct)
		drift := actual.Sub(target)
		rebalance := drift.Div(decHundred).Mul(netWorth)
		over := drift.Abs().GreaterThan(threshold)
		it.ActualPct = stringPtr(formatPercentDecimal(actual))
		it.Drift = stringPtr(formatPercentDecimal(drift))
		it.Rebalance = stringPtr(formatMoneyDecimal(rebalance))
		it.OverThreshold = &over
	}
	nw := formatMoneyDecimal(netWorth)
	set.NetWorth = &nw
	return set, nil
}
