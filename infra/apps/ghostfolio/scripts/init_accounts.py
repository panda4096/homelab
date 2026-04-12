#!/usr/bin/env python3
"""Validate the expected Ghostfolio account mapping file."""

from __future__ import annotations

import json
import sys
from pathlib import Path


EXPECTED = {"HSBC HK", "Futu HK"}


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "accounts.json")
    if not path.exists():
        print(f"missing mapping file: {path}", file=sys.stderr)
        return 1

    payload = json.loads(path.read_text())
    names = {item["name"] for item in payload}
    missing = EXPECTED - names
    if missing:
        print(f"missing required account names: {sorted(missing)}", file=sys.stderr)
        return 1
    print("account mapping looks good")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
