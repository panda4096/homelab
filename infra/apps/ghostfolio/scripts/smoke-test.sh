#!/usr/bin/env bash
set -euo pipefail

curl -kI https://106.55.163.135/ghostfolio/
kubectl -n ghostfolio get deploy,pod,svc,httproute,networkpolicy
