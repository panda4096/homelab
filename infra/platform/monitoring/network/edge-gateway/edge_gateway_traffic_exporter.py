#!/usr/bin/env python3
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CONFIG_PATH = os.environ.get("EDGE_GATEWAY_PROBE_CONFIG", "/etc/edge-gateway/probe-config.json")
LISTEN_HOST = os.environ.get("LISTEN_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("LISTEN_PORT", "9809"))
SCRAPE_INTERVAL = int(os.environ.get("SCRAPE_INTERVAL_SECONDS", "30"))

TCP_STATE_NAMES = {
    "01": "ESTABLISHED",
    "02": "SYN_SENT",
    "03": "SYN_RECV",
    "04": "FIN_WAIT1",
    "05": "FIN_WAIT2",
    "06": "TIME_WAIT",
    "07": "CLOSE",
    "08": "CLOSE_WAIT",
    "09": "LAST_ACK",
    "0A": "LISTEN",
    "0B": "CLOSING",
}

METRICS_LOCK = threading.Lock()
METRICS_STATE = {
    "interfaces": {},
    "tcp_connections": {},
    "tcp_active": {},
    "udp_sockets": {},
}
PROCESS_START = time.time()


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


def metric_escape(value):
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


def parse_proc_net_dev():
    stats = {}
    with open("/proc/net/dev", "r", encoding="utf-8") as handle:
        for line in handle.readlines()[2:]:
            iface, values = line.split(":", 1)
            fields = values.split()
            if len(fields) < 16:
                continue
            stats[iface.strip()] = {
                "receive_bytes": int(fields[0]),
                "receive_packets": int(fields[1]),
                "receive_errors": int(fields[2]),
                "receive_drops": int(fields[3]),
                "transmit_bytes": int(fields[8]),
                "transmit_packets": int(fields[9]),
                "transmit_errors": int(fields[10]),
                "transmit_drops": int(fields[11]),
            }
    return stats


def detect_public_interface():
    with open("/proc/net/route", "r", encoding="utf-8") as handle:
        for line in handle.readlines()[1:]:
            fields = line.split()
            if len(fields) < 4:
                continue
            iface, destination, _gateway, flags = fields[:4]
            if destination != "00000000":
                continue
            if int(flags, 16) & 0x2:
                return iface
    return ""


def detect_kilo_interface(dev_stats):
    if "kilo0" in dev_stats:
        return "kilo0"
    for iface in sorted(dev_stats):
        if iface.startswith("kilo"):
            return iface
    return ""


def parse_socket_table(path, tracked_ports):
    counts = {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            lines = handle.readlines()[1:]
    except FileNotFoundError:
        return counts

    for line in lines:
        fields = line.split()
        if len(fields) < 4:
            continue
        local_address = fields[1]
        state_hex = fields[3].upper()
        local_port = int(local_address.split(":")[1], 16)
        if local_port not in tracked_ports:
            continue
        counts[(local_port, TCP_STATE_NAMES.get(state_hex, state_hex))] = counts.get((local_port, TCP_STATE_NAMES.get(state_hex, state_hex)), 0) + 1
    return counts


def parse_udp_table(path, tracked_ports):
    counts = {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            lines = handle.readlines()[1:]
    except FileNotFoundError:
        return counts

    for line in lines:
        fields = line.split()
        if len(fields) < 2:
            continue
        local_address = fields[1]
        local_port = int(local_address.split(":")[1], 16)
        if local_port not in tracked_ports:
            continue
        counts[local_port] = counts.get(local_port, 0) + 1
    return counts


def collection_loop():
    while True:
        cfg = load_config()
        protocol_ports = {
            "http_connect": int(cfg.get("http", {}).get("port", 11081)),
            "socks5": int(cfg.get("socks", {}).get("port", 11080)),
            "shadowsocks": int(cfg.get("relay", {}).get("protocols", {}).get("shadowsocks", {}).get("port", 18388)),
        }
        tracked_ports = set(protocol_ports.values())

        dev_stats = parse_proc_net_dev()
        public_iface = detect_public_interface()
        kilo_iface = detect_kilo_interface(dev_stats)
        interfaces = {}
        for role, iface in (("public", public_iface), ("kilo", kilo_iface)):
            if iface and iface in dev_stats:
                interfaces[role] = {"device": iface, **dev_stats[iface]}

        tcp_counts = {}
        for path in ("/proc/net/tcp", "/proc/net/tcp6"):
            for key, value in parse_socket_table(path, tracked_ports).items():
                tcp_counts[key] = tcp_counts.get(key, 0) + value

        udp_counts = {}
        for path in ("/proc/net/udp", "/proc/net/udp6"):
            for key, value in parse_udp_table(path, tracked_ports).items():
                udp_counts[key] = udp_counts.get(key, 0) + value

        tcp_active = {}
        for protocol_name, port in protocol_ports.items():
            active = 0
            for (observed_port, state), count in tcp_counts.items():
                if observed_port != port or state in ("LISTEN", "CLOSE"):
                    continue
                active += count
            tcp_active[port] = active

        with METRICS_LOCK:
            METRICS_STATE["interfaces"] = interfaces
            METRICS_STATE["protocol_ports"] = protocol_ports
            METRICS_STATE["tcp_connections"] = tcp_counts
            METRICS_STATE["tcp_active"] = tcp_active
            METRICS_STATE["udp_sockets"] = udp_counts
            METRICS_STATE["public_interface"] = public_iface
            METRICS_STATE["kilo_interface"] = kilo_iface

        time.sleep(SCRAPE_INTERVAL)


def render_metrics():
    lines = [
        "# HELP edge_gateway_traffic_info Static information about the edge gateway traffic exporter.",
        "# TYPE edge_gateway_traffic_info gauge",
        "# HELP edge_gateway_traffic_exporter_uptime_seconds Exporter uptime in seconds.",
        "# TYPE edge_gateway_traffic_exporter_uptime_seconds counter",
        "# HELP edge_gateway_interface_bytes_total Host interface byte counters relevant to the edge gateway path.",
        "# TYPE edge_gateway_interface_bytes_total counter",
        "# HELP edge_gateway_interface_packets_total Host interface packet counters relevant to the edge gateway path.",
        "# TYPE edge_gateway_interface_packets_total counter",
        "# HELP edge_gateway_interface_errors_total Host interface error counters relevant to the edge gateway path.",
        "# TYPE edge_gateway_interface_errors_total counter",
        "# HELP edge_gateway_interface_drops_total Host interface drop counters relevant to the edge gateway path.",
        "# TYPE edge_gateway_interface_drops_total counter",
        "# HELP edge_gateway_proxy_tcp_connections Edge gateway TCP connections by proxy port and TCP state.",
        "# TYPE edge_gateway_proxy_tcp_connections gauge",
        "# HELP edge_gateway_proxy_active_connections Edge gateway non-LISTEN TCP connections by proxy port.",
        "# TYPE edge_gateway_proxy_active_connections gauge",
        "# HELP edge_gateway_proxy_udp_sockets Edge gateway UDP sockets by proxy port.",
        "# TYPE edge_gateway_proxy_udp_sockets gauge",
    ]

    with METRICS_LOCK:
        lines.append(
            'edge_gateway_traffic_info{public_interface="%s",kilo_interface="%s"} 1'
            % (
                metric_escape(METRICS_STATE.get("public_interface", "")),
                metric_escape(METRICS_STATE.get("kilo_interface", "")),
            )
        )
        lines.append(f"edge_gateway_traffic_exporter_uptime_seconds {time.time() - PROCESS_START:.6f}")

        protocol_ports = METRICS_STATE.get("protocol_ports", {})

        for interface_role in sorted(METRICS_STATE.get("interfaces", {})):
            entry = METRICS_STATE["interfaces"][interface_role]
            common = (
                f'interface_role="{metric_escape(interface_role)}",'
                f'device="{metric_escape(entry["device"])}"'
            )
            lines.append(
                f'edge_gateway_interface_bytes_total{{{common},direction="receive"}} {entry["receive_bytes"]}'
            )
            lines.append(
                f'edge_gateway_interface_bytes_total{{{common},direction="transmit"}} {entry["transmit_bytes"]}'
            )
            lines.append(
                f'edge_gateway_interface_packets_total{{{common},direction="receive"}} {entry["receive_packets"]}'
            )
            lines.append(
                f'edge_gateway_interface_packets_total{{{common},direction="transmit"}} {entry["transmit_packets"]}'
            )
            lines.append(
                f'edge_gateway_interface_errors_total{{{common},direction="receive"}} {entry["receive_errors"]}'
            )
            lines.append(
                f'edge_gateway_interface_errors_total{{{common},direction="transmit"}} {entry["transmit_errors"]}'
            )
            lines.append(
                f'edge_gateway_interface_drops_total{{{common},direction="receive"}} {entry["receive_drops"]}'
            )
            lines.append(
                f'edge_gateway_interface_drops_total{{{common},direction="transmit"}} {entry["transmit_drops"]}'
            )

        port_protocols = {port: name for name, port in protocol_ports.items()}
        for (port, state), count in sorted(METRICS_STATE.get("tcp_connections", {}).items()):
            protocol_name = port_protocols.get(port, f"port-{port}")
            labels = (
                f'protocol_name="{metric_escape(protocol_name)}",'
                f'proxy_port="{port}",'
                f'state="{metric_escape(state)}"'
            )
            lines.append(f"edge_gateway_proxy_tcp_connections{{{labels}}} {count}")

        for port, count in sorted(METRICS_STATE.get("tcp_active", {}).items()):
            protocol_name = port_protocols.get(port, f"port-{port}")
            labels = (
                f'protocol_name="{metric_escape(protocol_name)}",'
                f'proxy_port="{port}"'
            )
            lines.append(f"edge_gateway_proxy_active_connections{{{labels}}} {count}")

        for port, count in sorted(METRICS_STATE.get("udp_sockets", {}).items()):
            protocol_name = port_protocols.get(port, f"port-{port}")
            labels = (
                f'protocol_name="{metric_escape(protocol_name)}",'
                f'proxy_port="{port}"'
            )
            lines.append(f"edge_gateway_proxy_udp_sockets{{{labels}}} {count}")

    return "\n".join(lines) + "\n"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == "/-/healthy":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok\n")
            return
        if self.path != "/metrics":
            self.send_response(404)
            self.end_headers()
            return

        payload = render_metrics().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):  # noqa: A003
        return


def main():
    collector = threading.Thread(target=collection_loop, daemon=True)
    collector.start()
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
