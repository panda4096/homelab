package httpapi

import "testing"

func TestOneOf(t *testing.T) {
	if !oneOf("current", "current", "historical") {
		t.Error("current should be allowed")
	}
	if oneOf("weekly", "day", "month", "quarter", "year") {
		t.Error("weekly should not be allowed")
	}
}
