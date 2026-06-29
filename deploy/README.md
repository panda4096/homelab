# Deploy

This directory contains Helm release orchestration owned by this repo.

Rules:

- Prefer Helm charts here for resources that are part of a release boundary.
- Do not add one-off apply scripts for release resources.
- Keep component implementation assets under `infra/`; keep release packaging and deployable Helm charts here.

## Releases

- `traefik-public-gateway`: public Gateway API entrypoint, HTTP redirect, and TLS Secret for the cloud k3s Traefik ingress.
