#!/usr/bin/env python3
"""Import normalized activities into Ghostfolio's /api/v1/import endpoint."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib import request


def main() -> int:
    base_url = os.environ.get("GHOSTFOLIO_BASE_URL")
    token = os.environ.get("GHOSTFOLIO_API_TOKEN")
    payload_path = Path(sys.argv[1] if len(sys.argv) > 1 else "activities.json")
    if not base_url or not token:
        print("GHOSTFOLIO_BASE_URL and GHOSTFOLIO_API_TOKEN are required", file=sys.stderr)
        return 1

    body = payload_path.read_bytes()
    req = request.Request(
        f"{base_url.rstrip('/')}/api/v1/import",
        data=body,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with request.urlopen(req) as resp:  # noqa: S310
        print(resp.status, resp.read().decode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
