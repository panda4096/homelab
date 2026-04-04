#!/usr/bin/env python3
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

NAMESPACE = os.environ.get("NAMESPACE", "monitoring")
API_SERVER = f"https://{os.environ['KUBERNETES_SERVICE_HOST']}:{os.environ['KUBERNETES_SERVICE_PORT']}"
TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token"
CA_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
MANAGED_BY = "network-probe-reconciler"
BLACKBOX_LABEL = "app.kubernetes.io/name=network-blackbox-exporter"
EDGE_PUBLIC_PORTS = [
    ("socks5", 11080),
    ("http_connect", 11081),
    ("shadowsocks", 18388),
    ("subscription_http", 11800),
]
EDGE_RELAY_PORTS = [
    ("socks5", 11080),
    ("http_connect", 11081),
    ("shadowsocks", 18388),
]

with open(TOKEN_PATH, "r", encoding="utf-8") as handle:
    TOKEN = handle.read().strip()

SSL_CONTEXT = ssl.create_default_context(cafile=CA_PATH)


def kube_request(method, path, body=None):
    url = f"{API_SERVER}{path}"
    data = None
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/json",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, context=SSL_CONTEXT, timeout=15) as response:
            payload = response.read()
            if not payload:
                return None
            return json.loads(payload.decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"{method} {path} failed: {error.code} {detail}") from error


def sanitize_name(value):
    value = value.lower()
    value = re.sub(r"[^a-z0-9-]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value[:63].rstrip("-")


def node_public_ip(metadata, status):
    annotations = metadata.get("annotations", {})
    explicit = annotations.get("homelab.panda/public-ip", "").strip()
    if explicit:
        return explicit

    k3s_external = annotations.get("k3s.io/external-ip", "").strip()
    if k3s_external:
        return k3s_external.split(",")[0].strip()

    for address in status.get("addresses", []):
        if address.get("type") == "ExternalIP" and address.get("address"):
            return address["address"]

    return ""


def service_cluster_ip(name):
    service = kube_request("GET", f"/api/v1/namespaces/{NAMESPACE}/services/{name}")
    if not service:
        return ""
    return service.get("spec", {}).get("clusterIP", "")


def kilo_wireguard_ip(metadata):
    annotations = metadata.get("annotations", {})
    raw = annotations.get("kilo.squat.ai/wireguard-ip", "").strip()
    if not raw:
        return ""
    return raw.split("/", 1)[0].strip()


def list_ready_nodes():
    response = kube_request("GET", "/api/v1/nodes")
    nodes = []
    for item in response.get("items", []):
        metadata = item.get("metadata", {})
        labels = metadata.get("labels", {})
        annotations = metadata.get("annotations", {})
        status = item.get("status", {})
        name = metadata["name"]
        if labels.get("kubernetes.io/os") not in (None, "linux"):
            continue
        if labels.get("homelab.panda/network-monitor") == "disabled":
            continue
        conditions = {
            condition.get("type"): condition.get("status")
            for condition in item.get("status", {}).get("conditions", [])
        }
        if conditions.get("Ready") != "True":
            continue
        nodes.append(
            {
                "name": name,
                "region": labels.get("region", "unknown"),
                "public_endpoint": annotations.get("homelab.panda/public-endpoint", ""),
                "public_ip": node_public_ip(metadata, status),
                "apiserver_endpoint": annotations.get("homelab.panda/apiserver-endpoint", "false").lower() == "true",
                "edge_role": labels.get("edge.role", ""),
                "wireguard_ip": kilo_wireguard_ip(metadata),
            }
        )
    return nodes


def list_pods_by_node(label_selector):
    query = urllib.parse.urlencode({"labelSelector": label_selector})
    response = kube_request("GET", f"/api/v1/namespaces/{NAMESPACE}/pods?{query}")
    mapping = {}
    for item in response.get("items", []):
        phase = item.get("status", {}).get("phase")
        pod_ip = item.get("status", {}).get("podIP")
        node_name = item.get("spec", {}).get("nodeName")
        if phase != "Running" or not pod_ip or not node_name:
            continue
        mapping[node_name] = pod_ip
    return mapping


def vmprobe_obj(name, module, prober_url, target, labels):
    resource = {
        "apiVersion": "operator.victoriametrics.com/v1beta1",
        "kind": "VMProbe",
        "metadata": {
            "name": name,
            "namespace": NAMESPACE,
            "labels": {
                "app.kubernetes.io/part-of": "network-monitoring",
                "app.kubernetes.io/managed-by": MANAGED_BY,
                "homelab.panda/phase": "phase1",
            },
        },
        "spec": {
            "jobName": name,
            "interval": "30s",
            "module": module,
            "path": "/probe",
            "scheme": "http",
            "vmProberSpec": {
                "url": prober_url,
                "scheme": "http",
                "path": "/probe",
            },
            "targets": {
                "staticConfig": {
                    "targets": [target],
                    "labels": labels,
                }
            },
        },
    }
    return resource


def desired_vmprobes(nodes, blackbox_pods):
    desired = {}
    clusterip = service_cluster_ip("network-blackbox-exporter")
    clusterip_target = f"http://{clusterip}:9115/-/healthy" if clusterip else f"http://network-blackbox-exporter.{NAMESPACE}.svc.cluster.local:9115/-/healthy"

    for source in nodes:
        source_name = source["name"]
        source_region = source["region"]
        source_blackbox_ip = blackbox_pods.get(source_name)
        if not source_blackbox_ip:
            continue
        prober_url = f"http://{source_blackbox_ip}:9115"

        clusterip_name = sanitize_name(f"netprobe-clusterip-{source_name}")
        clusterip_labels = {
            "source_node": source_name,
            "target_node": "clusterip",
            "source_region": source_region,
            "target_region": "shared",
            "probe_scope": "internal",
            "module": "http_2xx",
            "target_endpoint": clusterip_target,
        }
        desired[clusterip_name] = vmprobe_obj(clusterip_name, "http_2xx", prober_url, clusterip_target, clusterip_labels)

        for target in nodes:
            target_name = target["name"]
            target_region = target["region"]
            target_pod_ip = blackbox_pods.get(target_name)
            if target_pod_ip:
                target_url = f"http://{target_pod_ip}:9115/-/healthy"
                name = sanitize_name(f"netprobe-internal-{source_name}-{target_name}")
                labels = {
                    "source_node": source_name,
                    "target_node": target_name,
                    "source_region": source_region,
                    "target_region": target_region,
                    "probe_scope": "internal",
                    "module": "http_2xx",
                    "target_endpoint": target_url,
                }
                desired[name] = vmprobe_obj(name, "http_2xx", prober_url, target_url, labels)

            public_http_target = ""
            public_https_target = ""
            icmp_target = ""
            apiserver_target = ""

            if target["public_ip"]:
                public_http_target = f"http://{target['public_ip']}"
                public_https_target = f"https://{target['public_ip']}"
                icmp_target = target["public_ip"]
                apiserver_target = f"https://{target['public_ip']}:6443/livez"
            elif target["public_endpoint"]:
                public_http_target = f"http://{target['public_endpoint']}"
                public_https_target = f"https://{target['public_endpoint']}"
                icmp_target = target["public_endpoint"]
                apiserver_target = f"https://{target['public_endpoint']}:6443/livez"

            if public_http_target and public_https_target:
                for module, prefix in (("http_ingress_entry", "http"), ("https_ingress_entry", "https")):
                    target_url = public_http_target if prefix == "http" else public_https_target
                    name = sanitize_name(f"netprobe-public-{prefix}-{source_name}-{target_name}")
                    labels = {
                        "source_node": source_name,
                        "target_node": target_name,
                        "source_region": source_region,
                        "target_region": target_region,
                        "probe_scope": "public",
                        "module": module,
                        "target_endpoint": target_url,
                    }
                    desired[name] = vmprobe_obj(name, module, prober_url, target_url, labels)

                name = sanitize_name(f"netprobe-icmp-{source_name}-{target_name}")
                labels = {
                    "source_node": source_name,
                    "target_node": target_name,
                    "source_region": source_region,
                    "target_region": target_region,
                    "probe_scope": "icmp",
                    "module": "icmp_ipv4",
                    "target_endpoint": icmp_target,
                }
                desired[name] = vmprobe_obj(name, "icmp_ipv4", prober_url, icmp_target, labels)

            if apiserver_target and target["apiserver_endpoint"]:
                target_url = apiserver_target
                name = sanitize_name(f"netprobe-apiserver-{source_name}-{target_name}")
                labels = {
                    "source_node": source_name,
                    "target_node": target_name,
                    "source_region": source_region,
                    "target_region": target_region,
                    "probe_scope": "apiserver",
                    "module": "https_apiserver_livez",
                    "target_endpoint": target_url,
                }
                desired[name] = vmprobe_obj(name, "https_apiserver_livez", prober_url, target_url, labels)

            ingress_target = target["public_ip"] or target["public_endpoint"]
            if target["edge_role"] == "ingress" and ingress_target:
                for edge_protocol, port in EDGE_PUBLIC_PORTS:
                    target_address = f"{ingress_target}:{port}"
                    name = sanitize_name(f"netprobe-edge-public-{edge_protocol}-{source_name}-{target_name}")
                    labels = {
                        "source_node": source_name,
                        "target_node": target_name,
                        "source_region": source_region,
                        "target_region": target_region,
                        "probe_scope": "edge_public_tcp",
                        "module": "tcp_connect",
                        "edge_protocol": edge_protocol,
                        "target_endpoint": target_address,
                    }
                    desired[name] = vmprobe_obj(name, "tcp_connect", prober_url, target_address, labels)

            if source["edge_role"] == "ingress" and target["edge_role"] == "egress" and target["wireguard_ip"]:
                for edge_protocol, port in EDGE_RELAY_PORTS:
                    target_address = f"{target['wireguard_ip']}:{port}"
                    name = sanitize_name(f"netprobe-edge-relay-{edge_protocol}-{source_name}-{target_name}")
                    labels = {
                        "source_node": source_name,
                        "target_node": target_name,
                        "source_region": source_region,
                        "target_region": target_region,
                        "probe_scope": "edge_relay_tcp",
                        "module": "tcp_connect",
                        "edge_protocol": edge_protocol,
                        "target_endpoint": target_address,
                    }
                    desired[name] = vmprobe_obj(name, "tcp_connect", prober_url, target_address, labels)

    return desired


def list_existing_vmprobes():
    query = urllib.parse.urlencode({"labelSelector": f"app.kubernetes.io/managed-by={MANAGED_BY}"})
    response = kube_request(
        "GET",
        f"/apis/operator.victoriametrics.com/v1beta1/namespaces/{NAMESPACE}/vmprobes?{query}",
    )
    return {item["metadata"]["name"]: item for item in response.get("items", [])}


def upsert_vmprobe(name, resource):
    existing = kube_request("GET", f"/apis/operator.victoriametrics.com/v1beta1/namespaces/{NAMESPACE}/vmprobes/{name}")
    if existing is None:
        kube_request("POST", f"/apis/operator.victoriametrics.com/v1beta1/namespaces/{NAMESPACE}/vmprobes", resource)
        print(f"created {name}", flush=True)
        return

    resource["metadata"]["resourceVersion"] = existing["metadata"]["resourceVersion"]
    kube_request(
        "PUT",
        f"/apis/operator.victoriametrics.com/v1beta1/namespaces/{NAMESPACE}/vmprobes/{name}",
        resource,
    )
    print(f"updated {name}", flush=True)


def delete_vmprobe(name):
    kube_request("DELETE", f"/apis/operator.victoriametrics.com/v1beta1/namespaces/{NAMESPACE}/vmprobes/{name}")
    print(f"deleted {name}", flush=True)


def main():
    nodes = list_ready_nodes()
    blackbox_pods = list_pods_by_node(BLACKBOX_LABEL)
    desired = desired_vmprobes(nodes, blackbox_pods)
    existing = list_existing_vmprobes()

    for name, resource in desired.items():
        upsert_vmprobe(name, resource)

    stale = sorted(set(existing) - set(desired))
    for name in stale:
        delete_vmprobe(name)

    print(
        json.dumps(
            {
                "nodes": [node["name"] for node in nodes],
                "desired_vmprobes": len(desired),
                "stale_vmprobes": stale,
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
