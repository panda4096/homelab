# traefik-public-gateway

Helm release for the cloud k3s public Web entrypoint:

- `Gateway` `traefik/public-gateway`
- `HTTPRoute` `traefik/redirect-to-https`
- TLS `Secret` `traefik/public-gateway-tls`

The certificate and private key are packaged as chart files:

- `files/public-gateway.crt`
- `files/public-gateway.key`

Certificate metadata is declared in `values.yaml` and rendered onto
`traefik/public-gateway-tls` annotations for monitoring.

- CN: `codebear.fun`
- SAN: `codebear.fun`, `www.codebear.fun`
- Expires: `2026-09-27 22:59:59` (`Asia/Shanghai`)
- Expires UTC: `2026-09-27T14:59:59Z`
- Expiry annotation: `homelab.panda/certificate-not-after`

Deploy:

```bash
helm upgrade --install traefik-public-gateway deploy/traefik-public-gateway \
  -n traefik \
  --wait --timeout 5m
```

Rotate the certificate by replacing the two files above, then re-run the same Helm command.
