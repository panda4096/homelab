package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func TestBatchUpsertPricesRejectsInvalidRows(t *testing.T) {
	s := &Server{cfg: &config.Config{Location: time.UTC}}
	req := httptest.NewRequest(http.MethodPost, "/api/prices/batch", strings.NewReader(`[
		{"symbol":"AAPL","price_date":"2025-01-01","price":"100.00","currency":"USD"},
		{"symbol":"MSFT","price_date":"2025-01-01","price":"0","currency":"USD"}
	]`))
	rec := httptest.NewRecorder()

	s.batchUpsertPrices(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d, want %d body=%s", rec.Code, http.StatusUnprocessableEntity, rec.Body.String())
	}
	var body struct {
		Error struct {
			Details []batchRowError `json:"details"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Error.Details) != 1 {
		t.Fatalf("details=%d, want 1", len(body.Error.Details))
	}
	got := body.Error.Details[0]
	if got.LineIndex != 1 || got.EntityType != "prices" || got.ErrorCode != "business_rule_violated" {
		t.Fatalf("unexpected detail: %+v", got)
	}
	if !strings.Contains(got.Message, "price must be > 0") {
		t.Fatalf("message=%q, want price validation", got.Message)
	}
}

func TestBatchUpsertFxRatesRejectsInvalidRows(t *testing.T) {
	s := &Server{cfg: &config.Config{Location: time.UTC}}
	req := httptest.NewRequest(http.MethodPost, "/api/fx-rates/batch", strings.NewReader(`[
		{"base_currency":"USD","quote_currency":"CNY","rate_date":"2025-01-01","rate":"7.20"},
		{"base_currency":"USD","quote_currency":"USD","rate_date":"2025-01-01","rate":"1"}
	]`))
	rec := httptest.NewRecorder()

	s.batchUpsertFxRates(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d, want %d body=%s", rec.Code, http.StatusUnprocessableEntity, rec.Body.String())
	}
	var body struct {
		Error struct {
			Details []batchRowError `json:"details"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Error.Details) != 1 {
		t.Fatalf("details=%d, want 1", len(body.Error.Details))
	}
	got := body.Error.Details[0]
	if got.LineIndex != 1 || got.EntityType != "fx_rates" || got.ErrorCode != "business_rule_violated" {
		t.Fatalf("unexpected detail: %+v", got)
	}
	if !strings.Contains(got.Message, "must differ") {
		t.Fatalf("message=%q, want currency pair validation", got.Message)
	}
}

func TestMarketDataNormalizesSymbols(t *testing.T) {
	price := store.Price{Symbol: " aapl ", PriceDate: "2026-06-12", Price: "195.00", Currency: "usd"}
	normalizePrice(&price)
	if price.Symbol != "AAPL" {
		t.Fatalf("price symbol=%q, want AAPL", price.Symbol)
	}
	if price.Currency != "USD" {
		t.Fatalf("price currency=%q, want USD", price.Currency)
	}

	instrument := store.Instrument{Symbol: " 0700.hk "}
	normalizeInstrumentText(&instrument)
	if instrument.Symbol != "0700.HK" {
		t.Fatalf("instrument symbol=%q, want 0700.HK", instrument.Symbol)
	}
}
