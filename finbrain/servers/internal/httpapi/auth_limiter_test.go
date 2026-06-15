package httpapi

import (
	"testing"
	"time"
)

func TestAuthRateLimiterLimitsWindow(t *testing.T) {
	l := newAuthRateLimiter()
	now := time.Unix(1000, 0)
	for i := 0; i < 3; i++ {
		if wait, ok := l.allowAttempt([]string{"login:user:panda"}, 3, time.Minute, now.Add(time.Duration(i)*time.Second)); !ok {
			t.Fatalf("attempt %d blocked with wait %s", i+1, wait)
		}
	}
	if wait, ok := l.allowAttempt([]string{"login:user:panda"}, 3, time.Minute, now.Add(4*time.Second)); ok || wait <= 0 {
		t.Fatalf("expected rate limit, ok=%v wait=%s", ok, wait)
	}
	if wait, ok := l.allowAttempt([]string{"login:user:panda"}, 3, time.Minute, now.Add(61*time.Second)); !ok {
		t.Fatalf("expected window to roll forward, wait=%s", wait)
	}
}

func TestAuthRateLimiterLocksAfterFailuresAndResetsOnSuccess(t *testing.T) {
	l := newAuthRateLimiter()
	keys := []string{"login:ip:127.0.0.1", "login:user:panda"}
	now := time.Unix(1000, 0)
	for i := 0; i < 5; i++ {
		l.recordFailure(keys, now.Add(time.Duration(i)*time.Second))
	}
	if wait, locked := l.locked(keys, now.Add(5*time.Second)); !locked || wait <= 0 {
		t.Fatalf("expected lock, locked=%v wait=%s", locked, wait)
	}
	l.recordSuccess(keys)
	if wait, locked := l.locked(keys, now.Add(6*time.Second)); locked {
		t.Fatalf("expected success to clear lock, wait=%s", wait)
	}
}
