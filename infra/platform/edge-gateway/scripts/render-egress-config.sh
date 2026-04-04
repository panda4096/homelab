#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <output-path>" >&2
  exit 1
fi

: "${EDGE_SOCKS_USER:?missing EDGE_SOCKS_USER}"
: "${EDGE_SOCKS_PASS:?missing EDGE_SOCKS_PASS}"
: "${EDGE_HTTP_USER:?missing EDGE_HTTP_USER}"
: "${EDGE_HTTP_PASS:?missing EDGE_HTTP_PASS}"
: "${EDGE_SS_METHOD:=chacha20-ietf-poly1305}"
: "${EDGE_SS_PASSWORD:?missing EDGE_SS_PASSWORD}"

cat >"$1" <<EOF
{
  "log": {
    "level": "info",
    "timestamp": true
  },
  "inbounds": [
    {
      "type": "socks",
      "tag": "socks-in",
      "listen": "10.4.0.2",
      "listen_port": 11080,
      "users": [
        {
          "username": "${EDGE_SOCKS_USER}",
          "password": "${EDGE_SOCKS_PASS}"
        }
      ]
    },
    {
      "type": "http",
      "tag": "http-in",
      "listen": "10.4.0.2",
      "listen_port": 11081,
      "users": [
        {
          "username": "${EDGE_HTTP_USER}",
          "password": "${EDGE_HTTP_PASS}"
        }
      ]
    },
    {
      "type": "shadowsocks",
      "tag": "ss-in",
      "listen": "10.4.0.2",
      "listen_port": 18388,
      "method": "${EDGE_SS_METHOD}",
      "password": "${EDGE_SS_PASSWORD}"
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct"
    }
  ],
  "route": {
    "final": "direct"
  }
}
EOF
