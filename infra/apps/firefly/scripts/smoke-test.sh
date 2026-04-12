#!/usr/bin/env bash
set -euo pipefail

curl -kI https://106.55.163.135/firefly/
kubectl -n firefly get deploy,pod,svc,httproute,networkpolicy
