# Local secrets (not committed)

This directory is for **local-only** sensitive files (kubeconfig, node-token copies, etc).

- Kubeconfig path (recommended): `infra/.secrets/homelab-k3s.yaml`
- Grafana admin credentials (local only): `infra/.secrets/grafana-admin.env`
- Grafana API credentials (local only): `infra/.secrets/grafana-api.env`
- Network dashboard sync still uses the same Grafana API credentials
- Refresh kubeconfig: `bash infra/k3s/scripts/fetch-kubeconfig.sh`

Usage:

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
kubectl get nodes -o wide
```
