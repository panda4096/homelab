package store

import "strings"

// defaultListLimit caps P4 list endpoints (transactions/transfers/income/corp
// actions), matching the market-data list cap (PLAN §2.1).
const defaultListLimit = marketDataLimit

// nonEmptySource defaults a blank source tag to "manual" (PRD §5.2.15–17).
func nonEmptySource(s string) string {
	if strings.TrimSpace(s) == "" {
		return "manual"
	}
	return s
}
