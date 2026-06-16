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

	// Market data auto-fetch (Eastmoney, key-less). The scheduler polls the latest
	// price for every instrument and backfills history for newly added ones.
	MarketDataEnabled       bool          // FINBRAIN_MARKETDATA_ENABLED (default true)
	MarketDataInterval      time.Duration // FINBRAIN_MARKETDATA_INTERVAL (default 30m)
	MarketDataProxy         string        // FINBRAIN_MARKETDATA_PROXY; optional, only if a non-China source is added
	MarketDataBackfillYears int           // FINBRAIN_MARKETDATA_BACKFILL_YEARS (default 10; <=0 = full history)
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
		MarketDataBackfillYears: getenvInt("FINBRAIN_MARKETDATA_BACKFILL_YEARS", 10),
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
