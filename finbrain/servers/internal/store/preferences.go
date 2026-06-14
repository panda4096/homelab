package store

import "context"

// GetPreferences returns preferences owned by userID.
func (s *Store) GetPreferences(ctx context.Context, userID int64) (Preferences, error) {
	var p Preferences
	err := s.pool.QueryRow(ctx, `
		SELECT display_currency, fx_mode, time_aggregation_default, market_convention, timezone, updated_at
		FROM user_preferences WHERE user_id = $1`,
		userID).
		Scan(&p.DisplayCurrency, &p.FxMode, &p.TimeAggregationDefault, &p.MarketConvention, &p.Timezone, &p.UpdatedAt)
	return p, err
}

// UpdatePreferences upserts preferences for userID and returns the stored value.
func (s *Store) UpdatePreferences(ctx context.Context, userID int64, p Preferences) (Preferences, error) {
	var out Preferences
	err := s.pool.QueryRow(ctx, `
		INSERT INTO user_preferences (user_id, display_currency, fx_mode, time_aggregation_default, market_convention, timezone, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (user_id) DO UPDATE SET
			display_currency         = EXCLUDED.display_currency,
			fx_mode                  = EXCLUDED.fx_mode,
			time_aggregation_default = EXCLUDED.time_aggregation_default,
			market_convention        = EXCLUDED.market_convention,
			timezone                 = EXCLUDED.timezone,
			updated_at               = now()
		RETURNING display_currency, fx_mode, time_aggregation_default, market_convention, timezone, updated_at`,
		userID, p.DisplayCurrency, p.FxMode, p.TimeAggregationDefault, p.MarketConvention, p.Timezone).
		Scan(&out.DisplayCurrency, &out.FxMode, &out.TimeAggregationDefault, &out.MarketConvention, &out.Timezone, &out.UpdatedAt)
	return out, err
}
