package store

import (
	"encoding/json"
	"time"
)

// Preferences is the single-row user_preferences (PRD §5.2.13, + market_convention
// extension required by the design's 涨跌约定 toggle).
type Preferences struct {
	DisplayCurrency        string    `json:"display_currency"`
	FxMode                 string    `json:"fx_mode"`
	TimeAggregationDefault string    `json:"time_aggregation_default"`
	MarketConvention       string    `json:"market_convention"`
	UpdatedAt              time.Time `json:"updated_at"`
}

// Instrument is standalone instrument metadata (PRD §5.2.2).
type Instrument struct {
	Symbol        string    `json:"symbol"`
	DisplayName   *string   `json:"display_name"`
	Market        *string   `json:"market"`
	QuoteCurrency *string   `json:"quote_currency"`
	AssetKind     *string   `json:"asset_kind"`
	IsBenchmark   bool      `json:"is_benchmark"`
	Note          *string   `json:"note"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// AccountTemplate is a build-from-template blueprint set (PRD §5.2.12).
type AccountTemplate struct {
	ID          int64           `json:"id"`
	Name        string          `json:"name"`
	Description *string         `json:"description"`
	IsBuiltin   bool            `json:"is_builtin"`
	Blueprints  json.RawMessage `json:"account_blueprints"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// Price is one manually maintained market price for an instrument on a date.
type Price struct {
	ID        int64     `json:"id"`
	Symbol    string    `json:"symbol"`
	PriceDate string    `json:"price_date"`
	Price     string    `json:"price"`
	Currency  string    `json:"currency"`
	Source    string    `json:"source"`
	Note      *string   `json:"note"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// FxRate is one manually maintained currency conversion rate on a date.
type FxRate struct {
	ID            int64     `json:"id"`
	BaseCurrency  string    `json:"base_currency"`
	QuoteCurrency string    `json:"quote_currency"`
	RateDate      string    `json:"rate_date"`
	Rate          string    `json:"rate"`
	Source        string    `json:"source"`
	Note          *string   `json:"note"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type PriceList struct {
	Items     []Price `json:"items"`
	Truncated bool    `json:"truncated"`
	Limit     int     `json:"limit"`
}

type FxRateList struct {
	Items     []FxRate `json:"items"`
	Truncated bool     `json:"truncated"`
	Limit     int      `json:"limit"`
}

type CreditCardCategory struct {
	Name   string `json:"name"`
	Amount string `json:"amount"`
}

type CreditCardBill struct {
	ID                 int64                `json:"id"`
	AccountID          int64                `json:"account_id"`
	AccountName        string               `json:"account_name,omitempty"`
	Institution        string               `json:"institution,omitempty"`
	StatementDate      string               `json:"statement_date"`
	AmountTotal        string               `json:"amount_total"`
	Currency           string               `json:"currency"`
	TopCategories      []CreditCardCategory `json:"top_categories"`
	PaidAt             *string              `json:"paid_at"`
	PaymentAccountID   *int64               `json:"payment_account_id"`
	PaymentAccountName *string              `json:"payment_account_name,omitempty"`
	Note               *string              `json:"note"`
	CreatedAt          time.Time            `json:"created_at"`
	UpdatedAt          time.Time            `json:"updated_at"`
}

type ReviewBatch struct {
	ReviewDate        string             `json:"review_date"`
	BalanceSnapshots  []BalanceSnapshot  `json:"balance_snapshots"`
	PositionSnapshots []PositionSnapshot `json:"position_snapshots"`
	CreditCardBills   []CreditCardBill   `json:"credit_card_bills"`
}

type ReviewBatchResult struct {
	ReviewDate        string `json:"review_date"`
	BalanceSnapshots  int    `json:"balance_snapshots"`
	PositionSnapshots int    `json:"position_snapshots"`
	CreditCardBills   int    `json:"credit_card_bills"`
}

// Valuation is the P2 current valuation payload consumed by the dashboard and
// holding overview. Money fields are decimal strings in DisplayCurrency.
type Valuation struct {
	AsOf             string                       `json:"as_of"`
	DisplayCurrency  string                       `json:"display_currency"`
	FxMode           string                       `json:"fx_mode"`
	NetWorth         string                       `json:"net_worth"`
	TotalAssets      string                       `json:"total_assets"`
	TotalLiabilities string                       `json:"total_liabilities"`
	CashValue        string                       `json:"cash_value"`
	PositionValue    string                       `json:"position_value"`
	PositionCost     string                       `json:"position_cost"`
	UnrealizedPL     string                       `json:"unrealized_pl"`
	UnrealizedPLPct  *string                      `json:"unrealized_pl_pct"`
	PositionShare    *string                      `json:"position_share"`
	Allocations      map[string][]ValuationBucket `json:"allocations"`
	Positions        []ValuationPosition          `json:"positions"`
	PositionGroups   []ValuationPosition          `json:"position_groups"`
	Warnings         []ValuationWarning           `json:"warnings"`
}

type ValuationBucket struct {
	Key     string `json:"key"`
	Name    string `json:"name"`
	Value   string `json:"value"`
	Percent string `json:"percent"`
}

type ValuationWarning struct {
	Kind    string `json:"kind"`
	Key     string `json:"key"`
	Message string `json:"message"`
}

type ValuationPosition struct {
	AccountID           int64   `json:"account_id"`
	AccountName         string  `json:"account_name"`
	AccountCurrency     string  `json:"account_currency"`
	AccountKind         string  `json:"account_kind"`
	Institution         string  `json:"institution"`
	Symbol              string  `json:"symbol"`
	DisplayName         *string `json:"display_name"`
	Market              *string `json:"market"`
	QuoteCurrency       string  `json:"quote_currency"`
	Quantity            string  `json:"quantity"`
	AvgCost             *string `json:"avg_cost"`
	CostCurrency        string  `json:"cost_currency"`
	SnapshotDate        string  `json:"snapshot_date"`
	Price               *string `json:"price"`
	PriceCurrency       *string `json:"price_currency"`
	PriceDate           *string `json:"price_date"`
	MarketValue         *string `json:"market_value"`
	MarketValueDisplay  *string `json:"market_value_display"`
	CostValueDisplay    *string `json:"cost_value_display"`
	UnrealizedPLDisplay *string `json:"unrealized_pl_display"`
	UnrealizedPLPct     *string `json:"unrealized_pl_pct"`
	Weight              *string `json:"weight"`
	AssetWeight         *string `json:"asset_weight"`
	HoldingStartDate    *string `json:"holding_start_date"`
	HoldingDays         *int    `json:"holding_days"`
	MissingPrice        bool    `json:"missing_price"`
	FxFallback          bool    `json:"fx_fallback"`
}

// Transaction is a buy/sell on a holding account (PRD §5.2.15). Money fields are
// decimal strings.
type Transaction struct {
	ID          int64     `json:"id"`
	AccountID   int64     `json:"account_id"`
	AccountName string    `json:"account_name,omitempty"`
	Institution string    `json:"institution,omitempty"`
	Symbol      string    `json:"symbol"`
	DisplayName *string   `json:"display_name,omitempty"`
	Action      string    `json:"action"`
	TradeDate   string    `json:"trade_date"`
	SettleDate  *string   `json:"settle_date"`
	Quantity    string    `json:"quantity"`
	Price       string    `json:"price"`
	Currency    string    `json:"currency"`
	Fee         *string   `json:"fee"`
	IsSettled   bool      `json:"is_settled"`
	Notes       *string   `json:"notes"`
	Source      string    `json:"source"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Transfer moves cash between two accounts (PRD §5.2.17). Net worth is unchanged.
type Transfer struct {
	ID              int64     `json:"id"`
	FromAccountID   int64     `json:"from_account_id"`
	ToAccountID     int64     `json:"to_account_id"`
	FromAccountName *string   `json:"from_account_name,omitempty"`
	ToAccountName   *string   `json:"to_account_name,omitempty"`
	FromCurrency    string    `json:"from_currency,omitempty"`
	ToCurrency      string    `json:"to_currency,omitempty"`
	FromAmount      string    `json:"from_amount"`
	ToAmount        string    `json:"to_amount"`
	TransferDate    string    `json:"transfer_date"`
	Notes           *string   `json:"notes"`
	Source          string    `json:"source"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// IncomeEvent is a dividend/interest/rebate/other return not tied to a buy/sell
// (PRD §5.2.6). It never mutates snapshots, quantity, or cost.
type IncomeEvent struct {
	ID                 int64     `json:"id"`
	EventKind          string    `json:"event_kind"`
	EventDate          string    `json:"event_date"`
	AccountID          int64     `json:"account_id"`
	AccountName        string    `json:"account_name,omitempty"`
	Institution        string    `json:"institution,omitempty"`
	Symbol             *string   `json:"symbol"`
	Amount             string    `json:"amount"`
	Currency           string    `json:"currency"`
	PaymentAccountID   *int64    `json:"payment_account_id"`
	PaymentAccountName *string   `json:"payment_account_name,omitempty"`
	TaxWithheld        *string   `json:"tax_withheld"`
	Note               *string   `json:"note"`
	Source             string    `json:"source"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// CorporateAction is a split/merge/rights event on an instrument (PRD §5.2.16),
// replayed in the holdings event stream (§6.17).
type CorporateAction struct {
	ID               int64           `json:"id"`
	Symbol           string          `json:"symbol"`
	DisplayName      *string         `json:"display_name,omitempty"`
	Action           string          `json:"action"`
	EventDate        string          `json:"event_date"`
	RatioNumerator   string          `json:"ratio_numerator"`
	RatioDenominator string          `json:"ratio_denominator"`
	Extra            json.RawMessage `json:"extra,omitempty"`
	Notes            *string         `json:"notes"`
	Source           string          `json:"source"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}
