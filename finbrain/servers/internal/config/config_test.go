package config

import (
	"testing"
)

func TestLoadDefaultsAndTimezone(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x/y")
	t.Setenv("FINBRAIN_ENV", "")
	t.Setenv("FINBRAIN_TIMEZONE", "")

	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.Timezone != "Asia/Shanghai" {
		t.Errorf("default timezone = %q, want Asia/Shanghai", c.Timezone)
	}
	if c.Location == nil {
		t.Error("Location not resolved")
	}
	if !c.IsDev() {
		t.Error("default env should be dev")
	}
	if c.Port != "8000" {
		t.Errorf("default port = %q, want 8000", c.Port)
	}
}

func TestLoadRequiresDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	if _, err := Load(); err == nil {
		t.Error("expected error when DATABASE_URL is empty")
	}
}

func TestLoadRejectsBadTimezone(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x/y")
	t.Setenv("FINBRAIN_TIMEZONE", "Not/AZone")
	if _, err := Load(); err == nil {
		t.Error("expected error for invalid timezone")
	}
}
