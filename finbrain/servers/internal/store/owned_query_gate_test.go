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
		"institutions", "accounts", "api_keys", "agent_audit",
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
					window := nearbyLines(lines, i, 10)
					if !strings.Contains(window, "user_id") && !strings.Contains(window, "OWNED") {
						t.Fatalf("%s:%d references owned table %s without user_id/OWNED in nearby SQL", path, i+1, table)
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
