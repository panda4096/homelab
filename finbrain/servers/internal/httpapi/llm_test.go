package httpapi

import "testing"

func TestStripCodeFence(t *testing.T) {
	cases := map[string]string{
		"```sql\nSELECT 1\n```": "SELECT 1",
		"```\nSELECT 2\n```":    "SELECT 2",
		"SELECT 3":              "SELECT 3",
	}
	for in, want := range cases {
		if got := stripCodeFence(in); got != want {
			t.Errorf("stripCodeFence(%q) = %q, want %q", in, got, want)
		}
	}
}
