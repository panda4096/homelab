#!/usr/bin/env python3
"""Convert a simple credit-card CSV into a Firefly transaction batch preview."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: import_credit_card_statement.py <statement.csv>", file=sys.stderr)
        return 1

    source = Path(sys.argv[1])
    rows = []
    with source.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            amount = row["amount"].strip()
            rows.append(
                {
                    "type": "withdrawal" if not amount.startswith("-") else "deposit",
                    "date": row["date"],
                    "description": row["description"],
                    "amount": amount.lstrip("-"),
                    "currency_code": row.get("currency", "HKD"),
                    "external_id": row.get("external_id") or row.get("reference"),
                    "notes": row.get("category", ""),
                }
            )
    print(json.dumps({"transactions": rows}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
