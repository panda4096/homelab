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
folder_key="$(printf '%s' "${entry_json}" | jq -r '.folder')"
uid="$(printf '%s' "${entry_json}" | jq -r '.uid')"
path="$(dashboard_path_from_entry "${entry_json}")"
tags_json="$(printf '%s' "${entry_json}" | jq -c '.tags // []')"

if [[ ! -f "${path}" ]]; then
  echo "dashboard file not found: ${path}" >&2
  exit 1
fi

ensure_folder_exists "${folder_key}"
folder_json="$(folder_entry_json "${folder_key}")"
folder_uid="$(printf '%s' "${folder_json}" | jq -r '.uid')"

payload="$(mktemp)"
jq -n \
  --arg folderUid "${folder_uid}" \
  --arg uid "${uid}" \
  --argjson tags "${tags_json}" \
  --slurpfile dashboard "${path}" '
    {
      dashboard: ($dashboard[0] | .uid = $uid | .tags = (((.tags // []) + $tags) | unique)),
      folderUid: $folderUid,
      overwrite: true
    }
  ' > "${payload}"

grafana_api POST "/api/dashboards/db" "${payload}" >/dev/null
rm -f "${payload}"
echo "applied ${uid} -> folder=${folder_uid}"
