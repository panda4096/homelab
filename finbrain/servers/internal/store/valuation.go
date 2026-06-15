package store

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

var (
	decZero    = decimal.Zero
	decOne     = decimal.NewFromInt(1)
	decHundred = decimal.NewFromInt(100)
)

type valuationCashRow struct {
	AccountID       int64
	AccountName     string
	AccountCurrency string
	AccountKind     string
	Institution     string
	SnapshotDate    string
	Balance         string
}

type valuationPositionRow struct {
	AccountID        int64
	AccountName      string
	AccountCurrency  string
	AccountKind      string
	Institution      string
	Symbol           string
	DisplayName      *string
	Market           *string
	QuoteCurrency    *string
	AssetKind        *string
	Quantity         string
	AvgCost          *string
	CostCurrency     *string
	SnapshotDate     string
	PriceDate        *string
	Price            *string
	PriceCurrency    *string
	HoldingStartDate *string
	HoldingDays      *int
}

type valuationLiabilityRow struct {
	AccountID       int64
	AccountName     string
	AccountCurrency string
	AccountKind     string
	Institution     string
	StatementDate   string
	AmountTotal     string
	Currency        string
	PaidAt          *string
}

type fxResult struct {
	Rate     decimal.Decimal
	Source   string
	UsedDate *string
}

type fxLookupFunc func(base, quote, mode, onDate string) (decimal.Decimal, *string, bool, error)

type fxResolver struct {
	store    *Store
	ctx      context.Context
	mode     string
	onDate   string
	cache    map[string]fxResult
	lookupFn fxLookupFunc
}

// GetValuation computes the current P2 valuation as of onDate. currentRateDate
// is kept for API compatibility; current FX mode intentionally uses the latest
// available rate with no date upper bound.
func (s *Store) GetValuation(ctx context.Context, userID int64, onDate, displayCurrency, fxMode, currentRateDate string) (Valuation, error) {
	_ = currentRateDate
	val := Valuation{
		AsOf:            onDate,
		DisplayCurrency: displayCurrency,
		FxMode:          fxMode,
		Allocations:     map[string][]ValuationBucket{},
		CashAccounts:    []ValuationCash{},
		Positions:       []ValuationPosition{},
		PositionGroups:  []ValuationPosition{},
		Warnings:        []ValuationWarning{},
	}
	warnSeen := map[string]bool{}
	addWarning := func(kind, key, msg string) {
		id := kind + ":" + key
		if warnSeen[id] {
			return
		}
		warnSeen[id] = true
		val.Warnings = append(val.Warnings, ValuationWarning{Kind: kind, Key: key, Message: msg})
	}

	alloc := newAllocationBuilder()
	fx := &fxResolver{store: s, ctx: ctx, mode: fxMode, onDate: onDate, cache: map[string]fxResult{}}

	cashRows, err := s.currentCashRows(ctx, userID, onDate)
	if err != nil {
		return Valuation{}, err
	}

	netWorth := decZero
	totalAssets := decZero
	totalLiabilities := decZero
	cashValue := decZero

	for _, c := range cashRows {
		balance, err := decimalFromString(c.Balance)
		if err != nil {
			return Valuation{}, err
		}
		res, err := fx.resolve(c.AccountCurrency, displayCurrency)
		if err != nil {
			return Valuation{}, err
		}
		if res.Source == "fallback" {
			pair := c.AccountCurrency + "/" + displayCurrency
			addWarning("fx_fallback", pair, fmt.Sprintf("%s 缺少可用汇率，已按 1:1 暂估", pair))
		}

		displayValue := balance.Mul(res.Rate)
		totalAssets = totalAssets.Add(displayValue)
		cashValue = cashValue.Add(displayValue)
		val.CashAccounts = append(val.CashAccounts, ValuationCash{
			AccountID:           c.AccountID,
			AccountName:         c.AccountName,
			AccountCurrency:     c.AccountCurrency,
			AccountKind:         c.AccountKind,
			Institution:         c.Institution,
			SnapshotDate:        c.SnapshotDate,
			Balance:             c.Balance,
			BalanceValueDisplay: formatMoneyDecimal(displayValue),
		})

		alloc.add("kind", c.AccountKind, c.AccountKind, displayValue)
		alloc.add("asset_kind", "cash", "cash", displayValue)
		alloc.add("institution", c.Institution, c.Institution, displayValue)
		alloc.add("currency", c.AccountCurrency, c.AccountCurrency, displayValue)
		alloc.add("quote_currency", c.AccountCurrency, c.AccountCurrency, displayValue)
	}

	positionRows, err := s.currentPositionRows(ctx, userID, onDate)
	if err != nil {
		return Valuation{}, err
	}

	positionValue := decZero
	positionCost := decZero
	positionNetCost := decZero
	unrealizedPL := decZero
	costForPL := decZero

	for _, p := range positionRows {
		replay, hasReplay, err := s.applyReplayToPositionRow(ctx, userID, &p, onDate)
		if err != nil {
			return Valuation{}, err
		}
		qty, err := decimalFromString(p.Quantity)
		if err != nil {
			return Valuation{}, err
		}
		if !qty.GreaterThan(decZero) {
			continue
		}

		costCurrency := firstNonEmpty(ptrValue(p.CostCurrency), ptrValue(p.QuoteCurrency), p.AccountCurrency)
		quoteExposureCurrency := firstNonEmpty(ptrValue(p.QuoteCurrency), costCurrency, p.AccountCurrency)
		pos := ValuationPosition{
			AccountID:        p.AccountID,
			AccountName:      p.AccountName,
			AccountCurrency:  p.AccountCurrency,
			AccountKind:      p.AccountKind,
			Institution:      p.Institution,
			Symbol:           p.Symbol,
			DisplayName:      p.DisplayName,
			Market:           p.Market,
			QuoteCurrency:    quoteExposureCurrency,
			AssetKind:        p.AssetKind,
			Quantity:         p.Quantity,
			AvgCost:          p.AvgCost,
			CostCurrency:     costCurrency,
			SnapshotDate:     p.SnapshotDate,
			Price:            p.Price,
			PriceCurrency:    p.PriceCurrency,
			PriceDate:        p.PriceDate,
			HoldingStartDate: p.HoldingStartDate,
			HoldingDays:      p.HoldingDays,
		}

		var nativeCost, displayCost decimal.Decimal
		var displayNetCost decimal.Decimal
		hasCost := false
		hasNetCost := false
		if p.AvgCost != nil {
			avgCost, err := decimalFromString(*p.AvgCost)
			if err != nil {
				return Valuation{}, err
			}
			nativeCost = qty.Mul(avgCost)
			costFx, err := fx.resolve(costCurrency, displayCurrency)
			if err != nil {
				return Valuation{}, err
			}
			if costFx.Source == "fallback" {
				pos.FxFallback = true
				pair := costCurrency + "/" + displayCurrency
				addWarning("fx_fallback", pair, fmt.Sprintf("%s 缺少可用汇率，已按 1:1 暂估", pair))
			}
			displayCost = nativeCost.Mul(costFx.Rate)
			pos.CostValueDisplay = stringPtr(formatMoneyDecimal(displayCost))
			hasCost = true

			netCost := avgCost
			if hasReplay {
				netCost = replay.WeightedBuyCost
				if qty.GreaterThan(decZero) && !replay.RealizedPL.IsZero() {
					netCost = netCost.Sub(replay.RealizedPL.DivRound(qty, 18))
				}
				realizedDisplay := replay.RealizedPL.Mul(costFx.Rate)
				pos.RealizedPLDisplay = stringPtr(formatMoneyDecimal(realizedDisplay))
			}
			nativeNetCost := qty.Mul(netCost)
			displayNetCost = nativeNetCost.Mul(costFx.Rate)
			pos.NetCost = stringPtr(formatMoneyDecimal(netCost))
			pos.NetCostValueDisplay = stringPtr(formatMoneyDecimal(displayNetCost))
			hasNetCost = true
		}

		if p.Price == nil || p.PriceCurrency == nil || p.PriceDate == nil {
			pos.MissingPrice = true
			addWarning("missing_price", p.Symbol, fmt.Sprintf("%s 缺少 %s 之前的价格，未计入净资产", p.Symbol, onDate))
			val.Positions = append(val.Positions, pos)
			continue
		}

		price, err := decimalFromString(*p.Price)
		if err != nil {
			return Valuation{}, err
		}
		priceCurrency := *p.PriceCurrency
		priceToCost, err := fx.resolve(priceCurrency, costCurrency)
		if err != nil {
			return Valuation{}, err
		}
		if priceToCost.Source == "fallback" {
			pos.FxFallback = true
			pair := priceCurrency + "/" + costCurrency
			addWarning("fx_fallback", pair, fmt.Sprintf("%s 缺少可用汇率，已按 1:1 暂估", pair))
		}
		priceInCostCurrency := price.Mul(priceToCost.Rate)
		nativeMarketValue := qty.Mul(priceInCostCurrency)

		displayFx, err := fx.resolve(costCurrency, displayCurrency)
		if err != nil {
			return Valuation{}, err
		}
		if displayFx.Source == "fallback" {
			pos.FxFallback = true
			pair := costCurrency + "/" + displayCurrency
			addWarning("fx_fallback", pair, fmt.Sprintf("%s 缺少可用汇率，已按 1:1 暂估", pair))
		}
		displayMarketValue := nativeMarketValue.Mul(displayFx.Rate)

		positionValue = positionValue.Add(displayMarketValue)
		totalAssets = totalAssets.Add(displayMarketValue)
		pos.MarketValue = stringPtr(formatMoneyDecimal(nativeMarketValue))
		pos.MarketValueDisplay = stringPtr(formatMoneyDecimal(displayMarketValue))

		marketKey := firstNonEmpty(ptrValue(p.Market), "UNKNOWN")
		assetKindKey := firstNonEmpty(ptrValue(p.AssetKind), p.AccountKind)
		alloc.add("kind", p.AccountKind, p.AccountKind, displayMarketValue)
		alloc.add("asset_kind", assetKindKey, assetKindKey, displayMarketValue)
		alloc.add("institution", p.Institution, p.Institution, displayMarketValue)
		alloc.add("currency", p.AccountCurrency, p.AccountCurrency, displayMarketValue)
		alloc.add("quote_currency", quoteExposureCurrency, quoteExposureCurrency, displayMarketValue)
		alloc.add("market", marketKey, marketKey, displayMarketValue)

		if hasCost && !nativeCost.IsZero() {
			positionCost = positionCost.Add(displayCost)
			costForPL = costForPL.Add(displayCost)
			plDisplay := displayMarketValue.Sub(displayCost)
			unrealizedPL = unrealizedPL.Add(plDisplay)
			nativePL := nativeMarketValue.Sub(nativeCost)
			pos.UnrealizedPLDisplay = stringPtr(formatMoneyDecimal(plDisplay))
			pos.UnrealizedPLPct = stringPtr(formatPercentDecimal(percent(nativePL, nativeCost)))
		}
		if hasNetCost {
			positionNetCost = positionNetCost.Add(displayNetCost)
		}

		val.Positions = append(val.Positions, pos)
	}

	liabilityRows, err := s.currentLiabilityRows(ctx, userID, onDate)
	if err != nil {
		return Valuation{}, err
	}
	for _, l := range liabilityRows {
		amount, err := decimalFromString(l.AmountTotal)
		if err != nil {
			return Valuation{}, err
		}
		res, err := fx.resolve(l.Currency, displayCurrency)
		if err != nil {
			return Valuation{}, err
		}
		if res.Source == "fallback" {
			pair := l.Currency + "/" + displayCurrency
			addWarning("fx_fallback", pair, fmt.Sprintf("%s 缺少可用汇率，信用卡账单已按 1:1 暂估", pair))
		}
		displayLiability := amount.Mul(res.Rate)
		totalLiabilities = totalLiabilities.Add(displayLiability)
		alloc.add("quote_currency", l.Currency, l.Currency, displayLiability.Neg())
	}
	netWorth = totalAssets.Sub(totalLiabilities)

	for i := range val.Positions {
		if val.Positions[i].MarketValueDisplay == nil {
			continue
		}
		mv, err := decimalFromString(*val.Positions[i].MarketValueDisplay)
		if err != nil {
			return Valuation{}, err
		}
		if !positionValue.IsZero() {
			val.Positions[i].Weight = stringPtr(formatPercentDecimal(percent(mv, positionValue)))
		}
		if !netWorth.IsZero() {
			val.Positions[i].AssetWeight = stringPtr(formatPercentDecimal(percent(mv, netWorth)))
		}
	}

	val.NetWorth = formatMoneyDecimal(netWorth)
	val.TotalAssets = formatMoneyDecimal(totalAssets)
	val.TotalLiabilities = formatMoneyDecimal(totalLiabilities)
	val.CashValue = formatMoneyDecimal(cashValue)
	val.PositionValue = formatMoneyDecimal(positionValue)
	val.PositionCost = formatMoneyDecimal(positionCost)
	val.PositionNetCost = formatMoneyDecimal(positionNetCost)
	val.UnrealizedPL = formatMoneyDecimal(unrealizedPL)
	if !costForPL.IsZero() {
		val.UnrealizedPLPct = stringPtr(formatPercentDecimal(percent(unrealizedPL, costForPL)))
	}
	if !netWorth.IsZero() {
		val.PositionShare = stringPtr(formatPercentDecimal(percent(positionValue, netWorth)))
	}
	quoteExposureTotal := alloc.absTotal("quote_currency")
	val.Allocations = alloc.build(map[string]decimal.Decimal{
		"kind":           totalAssets,
		"asset_kind":     totalAssets,
		"institution":    totalAssets,
		"currency":       totalAssets,
		"market":         positionValue,
		"quote_currency": quoteExposureTotal,
	})
	val.PositionGroups = buildSymbolPositionGroups(val.Positions, positionValue, netWorth, displayCurrency)

	realizedYtd, incomeYtd, err := s.tradeKPIs(ctx, userID, onDate, displayCurrency, fx)
	if err != nil {
		return Valuation{}, err
	}
	val.RealizedPLYtd = formatMoneyDecimal(realizedYtd)
	val.IncomeYtd = formatMoneyDecimal(incomeYtd)

	return val, nil
}

// tradeKPIs computes year-to-date realized P&L (§6.16) and cumulative income
// (§6.11) as of onDate, converted to displayCurrency via the shared resolver.
// Realized YTD = realized(onDate) − realized(prev year-end) per holding.
func (s *Store) tradeKPIs(ctx context.Context, userID int64, onDate, displayCurrency string, fx *fxResolver) (decimal.Decimal, decimal.Decimal, error) {
	realizedYtd := decZero
	incomeYtd := decZero
	if len(onDate) < 4 {
		return realizedYtd, incomeYtd, nil
	}
	yearStart := onDate[:4] + "-01-01"
	prevYearEnd := prevYearEndDate(onDate[:4])

	rows, err := s.pool.Query(ctx, `SELECT DISTINCT account_id, symbol FROM transactions WHERE user_id=$1 AND trade_date <= $2::date /* OWNED transactions */`, userID, onDate)
	if err != nil {
		return decZero, decZero, err
	}
	type holdingKey struct {
		acct int64
		sym  string
	}
	var holdings []holdingKey
	for rows.Next() {
		var h holdingKey
		if err := rows.Scan(&h.acct, &h.sym); err != nil {
			rows.Close()
			return decZero, decZero, err
		}
		holdings = append(holdings, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return decZero, decZero, err
	}

	for _, h := range holdings {
		now, err := s.ReplayHolding(ctx, userID, h.acct, h.sym, onDate, false)
		if err != nil {
			return decZero, decZero, err
		}
		prev, err := s.ReplayHolding(ctx, userID, h.acct, h.sym, prevYearEnd, false)
		if err != nil {
			return decZero, decZero, err
		}
		ytdNative := now.RealizedPL.Sub(prev.RealizedPL)
		if ytdNative.IsZero() {
			continue
		}
		ccy := now.Currency
		if ccy == "" {
			ccy = prev.Currency
		}
		res, err := fx.resolve(ccy, displayCurrency)
		if err != nil {
			return decZero, decZero, err
		}
		realizedYtd = realizedYtd.Add(ytdNative.Mul(res.Rate))
	}

	inRows, err := s.pool.Query(ctx, `SELECT amount::text, currency FROM income_events WHERE user_id=$1 AND event_date >= $2::date AND event_date <= $3::date /* OWNED income_events */`, userID, yearStart, onDate)
	if err != nil {
		return decZero, decZero, err
	}
	defer inRows.Close()
	for inRows.Next() {
		var amt, ccy string
		if err := inRows.Scan(&amt, &ccy); err != nil {
			return decZero, decZero, err
		}
		res, err := fx.resolve(ccy, displayCurrency)
		if err != nil {
			return decZero, decZero, err
		}
		incomeYtd = incomeYtd.Add(mustDec(amt).Mul(res.Rate))
	}
	return realizedYtd, incomeYtd, inRows.Err()
}

func prevYearEndDate(year string) string {
	var y int
	if _, err := fmt.Sscanf(year, "%d", &y); err != nil {
		return "0001-12-31"
	}
	return fmt.Sprintf("%04d-12-31", y-1)
}

func (s *Store) applyReplayToPositionRow(ctx context.Context, userID int64, p *valuationPositionRow, onDate string) (HoldingState, bool, error) {
	rep, err := s.ReplayHolding(ctx, userID, p.AccountID, p.Symbol, onDate, false)
	if err != nil {
		return HoldingState{}, false, err
	}
	if !rep.HasHistory {
		return rep, false, nil
	}
	p.Quantity = formatVariableDecimal(rep.Quantity)
	wbc := formatVariableDecimal(rep.WeightedBuyCost)
	p.AvgCost = &wbc
	if rep.Currency != "" && ptrValue(p.CostCurrency) == "" {
		ccy := rep.Currency
		p.CostCurrency = &ccy
	}
	if rep.HoldingStartDate != "" {
		start := rep.HoldingStartDate
		p.HoldingStartDate = &start
		if p.SnapshotDate == "" {
			p.SnapshotDate = start
		}
		if days := holdingDaysBetween(start, onDate); days != nil {
			p.HoldingDays = days
		}
	}
	return rep, true, nil
}

func holdingDaysBetween(start, end string) *int {
	startT, err := time.Parse("2006-01-02", start)
	if err != nil {
		return nil
	}
	endT, err := time.Parse("2006-01-02", end)
	if err != nil || endT.Before(startT) {
		return nil
	}
	days := int(endT.Sub(startT).Hours() / 24)
	return &days
}

func (s *Store) currentCashRows(ctx context.Context, userID int64, onDate string) ([]valuationCashRow, error) {
	rows, err := s.pool.Query(ctx, `
		WITH latest_balance AS (
			SELECT DISTINCT ON (account_id) account_id, snapshot_date, balance
			FROM balance_snapshots
			WHERE user_id=$1 AND snapshot_date <= $2::date /* OWNED balance_snapshots */
			ORDER BY account_id, snapshot_date DESC
		)
		SELECT a.id, a.name, a.currency, a.kind, i.name, lb.snapshot_date::text, lb.balance::text
		FROM latest_balance lb
		JOIN accounts a ON a.id = lb.account_id AND a.user_id = $1 /* OWNED accounts */
		JOIN institutions i ON i.id = a.institution_id AND i.user_id = a.user_id /* OWNED institutions via scoped accounts */
		WHERE NOT a.is_archived AND a.kind IN ('cash', 'time_deposit', 'wealth_product')
		ORDER BY i.display_order, i.name, a.display_order, a.name`, userID, onDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []valuationCashRow{}
	for rows.Next() {
		var r valuationCashRow
		if err := rows.Scan(&r.AccountID, &r.AccountName, &r.AccountCurrency, &r.AccountKind, &r.Institution, &r.SnapshotDate, &r.Balance); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) currentPositionRows(ctx context.Context, userID int64, onDate string) ([]valuationPositionRow, error) {
	rows, err := s.pool.Query(ctx, `
		WITH latest_position AS (
			SELECT DISTINCT ON (account_id, symbol)
				account_id, symbol, quantity, avg_cost, cost_currency, snapshot_date
			FROM position_snapshots
			WHERE user_id=$1 AND snapshot_date <= $2::date /* OWNED position_snapshots */
			ORDER BY account_id, symbol, snapshot_date DESC
		),
		position_keys AS (
			SELECT account_id, symbol
			FROM latest_position
			WHERE quantity > 0
			UNION
			SELECT DISTINCT account_id, symbol
			FROM transactions
			WHERE user_id=$1 AND trade_date <= $2::date /* OWNED transactions */
		)
		SELECT a.id, a.name, a.currency, a.kind, inst.name, pk.symbol,
		       ins.display_name, ins.market, ins.quote_currency, ins.asset_kind,
		       COALESCE(lp.quantity, 0)::text, lp.avg_cost::text, lp.cost_currency,
		       COALESCE(lp.snapshot_date::text, first_txn.first_trade_date::text, ''),
		       pr.price_date::text, pr.price::text, pr.currency,
		       hs.holding_start_date::text, ($2::date - hs.holding_start_date)::int
		FROM position_keys pk
		JOIN accounts a ON a.id = pk.account_id AND a.user_id = $1 /* OWNED accounts */
		JOIN institutions inst ON inst.id = a.institution_id AND inst.user_id = a.user_id /* OWNED institutions via scoped accounts */
		LEFT JOIN latest_position lp ON lp.account_id = pk.account_id AND lp.symbol = pk.symbol
		LEFT JOIN instruments ins ON ins.symbol = pk.symbol
		LEFT JOIN LATERAL (
			SELECT price_date, price, currency
			FROM prices p
			WHERE p.symbol = pk.symbol AND p.price_date <= $2::date
			ORDER BY p.price_date DESC, (p.currency = COALESCE(ins.quote_currency, '')) DESC, p.id DESC
			LIMIT 1
		) pr ON true
		LEFT JOIN LATERAL (
			SELECT MIN(t.trade_date) AS first_trade_date
			FROM transactions t /* OWNED transactions */
			WHERE t.account_id = pk.account_id
			  AND t.symbol = pk.symbol
			  AND t.user_id = $1
			  AND t.trade_date <= $2::date
		) first_txn ON true
		LEFT JOIN LATERAL (
			SELECT MIN(ps.snapshot_date) AS holding_start_date
			FROM position_snapshots ps /* OWNED position_snapshots */
			WHERE ps.account_id = pk.account_id
			  AND ps.symbol = pk.symbol
			  AND ps.user_id = $1
			  AND ps.snapshot_date <= $2::date
			  AND ps.quantity > 0
			  AND ps.snapshot_date > COALESCE((
			      SELECT MAX(z.snapshot_date)
			      FROM position_snapshots z /* OWNED position_snapshots */
			      WHERE z.account_id = pk.account_id
			        AND z.symbol = pk.symbol
			        AND z.user_id = $1
			        AND z.snapshot_date <= $2::date
			        AND z.quantity = 0
			  ), '-infinity'::date)
		) hs ON true
		WHERE NOT a.is_archived
		ORDER BY inst.display_order, inst.name, a.display_order, a.name, pk.symbol`, userID, onDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []valuationPositionRow{}
	for rows.Next() {
		var r valuationPositionRow
		if err := rows.Scan(
			&r.AccountID, &r.AccountName, &r.AccountCurrency, &r.AccountKind, &r.Institution,
			&r.Symbol, &r.DisplayName, &r.Market, &r.QuoteCurrency,
			&r.AssetKind, &r.Quantity, &r.AvgCost, &r.CostCurrency, &r.SnapshotDate,
			&r.PriceDate, &r.Price, &r.PriceCurrency, &r.HoldingStartDate, &r.HoldingDays,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) currentLiabilityRows(ctx context.Context, userID int64, onDate string) ([]valuationLiabilityRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.name, a.currency, a.kind, i.name,
		       b.statement_date::text, b.amount_total::text, b.currency, b.paid_at::text
		FROM credit_card_bills b
		JOIN accounts a ON a.id = b.account_id AND a.user_id = b.user_id /* OWNED accounts via scoped credit_card_bills */
		JOIN institutions i ON i.id = a.institution_id AND i.user_id = a.user_id /* OWNED institutions via scoped accounts */
		WHERE NOT a.is_archived
		  AND b.user_id = $1 /* OWNED credit_card_bills */
		  AND a.kind = 'credit_card'
		  AND b.statement_date <= $2::date
		  AND (b.paid_at IS NULL OR b.paid_at > $2::date)
		ORDER BY b.statement_date DESC, i.display_order, i.name, a.display_order, a.name`, userID, onDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []valuationLiabilityRow{}
	for rows.Next() {
		var r valuationLiabilityRow
		if err := rows.Scan(
			&r.AccountID, &r.AccountName, &r.AccountCurrency, &r.AccountKind, &r.Institution,
			&r.StatementDate, &r.AmountTotal, &r.Currency, &r.PaidAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (r *fxResolver) resolve(from, to string) (fxResult, error) {
	from = strings.ToUpper(strings.TrimSpace(from))
	to = strings.ToUpper(strings.TrimSpace(to))
	if from == "" || to == "" || from == to {
		return fxResult{Rate: decOne, Source: "identity"}, nil
	}
	key := r.mode + "|" + from + "|" + to + "|" + r.onDate
	if cached, ok := r.cache[key]; ok {
		return cached, nil
	}
	if rate, usedDate, ok, err := r.directOrReverse(from, to); err != nil {
		return fxResult{}, err
	} else if ok {
		res := fxResult{Rate: rate, Source: "direct", UsedDate: usedDate}
		r.cache[key] = res
		return res, nil
	}
	if from != "USD" && to != "USD" {
		a, aDate, aOK, err := r.directOrReverse(from, "USD")
		if err != nil {
			return fxResult{}, err
		}
		b, bDate, bOK, err := r.directOrReverse("USD", to)
		if err != nil {
			return fxResult{}, err
		}
		if aOK && bOK {
			used := latestDatePtr(aDate, bDate)
			res := fxResult{Rate: a.Mul(b), Source: "usd_bridge", UsedDate: used}
			r.cache[key] = res
			return res, nil
		}
	}
	res := fxResult{Rate: decOne, Source: "fallback"}
	r.cache[key] = res
	return res, nil
}

func (r *fxResolver) directOrReverse(from, to string) (decimal.Decimal, *string, bool, error) {
	if rate, usedDate, ok, err := r.lookup(from, to); err != nil {
		return decZero, nil, false, err
	} else if ok {
		return rate, usedDate, true, nil
	}
	if rate, usedDate, ok, err := r.lookup(to, from); err != nil {
		return decZero, nil, false, err
	} else if ok {
		return decOne.DivRound(rate, 18), usedDate, true, nil
	}
	return decZero, nil, false, nil
}

func (r *fxResolver) lookup(base, quote string) (decimal.Decimal, *string, bool, error) {
	if r.lookupFn != nil {
		return r.lookupFn(base, quote, r.mode, r.onDate)
	}
	var rateText, usedDate string
	var err error
	if r.mode == "current" {
		err = r.store.pool.QueryRow(r.ctx, `
			SELECT rate::text, rate_date::text
			FROM fx_rates
			WHERE base_currency=$1 AND quote_currency=$2
			ORDER BY rate_date DESC, id DESC
			LIMIT 1`, base, quote).Scan(&rateText, &usedDate)
	} else {
		err = r.store.pool.QueryRow(r.ctx, `
			SELECT rate::text, rate_date::text
			FROM fx_rates
			WHERE base_currency=$1 AND quote_currency=$2 AND rate_date <= $3::date
			ORDER BY rate_date DESC, id DESC
			LIMIT 1`, base, quote, r.onDate).Scan(&rateText, &usedDate)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return decZero, nil, false, nil
	}
	if err != nil {
		return decZero, nil, false, err
	}
	rate, err := decimalFromString(rateText)
	if err != nil {
		return decZero, nil, false, err
	}
	return rate, &usedDate, true, nil
}

type allocationBuilder map[string]map[string]allocationBucket

type allocationBucket struct {
	key   string
	name  string
	value decimal.Decimal
}

func newAllocationBuilder() allocationBuilder {
	return allocationBuilder{
		"kind":           {},
		"asset_kind":     {},
		"institution":    {},
		"currency":       {},
		"quote_currency": {},
		"market":         {},
	}
}

func (a allocationBuilder) add(dim, key, name string, value decimal.Decimal) {
	if key == "" {
		key = "UNKNOWN"
	}
	if name == "" {
		name = key
	}
	b := a[dim][key]
	b.key = key
	b.name = name
	b.value = b.value.Add(value)
	a[dim][key] = b
}

func (a allocationBuilder) absTotal(dim string) decimal.Decimal {
	total := decZero
	for _, b := range a[dim] {
		total = total.Add(b.value.Abs())
	}
	return total
}

func (a allocationBuilder) build(denominators map[string]decimal.Decimal) map[string][]ValuationBucket {
	out := map[string][]ValuationBucket{}
	for dim, buckets := range a {
		items := make([]allocationBucket, 0, len(buckets))
		for _, b := range buckets {
			items = append(items, b)
		}
		sort.Slice(items, func(i, j int) bool {
			ai := items[i].value.Abs()
			aj := items[j].value.Abs()
			if ai.Equal(aj) {
				return items[i].name < items[j].name
			}
			return ai.GreaterThan(aj)
		})
		denom := denominators[dim]
		for _, b := range items {
			out[dim] = append(out[dim], ValuationBucket{
				Key:     b.key,
				Name:    b.name,
				Value:   formatMoneyDecimal(b.value),
				Percent: formatPercentDecimal(percent(b.value, denom)),
			})
		}
	}
	return out
}

func buildSymbolPositionGroups(positions []ValuationPosition, totalPositionValue, netWorth decimal.Decimal, displayCurrency string) []ValuationPosition {
	type group struct {
		pos          ValuationPosition
		count        int
		qty          decimal.Decimal
		marketValue  decimal.Decimal
		costValue    decimal.Decimal
		netCostValue decimal.Decimal
		plValue      decimal.Decimal
		realizedPL   decimal.Decimal
		hasMarket    bool
		hasCost      bool
		hasNetCost   bool
		hasPL        bool
		hasRealized  bool
		holdingStart *string
		holdingDays  *int
	}

	groups := map[string]*group{}
	for _, p := range positions {
		qty, err := decimalFromString(p.Quantity)
		if err != nil {
			continue
		}
		g := groups[p.Symbol]
		if g == nil {
			g = &group{
				pos: ValuationPosition{
					AccountID:       0,
					AccountName:     "合并",
					AccountCurrency: displayCurrency,
					AccountKind:     p.AccountKind,
					Institution:     "多账户",
					Symbol:          p.Symbol,
					DisplayName:     p.DisplayName,
					Market:          p.Market,
					QuoteCurrency:   displayCurrency,
					AssetKind:       p.AssetKind,
					Quantity:        "0",
					CostCurrency:    displayCurrency,
					SnapshotDate:    p.SnapshotDate,
					PriceCurrency:   &displayCurrency,
				},
			}
			groups[p.Symbol] = g
		}
		g.count++
		g.qty = g.qty.Add(qty)
		g.pos.Quantity = formatVariableDecimal(g.qty)
		g.pos.MissingPrice = g.pos.MissingPrice || p.MissingPrice
		g.pos.FxFallback = g.pos.FxFallback || p.FxFallback
		if g.pos.AssetKind == nil && p.AssetKind != nil {
			g.pos.AssetKind = p.AssetKind
		}
		if p.SnapshotDate > g.pos.SnapshotDate {
			g.pos.SnapshotDate = p.SnapshotDate
		}
		if p.HoldingStartDate != nil && (g.holdingStart == nil || *p.HoldingStartDate < *g.holdingStart) {
			start := *p.HoldingStartDate
			g.holdingStart = &start
			g.pos.HoldingStartDate = &start
		}
		if p.HoldingDays != nil && (g.holdingDays == nil || *p.HoldingDays > *g.holdingDays) {
			days := *p.HoldingDays
			g.holdingDays = &days
			g.pos.HoldingDays = &days
		}
		if p.MarketValueDisplay != nil {
			mv, err := decimalFromString(*p.MarketValueDisplay)
			if err == nil {
				g.marketValue = g.marketValue.Add(mv)
				g.hasMarket = true
			}
		}
		if p.CostValueDisplay != nil {
			cv, err := decimalFromString(*p.CostValueDisplay)
			if err == nil {
				g.costValue = g.costValue.Add(cv)
				g.hasCost = true
			}
		}
		if p.NetCostValueDisplay != nil {
			cv, err := decimalFromString(*p.NetCostValueDisplay)
			if err == nil {
				g.netCostValue = g.netCostValue.Add(cv)
				g.hasNetCost = true
			}
		}
		if p.RealizedPLDisplay != nil {
			pl, err := decimalFromString(*p.RealizedPLDisplay)
			if err == nil {
				g.realizedPL = g.realizedPL.Add(pl)
				g.hasRealized = true
			}
		}
		if p.UnrealizedPLDisplay != nil {
			pl, err := decimalFromString(*p.UnrealizedPLDisplay)
			if err == nil {
				g.plValue = g.plValue.Add(pl)
				g.hasPL = true
			}
		}
	}

	out := make([]ValuationPosition, 0, len(groups))
	for _, g := range groups {
		if g.count > 1 {
			g.pos.AccountName = fmt.Sprintf("%d 个账户", g.count)
		}
		if g.hasMarket {
			mv := formatMoneyDecimal(g.marketValue)
			g.pos.MarketValue = &mv
			g.pos.MarketValueDisplay = &mv
			if !g.qty.IsZero() {
				price := formatMoneyDecimal(g.marketValue.DivRound(g.qty, 8))
				g.pos.Price = &price
			}
		}
		if g.hasCost {
			cost := formatMoneyDecimal(g.costValue)
			g.pos.CostValueDisplay = &cost
			if !g.qty.IsZero() {
				avg := formatMoneyDecimal(g.costValue.DivRound(g.qty, 8))
				g.pos.AvgCost = &avg
			}
		}
		if g.hasNetCost {
			cost := formatMoneyDecimal(g.netCostValue)
			g.pos.NetCostValueDisplay = &cost
			if !g.qty.IsZero() {
				avg := formatMoneyDecimal(g.netCostValue.DivRound(g.qty, 8))
				g.pos.NetCost = &avg
			}
		}
		if g.hasRealized {
			pl := formatMoneyDecimal(g.realizedPL)
			g.pos.RealizedPLDisplay = &pl
		}
		if g.hasPL {
			pl := formatMoneyDecimal(g.plValue)
			g.pos.UnrealizedPLDisplay = &pl
			if !g.costValue.IsZero() {
				pct := formatPercentDecimal(percent(g.plValue, g.costValue))
				g.pos.UnrealizedPLPct = &pct
			}
		}
		if g.hasMarket && !totalPositionValue.IsZero() {
			w := formatPercentDecimal(percent(g.marketValue, totalPositionValue))
			g.pos.Weight = &w
		}
		if g.hasMarket && !netWorth.IsZero() {
			w := formatPercentDecimal(percent(g.marketValue, netWorth))
			g.pos.AssetWeight = &w
		}
		out = append(out, g.pos)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Symbol == out[j].Symbol {
			return out[i].AccountName < out[j].AccountName
		}
		return out[i].Symbol < out[j].Symbol
	})
	return out
}

func decimalFromString(v string) (decimal.Decimal, error) {
	return decimal.NewFromString(strings.TrimSpace(v))
}

func percent(part, total decimal.Decimal) decimal.Decimal {
	if total.IsZero() {
		return decZero
	}
	return part.Mul(decHundred).DivRound(total, 10)
}

func formatMoneyDecimal(v decimal.Decimal) string {
	rounded := v.Round(2)
	if rounded.IsZero() {
		rounded = decZero
	}
	return rounded.StringFixed(2)
}

func formatPercentDecimal(v decimal.Decimal) string {
	rounded := v.Round(2)
	if rounded.IsZero() {
		rounded = decZero
	}
	return rounded.StringFixed(2)
}

func formatVariableDecimal(v decimal.Decimal) string {
	if v.IsZero() {
		return "0"
	}
	return v.String()
}

func ptrValue(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v != "" {
			return v
		}
	}
	return ""
}

func stringPtr(v string) *string { return &v }

func latestDatePtr(a, b *string) *string {
	switch {
	case a == nil:
		return b
	case b == nil:
		return a
	case *a >= *b:
		return a
	default:
		return b
	}
}
