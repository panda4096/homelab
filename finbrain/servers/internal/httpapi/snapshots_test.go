package httpapi

import "testing"

func TestSnapshotKindSupport(t *testing.T) {
	for _, kind := range []string{"cash", "time_deposit", "wealth_product"} {
		if !supportsBalanceSnapshots(kind) {
			t.Fatalf("%s should support balance snapshots", kind)
		}
		if supportsPositionSnapshots(kind) {
			t.Fatalf("%s should not support position snapshots", kind)
		}
	}

	for _, kind := range []string{"brokerage", "fund", "crypto_wallet"} {
		if !supportsPositionSnapshots(kind) {
			t.Fatalf("%s should support position snapshots", kind)
		}
		if supportsBalanceSnapshots(kind) {
			t.Fatalf("%s should not support balance snapshots", kind)
		}
	}

	for _, kind := range []string{"credit_card", "custom"} {
		if supportsBalanceSnapshots(kind) || supportsPositionSnapshots(kind) {
			t.Fatalf("%s should not support P1 snapshots by default", kind)
		}
	}
}

func TestValidMoneyDecimal(t *testing.T) {
	for _, v := range []string{"0", "1", "1.2", "1.23", "-1.23", "50000.00"} {
		if !validMoneyDecimal(v) {
			t.Fatalf("%q should be valid money", v)
		}
	}

	for _, v := range []string{"", ".", ".1", "1.", "1.234", "NaN", "1e2", "+1.00"} {
		if validMoneyDecimal(v) {
			t.Fatalf("%q should be invalid money", v)
		}
	}
}

func TestValidDecimalString(t *testing.T) {
	for _, v := range []string{"0", "1", "1.2", "123456789012345678901234567890.12345678", "-0.00000001"} {
		if !validDecimal(v) {
			t.Fatalf("%q should be a valid decimal string", v)
		}
	}

	for _, v := range []string{"", ".", ".1", "1.", "1.123456789", "NaN", "1e2", "+1.00"} {
		if validDecimal(v) {
			t.Fatalf("%q should be an invalid decimal string", v)
		}
	}
}

func TestNegativeDecimalString(t *testing.T) {
	for _, v := range []string{"-1", "-0.00000001", " -100.25 "} {
		if !isNegativeDecimal(v) {
			t.Fatalf("%q should be negative", v)
		}
	}

	for _, v := range []string{"0", "1", "-0", "-0.0", "-000.00000000"} {
		if isNegativeDecimal(v) {
			t.Fatalf("%q should not be treated as negative", v)
		}
	}
}
