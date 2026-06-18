// Package config loads finbrain runtime configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all runtime configuration. See .env.example for the env vars.
type Config struct {
	Env         string         // FINBRAIN_ENV; "production" enables auth enforcement
	Port        string         // PORT (default 8000)
	DatabaseURL string         // DATABASE_URL (required)
	Timezone    string         // FINBRAIN_TIMEZONE (default Asia/Shanghai)
	Location    *time.Location // resolved from Timezone
	AuthHeader  string         // FINBRAIN_AUTH_HEADER; trusted identity header when behind a proxy
	StaticDir   string         // FINBRAIN_STATIC_DIR; optional built-frontend dir to serve

	// LLM (P6). DeepSeek is the default provider (PLAN §2.4); Anthropic is a fallback.
	DeepSeekAPIKey  string // DEEPSEEK_API_KEY
	AnthropicAPIKey string // ANTHROPIC_API_KEY (fallback)
	LLMModel        string // FINBRAIN_LLM_MODEL; optional override (default deepseek-v4-flash)

	// Market data auto-fetch (key-less). The scheduler polls the latest price for every
	// instrument and backfills history for newly added ones. Stocks/indices/FX come from
	// Yahoo (overseas, split-adjusted); open-end fund NAV comes from Eastmoney (domestic).
	MarketDataEnabled       bool          // FINBRAIN_MARKETDATA_ENABLED (default true)
	MarketDataInterval      time.Duration // FINBRAIN_MARKETDATA_INTERVAL (default 30m)
	MarketDataProxy         string        // FINBRAIN_MARKETDATA_PROXY; Eastmoney/fund proxy. Empty = direct (domestic source must NOT use an overseas proxy)
	MarketDataYahooProxy    string        // FINBRAIN_MARKETDATA_YAHOO_PROXY; Yahoo proxy override. Empty = honour HTTP(S)_PROXY env (local clash → overseas; VPS → direct)
	MarketDataBackfillYears int           // FINBRAIN_MARKETDATA_BACKFILL_YEARS (default 10; <=0 = full history)

	// Net-worth trend tuning. The common path (no transactions) loads the user's snapshots
	// once and computes every date in memory against the cached prices/FX — no per-date DB
	// queries, so it's ~0.1s regardless of point count or concurrency. Concurrency only
	// matters for the per-date FALLBACK used by transaction users (replay). cap bounds the
	// chart's point count (a chart can't resolve more than ~150 anyway).
	TrendMaxPoints   int // FINBRAIN_TREND_MAX_POINTS (default 120)
	TrendConcurrency int // FINBRAIN_TREND_CONCURRENCY (fallback path only; default 4; 1 = serial)
}

// Load reads configuration from the environment and validates it.
func Load() (*Config, error) {
	c := &Config{
		Env:         getenv("FINBRAIN_ENV", "development"),
		Port:        getenv("PORT", "8000"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		Timezone:    getenv("FINBRAIN_TIMEZONE", "Asia/Shanghai"),
		AuthHeader:  os.Getenv("FINBRAIN_AUTH_HEADER"),
		StaticDir:   os.Getenv("FINBRAIN_STATIC_DIR"),

		DeepSeekAPIKey:  os.Getenv("DEEPSEEK_API_KEY"),
		AnthropicAPIKey: os.Getenv("ANTHROPIC_API_KEY"),
		LLMModel:        os.Getenv("FINBRAIN_LLM_MODEL"),

		MarketDataEnabled:       getenvBool("FINBRAIN_MARKETDATA_ENABLED", true),
		MarketDataInterval:      getenvDuration("FINBRAIN_MARKETDATA_INTERVAL", 30*time.Minute),
		MarketDataProxy:         os.Getenv("FINBRAIN_MARKETDATA_PROXY"),
		MarketDataYahooProxy:    os.Getenv("FINBRAIN_MARKETDATA_YAHOO_PROXY"),
		MarketDataBackfillYears: getenvInt("FINBRAIN_MARKETDATA_BACKFILL_YEARS", 10),

		TrendMaxPoints:   getenvInt("FINBRAIN_TREND_MAX_POINTS", 120),
		TrendConcurrency: getenvInt("FINBRAIN_TREND_CONCURRENCY", 4),
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	loc, err := time.LoadLocation(c.Timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid FINBRAIN_TIMEZONE %q: %w", c.Timezone, err)
	}
	c.Location = loc
	if c.MarketDataInterval < time.Minute {
		c.MarketDataInterval = time.Minute
	}
	return c, nil
}

// IsDev reports whether auth enforcement is off (anything but production).
func (c *Config) IsDev() bool { return c.Env != "production" }

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func getenvBool(k string, def bool) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(k))) {
	case "":
		return def
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func getenvDuration(k string, def time.Duration) time.Duration {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func getenvInt(k string, def int) int {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
