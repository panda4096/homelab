# Secrets And Bootstrap Assets

`infra/.secrets` is the local directory for cluster credentials, bootstrap materials, and private runtime inputs.

The current repository practice is:

- This directory is part of the project structure and is used as the canonical local path in docs and scripts.
- Some files here are already tracked in git because they are operational inputs for this private homelab repository.
- Some files are locally generated bootstrap artifacts and should be treated more carefully before deciding whether to commit them.
- Do not treat this directory as public-safe content.

## Common Files

- Kubeconfig: `infra/.secrets/homelab-k3s.yaml`
- Grafana admin credentials: `infra/.secrets/grafana-admin.env`
- Grafana API credentials: `infra/.secrets/grafana-api.env`
- Edge gateway runtime values: `infra/.secrets/edge-gateway-values.yaml`

## Authelia And Traefik

These files were introduced with the current `Traefik + Gateway API + Authelia` chain:

- Authelia local bootstrap record: `infra/.secrets/authelia-bootstrap.env`
  - Local operator reference only.
  - Stores generated bootstrap values and local reminders such as the initial password and SMTP password.
- Authelia local user database source: `infra/.secrets/authelia-users-database.yml`
  - Source of truth for the file auth backend before syncing into the `authelia-users` Secret.
  - User add/change operations should update this file first, then update the Kubernetes Secret.
- Traefik HTTPS certificate and key:
  - `infra/.secrets/traefik-public-ip.crt`
  - `infra/.secrets/traefik-public-ip.key`
  - These are manually prepared TLS assets for the current IP-based HTTPS entrypoint.
  - They are not publicly trusted CA-issued certificates.

## Password And 2FA Data Boundaries

Current `Authelia` storage is split:

- User identity data:
  - username
  - password hash
  - email
  - groups
  - Source: `infra/.secrets/authelia-users-database.yml`
- Runtime state:
  - sessions
  - TOTP / WebAuthn registration state
  - Stored in Authelia local SQLite persistence

This means:

- Restarting the pod does not reset the password from `authelia-bootstrap.env`.
- Password changes should be managed through the file backend source and synced to the cluster Secret.
- WebAuthn/TOTP state is separate from the file user database.

## Operational Notes

- Refresh kubeconfig:
  - `bash infra/k3s/scripts/fetch-kubeconfig.sh`
- Recommended shell setup:

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
kubectl get nodes -o wide
```

## Current Caveat

WebAuthn is not reliable on the current IP-based entrypoint:

- Current auth URL uses `https://106.55.163.135/...`
- Browser WebAuthn requires a valid relying-party domain and rejects this IP origin
- Use TOTP for now
- Revisit WebAuthn after DNS and a proper domain are in place
