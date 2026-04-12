#!/usr/bin/env bash
set -euo pipefail

curl -kI https://106.55.163.135/finbrain/
kubectl -n finbrain get deploy,pod,svc,httproute,networkpolicy,cronjob
