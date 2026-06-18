package yahoo

import "testing"

func TestParseChart(t *testing.T) {
	// shortName + a null close in the middle (non-trading gap / in-progress bar) that must be
	// skipped; gmtoffset=0 so dates are the UTC day. ts 0/86400/172800 = 1970-01-01/02/03.
	body := []byte(`{"chart":{"result":[{"meta":{"currency":"USD","shortName":"Apple Inc.","gmtoffset":0},
		"timestamp":[0,86400,172800],
		"indicators":{"quote":[{"close":[1.5,null,2.5]}]}}],"error":null}}`)
	name, bars, err := parseChart(body)
	if err != nil {
		t.Fatalf("parseChart: %v", err)
	}
	if name != "Apple Inc." {
		t.Errorf("name = %q, want Apple Inc.", name)
	}
	if len(bars) != 2 {
		t.Fatalf("bars = %+v, want 2 (null skipped)", bars)
	}
	if bars[0].Date != "1970-01-01" || bars[0].Close != "1.500000" {
		t.Errorf("bar[0] = %+v", bars[0])
	}
	if bars[1].Date != "1970-01-03" || bars[1].Close != "2.500000" {
		t.Errorf("bar[1] = %+v", bars[1])
	}
}

func TestParseChartGMTOffset(t *testing.T) {
	// ts 86400 (1970-01-02 00:00 UTC) with a -1h offset rolls back to 1970-01-01 local.
	body := []byte(`{"chart":{"result":[{"meta":{"shortName":"X","gmtoffset":-3600},
		"timestamp":[86400],"indicators":{"quote":[{"close":[10]}]}}],"error":null}}`)
	_, bars, err := parseChart(body)
	if err != nil || len(bars) != 1 {
		t.Fatalf("parseChart: %v bars=%+v", err, bars)
	}
	if bars[0].Date != "1970-01-01" {
		t.Errorf("date = %q, want 1970-01-01 (offset applied)", bars[0].Date)
	}
}

func TestParseChartLongNameFallback(t *testing.T) {
	body := []byte(`{"chart":{"result":[{"meta":{"longName":"Tencent Holdings","gmtoffset":0},
		"timestamp":[0],"indicators":{"quote":[{"close":[400]}]}}],"error":null}}`)
	name, _, err := parseChart(body)
	if err != nil || name != "Tencent Holdings" {
		t.Errorf("name = %q, %v; want Tencent Holdings", name, err)
	}
}

func TestParseChartError(t *testing.T) {
	body := []byte(`{"chart":{"result":null,"error":{"code":"Not Found","description":"No data found, symbol may be delisted"}}}`)
	if _, _, err := parseChart(body); err == nil {
		t.Error("expected error for chart.error response")
	}
}

func TestParseChartEmpty(t *testing.T) {
	if _, _, err := parseChart([]byte(`{"chart":{"result":[],"error":null}}`)); err == nil {
		t.Error("expected error for empty result")
	}
}
