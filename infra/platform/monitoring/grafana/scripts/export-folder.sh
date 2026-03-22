#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

folder_ref="${1:-}"
if [[ -z "${folder_ref}" ]]; then
  echo "usage: $0 <folder-key|folder-uid|folder-title>" >&2
  exit 1
fi

dashboards_json="$(dashboards_for_folder_json "${folder_ref}")"
count="$(printf '%s' "${dashboards_json}" | jq 'length')"

if [[ "${count}" -eq 0 ]]; then
  echo "no managed dashboards found for folder=${folder_ref}"
  exit 0
fi

printf '%s' "${dashboards_json}" | jq -r '.[].uid' | while read -r uid; do
  "${SCRIPT_DIR}/export-dashboard.sh" "${uid}"
done

echo "exported ${count} dashboard(s) for folder=${folder_ref}"
