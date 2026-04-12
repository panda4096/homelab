#!/usr/bin/env python3
"""Seed Firefly account definitions from a JSON file."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib import request


def post_json(url: str, token: str, payload: dict) -> tuple[int, str]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with request.urlopen(req) as resp:  # noqa: S310
        return resp.status, resp.read().decode("utf-8")


def main() -> int:
    base_url = os.environ.get("FIREFLY_API_BASE_URL")
    token = os.environ.get("FIREFLY_API_TOKEN")
    payload_path = Path(sys.argv[1] if len(sys.argv) > 1 else "accounts.json")
    if not base_url or not token:
        print("FIREFLY_API_BASE_URL and FIREFLY_API_TOKEN are required", file=sys.stderr)
        return 1
    if not payload_path.exists():
        print(f"missing payload file: {payload_path}", file=sys.stderr)
        return 1

    accounts = json.loads(payload_path.read_text())
    for account in accounts:
        status, body = post_json(f"{base_url.rstrip('/')}/api/v1/accounts", token, {"data": account})
        print(status, body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
