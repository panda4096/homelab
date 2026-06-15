package store

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

func TestOwnedTableQueriesAreUserScoped(t *testing.T) {
	ownedTables := []string{
		"institutions", "accounts", "user_preferences", "api_keys", "agent_audit",
		"allocation_target_sets", "allocation_target_items",
		"summaries", "annotations",
		"balance_snapshots", "position_snapshots",
		"transactions", "transfers", "income_events", "credit_card_bills",
	}
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	internalDir := filepath.Dir(filepath.Dir(thisFile))
	scanDirs := []string{filepath.Join(internalDir, "store"), filepath.Join(internalDir, "httpapi")}
	// Global instruments are shared. These references count whether a symbol is
	// used anywhere before allowing a global instrument delete.
	allowGlobalOwnedReferences := map[string]bool{"instruments.go": true}

	for _, dir := range scanDirs {
		err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			if allowGlobalOwnedReferences[filepath.Base(path)] {
				return nil
			}
			content, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			lines := strings.Split(string(content), "\n")
			for _, table := range ownedTables {
				re := regexp.MustCompile(`(?i)\b(FROM|JOIN|UPDATE|INTO)\s+` + regexp.QuoteMeta(table) + `\b`)
				for i, line := range lines {
					if !re.MatchString(line) {
						continue
					}
					window := nearbyLines(lines, i, 14)
					if !strings.Contains(window, "OWNED "+table) && !(tableOwnedByExport(table) && strings.Contains(window, "OWNED export")) {
						t.Fatalf("%s:%d references owned table %s without explicit OWNED marker", path, i+1, table)
					}
					if !hasOwnedScope(window, table) {
						t.Fatalf("%s:%d references owned table %s without a strong user scope predicate", path, i+1, table)
					}
				}
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
}

func hasOwnedScope(sql, table string) bool {
	if regexp.MustCompile(`(?i)\b[a-z_]*\.?user_id\s*=\s*\$\d+\b`).MatchString(sql) {
		return true
	}
	if regexp.MustCompile(`(?i)\$\d+\s*=\s*\b[a-z_]*\.?user_id\b`).MatchString(sql) {
		return true
	}
	if regexp.MustCompile(`(?is)INSERT\s+INTO\s+` + regexp.QuoteMeta(table) + `\s*\([^)]*\buser_id\b`).MatchString(sql) {
		return true
	}
	if regexp.MustCompile(`(?i)\buser_id\s*=\s*%d\b`).MatchString(sql) && strings.Contains(sql, "userOf(r)") {
		return true
	}
	if strings.Contains(sql, "/* OWNED "+table+" requires caller scope */") {
		return true
	}
	return strings.Contains(sql, "/* OWNED "+table+" via scoped ")
}

func tableOwnedByExport(table string) bool {
	switch table {
	case "institutions", "accounts", "balance_snapshots", "position_snapshots",
		"credit_card_bills", "transactions", "transfers", "income_events",
		"allocation_target_sets", "allocation_target_items", "annotations", "summaries":
		return true
	default:
		return false
	}
}

func nearbyLines(lines []string, idx, radius int) string {
	start := idx - radius
	if start < 0 {
		start = 0
	}
	end := idx + radius + 1
	if end > len(lines) {
		end = len(lines)
	}
	return strings.Join(lines[start:end], "\n")
}
