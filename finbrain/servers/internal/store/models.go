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
	ID         int64           `json:"id"`
	Name       string          `json:"name"`
	Description *string         `json:"description"`
	IsBuiltin  bool            `json:"is_builtin"`
	Blueprints json.RawMessage `json:"account_blueprints"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}
