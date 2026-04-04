#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <output-binary>" >&2
  exit 1
fi

out="$1"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

GIT_TERMINAL_PROMPT=0 git clone --depth 1 --branch v3.2.6 https://github.com/go-gost/gost.git "$workdir/gost"
(
  cd "$workdir/gost/cmd/gost"
  GOSUMDB=sum.golang.org \
  GOPROXY=https://proxy.golang.org,direct \
  CGO_ENABLED=0 \
  GOOS=linux \
  GOARCH=amd64 \
  go build -o "$out"
)

chmod +x "$out"
