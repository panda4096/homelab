# Local secrets (not committed)

This directory is for **local-only** sensitive files (kubeconfig, node-token copies, etc).

- Kubeconfig path (recommended): `infra/.secrets/homelab-k3s.yaml`
- Refresh kubeconfig: `bash infra/k3s/scripts/fetch-kubeconfig.sh`

Usage:

```bash
export KUBECONFIG="$(pwd)/infra/.secrets/homelab-k3s.yaml"
kubectl get nodes -o wide
```

