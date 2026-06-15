package httpapi

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	authIPWindow       = time.Minute
	authUserWindow     = time.Minute
	authFailureHorizon = 30 * time.Minute
)

type authRateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
	failures map[string]authFailure
}

type authFailure struct {
	Count       int
	LastFailure time.Time
	LockedUntil time.Time
}

func newAuthRateLimiter() *authRateLimiter {
	return &authRateLimiter{
		attempts: map[string][]time.Time{},
		failures: map[string]authFailure{},
	}
}

func (l *authRateLimiter) allowAttempt(keys []string, limit int, window time.Duration, now time.Time) (time.Duration, bool) {
	if l == nil {
		return 0, true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.cleanup(now)
	for _, key := range keys {
		attempts := pruneTimes(l.attempts[key], now.Add(-window))
		if len(attempts) >= limit {
			return attempts[0].Add(window).Sub(now), false
		}
	}
	for _, key := range keys {
		l.attempts[key] = append(pruneTimes(l.attempts[key], now.Add(-window)), now)
	}
	return 0, true
}

func (l *authRateLimiter) locked(keys []string, now time.Time) (time.Duration, bool) {
	if l == nil {
		return 0, false
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.cleanup(now)
	var maxWait time.Duration
	for _, key := range keys {
		f := l.failures[key]
		if f.LockedUntil.After(now) {
			if wait := f.LockedUntil.Sub(now); wait > maxWait {
				maxWait = wait
			}
		}
	}
	return maxWait, maxWait > 0
}

func (l *authRateLimiter) recordFailure(keys []string, now time.Time) {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.cleanup(now)
	for _, key := range keys {
		f := l.failures[key]
		if now.Sub(f.LastFailure) > authFailureHorizon {
			f = authFailure{}
		}
		f.Count++
		f.LastFailure = now
		if delay := authFailureDelay(f.Count); delay > 0 {
			f.LockedUntil = now.Add(delay)
		}
		l.failures[key] = f
	}
}

func (l *authRateLimiter) recordSuccess(keys []string) {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, key := range keys {
		delete(l.failures, key)
	}
}

func (l *authRateLimiter) cleanup(now time.Time) {
	attemptCutoff := now.Add(-5 * time.Minute)
	for key, attempts := range l.attempts {
		attempts = pruneTimes(attempts, attemptCutoff)
		if len(attempts) == 0 {
			delete(l.attempts, key)
		} else {
			l.attempts[key] = attempts
		}
	}
	for key, f := range l.failures {
		if now.Sub(f.LastFailure) > authFailureHorizon && !f.LockedUntil.After(now) {
			delete(l.failures, key)
		}
	}
}

func pruneTimes(items []time.Time, cutoff time.Time) []time.Time {
	i := 0
	for i < len(items) && items[i].Before(cutoff) {
		i++
	}
	return items[i:]
}

func authFailureDelay(count int) time.Duration {
	switch {
	case count < 5:
		return 0
	case count == 5:
		return 30 * time.Second
	case count == 6:
		return time.Minute
	case count == 7:
		return 5 * time.Minute
	default:
		return 15 * time.Minute
	}
}

func authClientIP(r *http.Request) string {
	host := strings.TrimSpace(r.RemoteAddr)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	if host == "" {
		return "unknown"
	}
	return host
}

func authRateKeys(prefix, ip, username string) []string {
	keys := []string{prefix + ":ip:" + ip}
	if username != "" {
		keys = append(keys, prefix+":user:"+username)
	}
	return keys
}
