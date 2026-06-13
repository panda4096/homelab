// Package domain holds business helpers that are not pure data access.
// P1: date handling in the configured timezone (PLAN §2.2).
package domain

import (
	"fmt"
	"time"
)

// FutureGraceDays is how far ahead a snapshot date may be (PRD §4.2).
const FutureGraceDays = 7

// Today returns midnight of the current day in loc.
func Today(loc *time.Location) time.Time {
	n := time.Now().In(loc)
	return time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, loc)
}

// TodayString returns today's date in loc as YYYY-MM-DD.
func TodayString(loc *time.Location) string {
	return Today(loc).Format("2006-01-02")
}

// ParseDate parses a YYYY-MM-DD string in loc.
func ParseDate(s string, loc *time.Location) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", s, loc)
}

// ValidateSnapshotDate checks the date is well-formed and not more than
// FutureGraceDays in the future (PRD §4.2 hard rule). Being earlier than the
// account's creation date is only a soft UI warning, not enforced here.
func ValidateSnapshotDate(s string, loc *time.Location) error {
	d, err := ParseDate(s, loc)
	if err != nil {
		return fmt.Errorf("invalid date %q (want YYYY-MM-DD)", s)
	}
	max := Today(loc).AddDate(0, 0, FutureGraceDays)
	if d.After(max) {
		return fmt.Errorf("date %s is more than %d days in the future", s, FutureGraceDays)
	}
	return nil
}
