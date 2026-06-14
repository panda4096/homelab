package httpapi

import "testing"

func TestValidateReadOnlySQL(t *testing.T) {
	ok := []string{
		"SELECT * FROM accounts LIMIT 10",
		"select id, name from accounts where kind='cash' limit 50",
		"WITH t AS (SELECT 1 AS n) SELECT n FROM t",
		"  select 1 ;  ", // single trailing semicolon allowed
	}
	for _, q := range ok {
		if msg := validateReadOnlySQL(q); msg != "" {
			t.Errorf("expected OK for %q, got %q", q, msg)
		}
	}
	bad := []string{
		"DELETE FROM accounts",
		"update accounts set name='x'",
		"insert into accounts (name) values ('x')",
		"drop table accounts",
		"truncate transactions",
		"select 1; drop table accounts",      // multiple statements
		"select * from accounts; select 2",   // multiple statements
		"alter table accounts add column z int",
		"grant all on accounts to public",
		"",
	}
	for _, q := range bad {
		if msg := validateReadOnlySQL(q); msg == "" {
			t.Errorf("expected rejection for %q", q)
		}
	}
}

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
