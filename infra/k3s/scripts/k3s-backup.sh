#!/usr/bin/env bash
set -euo pipefail

# Backup k3s sqlite datastore + required token (and tls for easier disaster recovery).
#
# NOTE:
# - Run as a normal user that can sudo (do NOT run this script via "sudo ./k3s-backup.sh").
# - Do NOT store backup artifacts in this git repo.
#
# References:
# - https://docs.k3s.io/datastore/backup-restore

DATA_DIR="${K3S_DATA_DIR:-/var/lib/rancher/k3s}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/cluster-backups}"
TS="$(date +%F_%H%M%S)"
OUT="${BACKUP_ROOT}/k3s_${TS}"

OWNER_USER="$(id -un)"
OWNER_GROUP="$(id -gn)"

mkdir -p "${OUT}"

sudo systemctl stop k3s
trap 'sudo systemctl start k3s >/dev/null 2>&1 || true' EXIT

sudo cp -a "${DATA_DIR}/server/db" "${OUT}/db"
sudo cp -a "${DATA_DIR}/server/token" "${OUT}/token"
sudo cp -a "${DATA_DIR}/server/tls" "${OUT}/tls" || true

sudo chown -R "${OWNER_USER}:${OWNER_GROUP}" "${OUT}"

sudo systemctl start k3s
trap - EXIT

echo "Backup written to: ${OUT}"
