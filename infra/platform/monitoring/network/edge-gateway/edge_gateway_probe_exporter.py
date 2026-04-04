#!/usr/bin/env python3
import json
import os
import socket
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.client import HTTPResponse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CONFIG_PATH = os.environ.get("EDGE_GATEWAY_PROBE_CONFIG", "/etc/edge-gateway/probe-config.json")
LISTEN_HOST = os.environ.get("LISTEN_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("LISTEN_PORT", "9808"))
SCRAPE_INTERVAL = int(os.environ.get("SCRAPE_INTERVAL_SECONDS", "30"))
PROBE_TIMEOUT = float(os.environ.get("PROBE_TIMEOUT_SECONDS", "10"))
USER_AGENT = "edge-gateway-probe-exporter/1.0"

METRICS_LOCK = threading.Lock()
METRICS_STATE = {}
PROCESS_START = time.time()


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


def metric_escape(value):
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


def http_get_direct(url):
    ssl_context = ssl.create_default_context()
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl_context))
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with opener.open(request, timeout=PROBE_TIMEOUT) as response:
        return response.status, response.read().decode("utf-8", errors="ignore").strip()


def http_get_via_http_proxy(url, proxy_host, proxy_port, username, password):
    ssl_context = ssl.create_default_context()
    quoted_user = urllib.parse.quote(username, safe="")
    quoted_password = urllib.parse.quote(password, safe="")
    proxy_url = f"http://{quoted_user}:{quoted_password}@{proxy_host}:{proxy_port}"
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url}),
        urllib.request.HTTPSHandler(context=ssl_context),
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with opener.open(request, timeout=PROBE_TIMEOUT) as response:
        return response.status, response.read().decode("utf-8", errors="ignore").strip()


def recv_exact(sock, size):
    buffer = b""
    while len(buffer) < size:
        chunk = sock.recv(size - len(buffer))
        if not chunk:
            raise RuntimeError("unexpected EOF from SOCKS5 proxy")
        buffer += chunk
    return buffer


def http_get_via_socks5(url, proxy_host, proxy_port, username, password):
    parsed = urllib.parse.urlparse(url)
    target_host = parsed.hostname
    target_port = parsed.port or (443 if parsed.scheme == "https" else 80)
    target_path = parsed.path or "/"
    if parsed.query:
        target_path = f"{target_path}?{parsed.query}"

    with socket.create_connection((proxy_host, proxy_port), timeout=PROBE_TIMEOUT) as sock:
        sock.settimeout(PROBE_TIMEOUT)

        sock.sendall(b"\x05\x02\x00\x02")
        version, method = recv_exact(sock, 2)
        if version != 0x05:
            raise RuntimeError(f"unexpected SOCKS version: {version}")
        if method == 0x02:
            user_bytes = username.encode("utf-8")
            pass_bytes = password.encode("utf-8")
            auth_request = (
                b"\x01"
                + bytes([len(user_bytes)])
                + user_bytes
                + bytes([len(pass_bytes)])
                + pass_bytes
            )
            sock.sendall(auth_request)
            auth_version, auth_status = recv_exact(sock, 2)
            if auth_version != 0x01 or auth_status != 0x00:
                raise RuntimeError("SOCKS5 username/password authentication failed")
        elif method != 0x00:
            raise RuntimeError(f"unsupported SOCKS5 auth method: {method}")

        host_bytes = target_host.encode("idna")
        connect_request = (
            b"\x05\x01\x00\x03"
            + bytes([len(host_bytes)])
            + host_bytes
            + target_port.to_bytes(2, byteorder="big")
        )
        sock.sendall(connect_request)
        version, reply, _, atyp = recv_exact(sock, 4)
        if version != 0x05 or reply != 0x00:
            raise RuntimeError(f"SOCKS5 connect failed with reply={reply}")
        if atyp == 0x01:
            recv_exact(sock, 4)
        elif atyp == 0x03:
            domain_length = recv_exact(sock, 1)[0]
            recv_exact(sock, domain_length)
        elif atyp == 0x04:
            recv_exact(sock, 16)
        recv_exact(sock, 2)

        transport = sock
        if parsed.scheme == "https":
            ssl_context = ssl.create_default_context()
            transport = ssl_context.wrap_socket(sock, server_hostname=target_host)

        request_bytes = (
            f"GET {target_path} HTTP/1.1\r\n"
            f"Host: {target_host}\r\n"
            f"User-Agent: {USER_AGENT}\r\n"
            "Accept: */*\r\n"
            "Connection: close\r\n\r\n"
        ).encode("utf-8")
        transport.sendall(request_bytes)
        response = HTTPResponse(transport)
        response.begin()
        body = response.read().decode("utf-8", errors="ignore").strip()
        return response.status, body


def record_metric(probe_type, success, duration, status_code=0, body="", error="", expected_exit_ip=""):
    observed_at = time.time()
    exit_ip = ""
    exit_ip_match = 0
    if body and probe_type.endswith("ip_echo"):
        exit_ip = body.strip()
        if expected_exit_ip:
            exit_ip_match = int(exit_ip == expected_exit_ip)

    with METRICS_LOCK:
        entry = METRICS_STATE.setdefault(probe_type, {})
        entry.update(
            {
                "success": int(success),
                "duration": float(duration),
                "status_code": int(status_code),
                "error": error,
                "exit_ip": exit_ip,
                "exit_ip_match": exit_ip_match,
                "expected_exit_ip": expected_exit_ip,
                "timestamp": observed_at,
            }
        )
        if success:
            entry["last_success_timestamp"] = observed_at


def run_probe(probe_type, handler, expected_exit_ip=""):
    started = time.monotonic()
    try:
        status_code, body = handler()
        duration = time.monotonic() - started
        success = 200 <= status_code < 400
        record_metric(
            probe_type,
            success=success,
            duration=duration,
            status_code=status_code,
            body=body,
            error="" if success else f"http status {status_code}",
            expected_exit_ip=expected_exit_ip,
        )
    except Exception as exc:  # noqa: BLE001
        duration = time.monotonic() - started
        record_metric(
            probe_type,
            success=False,
            duration=duration,
            status_code=0,
            body="",
            error=str(exc),
            expected_exit_ip=expected_exit_ip,
        )


def collection_loop():
    while True:
        cfg = load_config()
        targets = cfg.get("targets", {})
        ip_echo_url = targets.get("ip_echo_url", "https://api.ipify.org")
        generate_204_url = targets.get("generate_204_url", "https://www.gstatic.com/generate_204")
        proxy_host = cfg.get("proxy_host", "127.0.0.1")
        expected_exit_ip = cfg.get("expected_exit_ip", "")
        http_cfg = cfg.get("http", {})
        socks_cfg = cfg.get("socks", {})

        run_probe("direct_ip_echo", lambda: http_get_direct(ip_echo_url), expected_exit_ip)
        run_probe(
            "http_connect_ip_echo",
            lambda: http_get_via_http_proxy(
                ip_echo_url,
                proxy_host,
                int(http_cfg["port"]),
                http_cfg["username"],
                http_cfg["password"],
            ),
            expected_exit_ip,
        )
        run_probe(
            "socks5_ip_echo",
            lambda: http_get_via_socks5(
                ip_echo_url,
                proxy_host,
                int(socks_cfg["port"]),
                socks_cfg["username"],
                socks_cfg["password"],
            ),
            expected_exit_ip,
        )

        run_probe("direct_generate_204", lambda: http_get_direct(generate_204_url))
        run_probe(
            "http_connect_generate_204",
            lambda: http_get_via_http_proxy(
                generate_204_url,
                proxy_host,
                int(http_cfg["port"]),
                http_cfg["username"],
                http_cfg["password"],
            ),
        )
        run_probe(
            "socks5_generate_204",
            lambda: http_get_via_socks5(
                generate_204_url,
                proxy_host,
                int(socks_cfg["port"]),
                socks_cfg["username"],
                socks_cfg["password"],
            ),
        )

        time.sleep(SCRAPE_INTERVAL)


def render_metrics():
    lines = [
        "# HELP edge_gateway_probe_success Whether the edge gateway probe succeeded.",
        "# TYPE edge_gateway_probe_success gauge",
        "# HELP edge_gateway_probe_duration_seconds Duration of the edge gateway probe.",
        "# TYPE edge_gateway_probe_duration_seconds gauge",
        "# HELP edge_gateway_probe_http_status_code HTTP status code observed by the probe.",
        "# TYPE edge_gateway_probe_http_status_code gauge",
        "# HELP edge_gateway_probe_last_success_timestamp_seconds Unix timestamp of the last successful probe.",
        "# TYPE edge_gateway_probe_last_success_timestamp_seconds gauge",
        "# HELP edge_gateway_probe_exit_ip_match Whether the observed exit IP matches the configured expected exit IP.",
        "# TYPE edge_gateway_probe_exit_ip_match gauge",
        "# HELP edge_gateway_probe_exit_ip_info Last observed exit IP for IP echo probes.",
        "# TYPE edge_gateway_probe_exit_ip_info gauge",
        "# HELP edge_gateway_probe_info Static information about the probe exporter.",
        "# TYPE edge_gateway_probe_info gauge",
        "# HELP edge_gateway_probe_exporter_uptime_seconds Exporter uptime in seconds.",
        "# TYPE edge_gateway_probe_exporter_uptime_seconds counter",
    ]

    with METRICS_LOCK:
        cfg = load_config()
        expected_exit_ip = cfg.get("expected_exit_ip", "")
        lines.append(
            'edge_gateway_probe_info{proxy_host="%s",expected_exit_ip="%s"} 1'
            % (metric_escape(cfg.get("proxy_host", "127.0.0.1")), metric_escape(expected_exit_ip))
        )
        lines.append(f"edge_gateway_probe_exporter_uptime_seconds {time.time() - PROCESS_START:.6f}")

        for probe_type in sorted(METRICS_STATE):
            entry = METRICS_STATE[probe_type]
            labels = f'probe_type="{metric_escape(probe_type)}"'
            lines.append(f"edge_gateway_probe_success{{{labels}}} {entry.get('success', 0)}")
            lines.append(f"edge_gateway_probe_duration_seconds{{{labels}}} {entry.get('duration', 0.0):.6f}")
            lines.append(f"edge_gateway_probe_http_status_code{{{labels}}} {entry.get('status_code', 0)}")
            lines.append(
                f"edge_gateway_probe_last_success_timestamp_seconds{{{labels}}} "
                f"{entry.get('last_success_timestamp', 0.0):.6f}"
            )
            if entry.get("expected_exit_ip"):
                lines.append(f"edge_gateway_probe_exit_ip_match{{{labels}}} {entry.get('exit_ip_match', 0)}")
            if entry.get("exit_ip"):
                info_labels = (
                    f'probe_type="{metric_escape(probe_type)}",'
                    f'exit_ip="{metric_escape(entry["exit_ip"])}"'
                )
                lines.append(f"edge_gateway_probe_exit_ip_info{{{info_labels}}} 1")

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
