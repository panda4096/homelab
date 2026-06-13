package store

import "context"

// GetPreferences returns the single preferences row (migration seeds id=1).
func (s *Store) GetPreferences(ctx context.Context) (Preferences, error) {
	var p Preferences
	err := s.pool.QueryRow(ctx, `
		SELECT display_currency, fx_mode, time_aggregation_default, market_convention, updated_at
		FROM user_preferences WHERE id = 1`).
		Scan(&p.DisplayCurrency, &p.FxMode, &p.TimeAggregationDefault, &p.MarketConvention, &p.UpdatedAt)
	return p, err
}

// UpdatePreferences upserts the single row (id=1) and returns the stored value.
func (s *Store) UpdatePreferences(ctx context.Context, p Preferences) (Preferences, error) {
	var out Preferences
	err := s.pool.QueryRow(ctx, `
		INSERT INTO user_preferences (id, display_currency, fx_mode, time_aggregation_default, market_convention, updated_at)
		VALUES (1, $1, $2, $3, $4, now())
		ON CONFLICT (id) DO UPDATE SET
			display_currency         = EXCLUDED.display_currency,
			fx_mode                  = EXCLUDED.fx_mode,
			time_aggregation_default = EXCLUDED.time_aggregation_default,
			market_convention        = EXCLUDED.market_convention,
			updated_at               = now()
		RETURNING display_currency, fx_mode, time_aggregation_default, market_convention, updated_at`,
		p.DisplayCurrency, p.FxMode, p.TimeAggregationDefault, p.MarketConvention).
		Scan(&out.DisplayCurrency, &out.FxMode, &out.TimeAggregationDefault, &out.MarketConvention, &out.UpdatedAt)
	return out, err
}
