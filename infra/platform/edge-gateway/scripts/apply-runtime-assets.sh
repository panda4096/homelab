#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <values.yaml>" >&2
  exit 1
fi

values_file="$1"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

ruby infra/platform/edge-gateway/scripts/render-runtime-assets.rb "$values_file" "$workdir"
ruby infra/platform/edge-gateway/scripts/render-local-access-doc.rb \
  "$values_file" \
  "infra/platform/edge-gateway/SUBSCRIPTIONS.local.md"

export KUBECONFIG="${KUBECONFIG:-$(pwd)/infra/.secrets/homelab-k3s.yaml}"

kubectl create namespace edge-system --dry-run=client -o yaml | kubectl apply -f -
kubectl -n edge-system delete secret edge-egress-config --ignore-not-found
kubectl -n edge-system create secret generic edge-egress-config --from-file=config.json="$workdir/config.json"

kubectl -n edge-system delete configmap edge-subscription-files --ignore-not-found
kubectl -n edge-system create configmap edge-subscription-files \
  --from-file="$workdir"

kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
kubectl -n monitoring delete secret edge-gateway-probe-config --ignore-not-found
kubectl -n monitoring create secret generic edge-gateway-probe-config \
  --from-file=probe-config.json="$workdir/probe-config.json"
