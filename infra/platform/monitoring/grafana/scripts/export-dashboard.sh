#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

ref="${1:-}"
if [[ -z "${ref}" ]]; then
  echo "usage: $0 <dashboard-key|dashboard-uid|dashboard-title>" >&2
  exit 1
fi

entry_json="$(dashboard_entry_json "${ref}")"
uid="$(printf '%s' "${entry_json}" | jq -r '.uid')"
path="$(dashboard_path_from_entry "${entry_json}")"
mkdir -p "$(dirname "${path}")"

response="$(mktemp)"
grafana_api GET "/api/dashboards/uid/${uid}" > "${response}"

title="$(jq -r '.dashboard.title' "${response}")"
tags_json="$(jq -c '.dashboard.tags // []' "${response}")"

tmp_output="$(mktemp)"
jq --sort-keys '.' "${response}" \
  | jq '.dashboard | del(.id, .version)' \
  > "${tmp_output}"
mv "${tmp_output}" "${path}"

update_index_dashboard_metadata "${uid}" "${title}" "${tags_json}"

rm -f "${response}"
echo "exported ${uid} -> ${path}"
