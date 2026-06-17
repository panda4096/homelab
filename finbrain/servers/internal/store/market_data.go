package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
)

const marketDataLimit = 5000

type PriceFilter struct {
	Symbol   string
	DateFrom string
	DateTo   string
	Sort     string
}

type FxRateFilter struct {
	BaseCurrency  string
	QuoteCurrency string
	DateFrom      string
	DateTo        string
	Sort          string
}

const priceCols = `id, symbol, price_date::text, price::text, currency, source, note, created_at, updated_at`

func scanPrice(row interface{ Scan(...any) error }) (Price, error) {
	var p Price
	err := row.Scan(&p.ID, &p.Symbol, &p.PriceDate, &p.Price, &p.Currency, &p.Source, &p.Note, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

// ListPrices returns recent prices, newest first.
func (s *Store) ListPrices(ctx context.Context, filter PriceFilter) (PriceList, error) {
	order := `price_date DESC, symbol, currency`
	if filter.Sort == "date_asc" {
		order = `price_date ASC, symbol, currency`
	}
	rows, err := s.pool.Query(ctx, `
		SELECT `+priceCols+`
		FROM prices
		WHERE ($1 = '' OR symbol ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR price_date >= $2::date)
		  AND ($3 = '' OR price_date <= $3::date)
		ORDER BY `+order+`
		LIMIT $4`, strings.TrimSpace(filter.Symbol), strings.TrimSpace(filter.DateFrom), strings.TrimSpace(filter.DateTo), marketDataLimit+1)
	if err != nil {
		return PriceList{}, err
	}
	defer rows.Close()
	out := []Price{}
	for rows.Next() {
		p, err := scanPrice(rows)
		if err != nil {
			return PriceList{}, err
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return PriceList{}, err
	}
	truncated := len(out) > marketDataLimit
	if truncated {
		out = out[:marketDataLimit]
	}
	return PriceList{Items: out, Truncated: truncated, Limit: marketDataLimit}, nil
}

// UpsertPrice inserts or replaces one price by (symbol, price_date, currency).
// The instrument row is created on first reference, matching position snapshots.
func (s *Store) UpsertPrice(ctx context.Context, p Price) (Price, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Price{}, err
	}
	defer tx.Rollback(ctx)

	out, err := upsertPriceTx(ctx, tx, p)
	if err != nil {
		return Price{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Price{}, err
	}
	return out, nil
}

func (s *Store) BatchUpsertPrices(ctx context.Context, prices []Price) ([]Price, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	out := make([]Price, 0, len(prices))
	for _, p := range prices {
		price, err := upsertPriceTx(ctx, tx, p)
		if err != nil {
			return nil, err
		}
		out = append(out, price)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return out, nil
}

func upsertPriceTx(ctx context.Context, tx pgx.Tx, p Price) (Price, error) {
	if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol, quote_currency) VALUES ($1, $2) ON CONFLICT (symbol) DO NOTHING`, p.Symbol, p.Currency); err != nil {
		return Price{}, err
	}
	if p.Source == "" {
		p.Source = "manual"
	}
	out, err := scanPrice(tx.QueryRow(ctx, `
		INSERT INTO prices (symbol, price_date, price, currency, source, note, updated_at)
		VALUES ($1, $2::date, $3::numeric, $4, $5, $6, now())
		ON CONFLICT (symbol, price_date, currency) DO UPDATE SET
			price = EXCLUDED.price, source = EXCLUDED.source,
			note = EXCLUDED.note, updated_at = now()
		RETURNING `+priceCols,
		p.Symbol, p.PriceDate, p.Price, p.Currency, p.Source, p.Note))
	if err != nil {
		return Price{}, err
	}
	return out, nil
}

// BatchUpsertAutoPrices writes prices from an automated feed. Unlike BatchUpsertPrices
// it NEVER overwrites a row whose source is 'manual' (the operator's hand corrections
// always win), via a WHERE guard on the conflict update. Returns the number of rows
// actually inserted or updated (manual rows are skipped and not counted).
func (s *Store) BatchUpsertAutoPrices(ctx context.Context, prices []Price) (int, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	written := 0
	for _, p := range prices {
		if p.Source == "" || p.Source == "manual" {
			p.Source = "auto"
		}
		if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol, quote_currency) VALUES ($1, $2) ON CONFLICT (symbol) DO NOTHING`, p.Symbol, p.Currency); err != nil {
			return written, err
		}
		ct, err := tx.Exec(ctx, `
			INSERT INTO prices (symbol, price_date, price, currency, source, note, updated_at)
			VALUES ($1, $2::date, $3::numeric, $4, $5, $6, now())
			ON CONFLICT (symbol, price_date, currency) DO UPDATE SET
				price = EXCLUDED.price, source = EXCLUDED.source,
				note = EXCLUDED.note, updated_at = now()
			WHERE prices.source <> 'manual'`,
			p.Symbol, p.PriceDate, p.Price, p.Currency, p.Source, p.Note)
		if err != nil {
			return written, err
		}
		written += int(ct.RowsAffected())
	}
	if err := tx.Commit(ctx); err != nil {
		return written, err
	}
	return written, nil
}

// MarketBackfillDone reports whether the symbol's full price history has been fetched.
// This is a dedicated marker (not "has any price row") because the latest-price refresh
// writes a few recent bars, which must not be mistaken for a completed history backfill.
func (s *Store) MarketBackfillDone(ctx context.Context, symbol string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM market_backfill_state WHERE symbol = $1)`, symbol).Scan(&ok)
	return ok, err
}

// MarkMarketBackfilled records that the symbol's history has been fetched (set only on a
// successful backfill, so a failed attempt is retried on the next sweep).
func (s *Store) MarkMarketBackfilled(ctx context.Context, symbol string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO market_backfill_state (symbol, backfilled_at) VALUES ($1, now())
		ON CONFLICT (symbol) DO UPDATE SET backfilled_at = now()`, symbol)
	return err
}

// DeleteAutoPrices removes auto-fetched price rows (source <> 'manual'), keeping hand-entered
// prices. Empty symbols = all instruments. Used to fully re-fetch history after the adjustment
// basis changes (e.g. switching to 前复权), so no stale unadjusted rows can survive an overwrite.
func (s *Store) DeleteAutoPrices(ctx context.Context, symbols ...string) (int64, error) {
	if len(symbols) == 0 {
		tag, err := s.pool.Exec(ctx, `DELETE FROM prices WHERE source <> 'manual'`)
		return tag.RowsAffected(), err
	}
	tag, err := s.pool.Exec(ctx, `DELETE FROM prices WHERE source <> 'manual' AND symbol = ANY($1)`, symbols)
	return tag.RowsAffected(), err
}

// ResetMarketBackfill clears the backfill markers (all, or the given symbols) so the history
// sweep re-fetches from scratch. Pair with DeleteAutoPrices for a clean re-backfill.
func (s *Store) ResetMarketBackfill(ctx context.Context, symbols ...string) error {
	if len(symbols) == 0 {
		_, err := s.pool.Exec(ctx, `DELETE FROM market_backfill_state`)
		return err
	}
	_, err := s.pool.Exec(ctx, `DELETE FROM market_backfill_state WHERE symbol = ANY($1)`, symbols)
	return err
}

// MarketStatusRow is the latest stored price for one symbol (for staleness display).
type MarketStatusRow struct {
	Symbol     string `json:"symbol"`
	LatestDate string `json:"latest_date"`
	Source     string `json:"source"`
}

// MarketDataStatus returns the most recent price row per symbol, newest date per symbol.
func (s *Store) MarketDataStatus(ctx context.Context) ([]MarketStatusRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (symbol) symbol, price_date::text, source
		FROM prices
		ORDER BY symbol, price_date DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MarketStatusRow{}
	for rows.Next() {
		var r MarketStatusRow
		if err := rows.Scan(&r.Symbol, &r.LatestDate, &r.Source); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// UpdatePrice edits one existing price row. symbol is immutable; changing date
// and currency may conflict with another row for the same symbol.
func (s *Store) UpdatePrice(ctx context.Context, id int64, p Price) (Price, error) {
	out, err := scanPrice(s.pool.QueryRow(ctx, `
		UPDATE prices
		SET price_date=$2::date, price=$3::numeric, currency=$4, source=$5, note=$6, updated_at=now()
		WHERE id=$1
		RETURNING `+priceCols,
		id, p.PriceDate, p.Price, p.Currency, firstNonEmpty(p.Source, "manual"), p.Note))
	if errors.Is(err, pgx.ErrNoRows) {
		return Price{}, ErrNotFound
	}
	return out, err
}

func (s *Store) DeletePrice(ctx context.Context, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM prices WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

const fxRateCols = `id, base_currency, quote_currency, rate_date::text, rate::text, source, note, created_at, updated_at`

func scanFxRate(row interface{ Scan(...any) error }) (FxRate, error) {
	var f FxRate
	err := row.Scan(&f.ID, &f.BaseCurrency, &f.QuoteCurrency, &f.RateDate, &f.Rate, &f.Source, &f.Note, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

// ListFxRates returns recent FX rates, newest first.
func (s *Store) ListFxRates(ctx context.Context, filter FxRateFilter) (FxRateList, error) {
	order := `rate_date DESC, base_currency, quote_currency`
	if filter.Sort == "date_asc" {
		order = `rate_date ASC, base_currency, quote_currency`
	}
	rows, err := s.pool.Query(ctx, `
		SELECT `+fxRateCols+`
		FROM fx_rates
		WHERE ($1 = '' OR base_currency = $1)
		  AND ($2 = '' OR quote_currency = $2)
		  AND ($3 = '' OR rate_date >= $3::date)
		  AND ($4 = '' OR rate_date <= $4::date)
		ORDER BY `+order+`
		LIMIT $5`, strings.ToUpper(strings.TrimSpace(filter.BaseCurrency)), strings.ToUpper(strings.TrimSpace(filter.QuoteCurrency)), strings.TrimSpace(filter.DateFrom), strings.TrimSpace(filter.DateTo), marketDataLimit+1)
	if err != nil {
		return FxRateList{}, err
	}
	defer rows.Close()
	out := []FxRate{}
	for rows.Next() {
		f, err := scanFxRate(rows)
		if err != nil {
			return FxRateList{}, err
		}
		out = append(out, f)
	}
	if err := rows.Err(); err != nil {
		return FxRateList{}, err
	}
	truncated := len(out) > marketDataLimit
	if truncated {
		out = out[:marketDataLimit]
	}
	return FxRateList{Items: out, Truncated: truncated, Limit: marketDataLimit}, nil
}

func (s *Store) UpsertFxRate(ctx context.Context, f FxRate) (FxRate, error) {
	if f.Source == "" {
		f.Source = "manual"
	}
	return scanFxRate(s.pool.QueryRow(ctx, `
		INSERT INTO fx_rates (base_currency, quote_currency, rate_date, rate, source, note, updated_at)
		VALUES ($1, $2, $3::date, $4::numeric, $5, $6, now())
		ON CONFLICT (base_currency, quote_currency, rate_date) DO UPDATE SET
			rate = EXCLUDED.rate, source = EXCLUDED.source, note = EXCLUDED.note, updated_at = now()
		RETURNING `+fxRateCols,
		f.BaseCurrency, f.QuoteCurrency, f.RateDate, f.Rate, f.Source, f.Note))
}

func (s *Store) BatchUpsertFxRates(ctx context.Context, rates []FxRate) ([]FxRate, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	out := make([]FxRate, 0, len(rates))
	for _, f := range rates {
		if f.Source == "" {
			f.Source = "manual"
		}
		rate, err := scanFxRate(tx.QueryRow(ctx, `
			INSERT INTO fx_rates (base_currency, quote_currency, rate_date, rate, source, note, updated_at)
			VALUES ($1, $2, $3::date, $4::numeric, $5, $6, now())
			ON CONFLICT (base_currency, quote_currency, rate_date) DO UPDATE SET
				rate = EXCLUDED.rate, source = EXCLUDED.source, note = EXCLUDED.note, updated_at = now()
			RETURNING `+fxRateCols,
			f.BaseCurrency, f.QuoteCurrency, f.RateDate, f.Rate, f.Source, f.Note))
		if err != nil {
			return nil, err
		}
		out = append(out, rate)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return out, nil
}

// BatchUpsertAutoFxRates writes FX rates from an automated feed without overwriting
// manual rows. Returns the number of rows inserted or updated.
func (s *Store) BatchUpsertAutoFxRates(ctx context.Context, rates []FxRate) (int, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	written := 0
	for _, f := range rates {
		if f.Source == "" || f.Source == "manual" {
			f.Source = "auto"
		}
		ct, err := tx.Exec(ctx, `
			INSERT INTO fx_rates (base_currency, quote_currency, rate_date, rate, source, note, updated_at)
			VALUES ($1, $2, $3::date, $4::numeric, $5, $6, now())
			ON CONFLICT (base_currency, quote_currency, rate_date) DO UPDATE SET
				rate = EXCLUDED.rate, source = EXCLUDED.source, note = EXCLUDED.note, updated_at = now()
			WHERE fx_rates.source <> 'manual'`,
			f.BaseCurrency, f.QuoteCurrency, f.RateDate, f.Rate, f.Source, f.Note)
		if err != nil {
			return written, err
		}
		written += int(ct.RowsAffected())
	}
	if err := tx.Commit(ctx); err != nil {
		return written, err
	}
	return written, nil
}

func (s *Store) UpdateFxRate(ctx context.Context, id int64, f FxRate) (FxRate, error) {
	out, err := scanFxRate(s.pool.QueryRow(ctx, `
		UPDATE fx_rates
		SET rate_date=$2::date, rate=$3::numeric, source=$4, note=$5, updated_at=now()
		WHERE id=$1
		RETURNING `+fxRateCols,
		id, f.RateDate, f.Rate, firstNonEmpty(f.Source, "manual"), f.Note))
	if errors.Is(err, pgx.ErrNoRows) {
		return FxRate{}, ErrNotFound
	}
	return out, err
}

func (s *Store) DeleteFxRate(ctx context.Context, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM fx_rates WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
