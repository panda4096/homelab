// Package config loads finbrain runtime configuration from the environment.
package config

import (
	"fmt"
	"os"
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
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	loc, err := time.LoadLocation(c.Timezone)
	if err != nil {
		return nil, fmt.Errorf("invalid FINBRAIN_TIMEZONE %q: %w", c.Timezone, err)
	}
	c.Location = loc
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
