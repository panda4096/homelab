#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAFANA_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd -- "${GRAFANA_DIR}/../../../.." && pwd)"
INDEX_FILE="${GRAFANA_DIR}/_meta/index.yaml"
SECRETS_DIR="${REPO_ROOT}/infra/.secrets"
GRAFANA_API_ENV="${SECRETS_DIR}/grafana-api.env"
GRAFANA_ADMIN_ENV="${SECRETS_DIR}/grafana-admin.env"

load_grafana_env() {
  if [[ -f "${GRAFANA_API_ENV}" ]]; then
    # shellcheck disable=SC1090
    source "${GRAFANA_API_ENV}"
  fi

  if [[ -f "${GRAFANA_ADMIN_ENV}" ]]; then
    # shellcheck disable=SC1090
    source "${GRAFANA_ADMIN_ENV}"
  fi

  : "${GRAFANA_URL:=http://127.0.0.1:3000}"
  : "${GRAFANA_AUTH_MODE:=basic}"

  if [[ -z "${GRAFANA_USER:-}" && -n "${GRAFANA_ADMIN_USER:-}" ]]; then
    GRAFANA_USER="${GRAFANA_ADMIN_USER}"
  fi

  if [[ -z "${GRAFANA_PASSWORD:-}" && -n "${GRAFANA_ADMIN_PASSWORD:-}" ]]; then
    GRAFANA_PASSWORD="${GRAFANA_ADMIN_PASSWORD}"
  fi

  case "${GRAFANA_AUTH_MODE}" in
    basic)
      : "${GRAFANA_USER:?GRAFANA_USER is required in infra/.secrets/grafana-api.env}"
      : "${GRAFANA_PASSWORD:?GRAFANA_PASSWORD is required in infra/.secrets/grafana-api.env}"
      ;;
    token)
      : "${GRAFANA_TOKEN:?GRAFANA_TOKEN is required in infra/.secrets/grafana-api.env}"
      ;;
    *)
      echo "unsupported GRAFANA_AUTH_MODE=${GRAFANA_AUTH_MODE}" >&2
      exit 1
      ;;
  esac
}

grafana_api() {
  local method="$1"
  local path="$2"
  local body_file="${3:-}"

  load_grafana_env

  local -a args=(-fsS -X "${method}")
  case "${GRAFANA_AUTH_MODE}" in
    basic) args+=(-u "${GRAFANA_USER}:${GRAFANA_PASSWORD}") ;;
    token) args+=(-H "Authorization: Bearer ${GRAFANA_TOKEN}") ;;
  esac

  if [[ -n "${body_file}" ]]; then
    args+=(-H "Content-Type: application/json" --data "@${body_file}")
  fi

  curl "${args[@]}" "${GRAFANA_URL%/}${path}"
}

folder_entry_json() {
  local ref="$1"
  ruby -ryaml -rjson -e '
    index = YAML.load_file(ARGV[0])
    ref = ARGV[1]
    entry = Array(index["folders"]).find do |folder|
      [folder["key"], folder["uid"], folder["title"]].compact.include?(ref)
    end
    abort("unknown folder: #{ref}") unless entry
    puts JSON.generate(entry)
  ' "${INDEX_FILE}" "${ref}"
}

dashboard_entry_json() {
  local ref="$1"
  ruby -ryaml -rjson -e '
    index = YAML.load_file(ARGV[0])
    ref = ARGV[1]
    entry = Array(index["dashboards"]).find do |dashboard|
      [dashboard["key"], dashboard["uid"], dashboard["title"]].compact.include?(ref)
    end
    abort("unknown dashboard: #{ref}") unless entry
    puts JSON.generate(entry)
  ' "${INDEX_FILE}" "${ref}"
}

dashboards_for_folder_json() {
  local folder_ref="$1"
  ruby -ryaml -rjson -e '
    index = YAML.load_file(ARGV[0])
    ref = ARGV[1]
    folder = Array(index["folders"]).find do |entry|
      [entry["key"], entry["uid"], entry["title"]].compact.include?(ref)
    end
    abort("unknown folder: #{ref}") unless folder
    dashboards = Array(index["dashboards"]).select { |entry| entry["folder"] == folder["key"] }
    puts JSON.generate(dashboards)
  ' "${INDEX_FILE}" "${folder_ref}"
}

update_index_dashboard_metadata() {
  local uid="$1"
  local title="$2"
  local tags_json="$3"

  ruby -ryaml -rjson -e '
    index_path = ARGV[0]
    uid = ARGV[1]
    title = ARGV[2]
    tags = JSON.parse(ARGV[3])
    index = YAML.load_file(index_path)
    dashboard = Array(index["dashboards"]).find { |entry| entry["uid"] == uid }
    abort("dashboard uid not found in index: #{uid}") unless dashboard
    dashboard["title"] = title
    dashboard["tags"] = tags
    File.write(index_path, index.to_yaml(line_width: -1))
  ' "${INDEX_FILE}" "${uid}" "${title}" "${tags_json}"
}

ensure_folder_exists() {
  local folder_ref="$1"
  local folder_json
  folder_json="$(folder_entry_json "${folder_ref}")"
  local uid title payload
  uid="$(printf '%s' "${folder_json}" | jq -r '.uid')"
  title="$(printf '%s' "${folder_json}" | jq -r '.title')"

  if grafana_api GET "/api/folders/${uid}" >/dev/null 2>&1; then
    return 0
  fi

  payload="$(mktemp)"
  jq -n --arg uid "${uid}" --arg title "${title}" '{uid: $uid, title: $title}' > "${payload}"
  grafana_api POST "/api/folders" "${payload}" >/dev/null
  rm -f "${payload}"
}

dashboard_path_from_entry() {
  local entry_json="$1"
  printf '%s/%s\n' "${REPO_ROOT}" "$(printf '%s' "${entry_json}" | jq -r '.path')"
}
