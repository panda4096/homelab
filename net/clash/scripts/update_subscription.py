import base64
import json
import yaml
from pathlib import Path
import requests

SUB_URL = ""
CLASH_CONFIG_PATH = Path("./clash-config.yaml")
OUTPUT_PATH = Path("./myvpn.yaml")

def fetch_subscription(url):
    resp = requests.get(url)
    resp.raise_for_status()
    data = resp.content
    decoded = base64.b64decode(data).decode("utf-8")
    lines = decoded.strip().splitlines()
    nodes = []
    for line in lines:
        if line.startswith("vmess://"):
            vmess_b64 = line[len("vmess://"):]
            node_json = base64.b64decode(vmess_b64).decode("utf-8")
            node = json.loads(node_json)
            proxies_dict = {
                "name": node.get("ps") or node.get("remark") or "Unnamed",
                "server": node.get("add") or node.get("host"),
                "port": node.get("port"),
                "type": "vmess",
                "uuid": node.get("id"),
                "alterId": node.get("aid", 0),
                "cipher": "auto",
                "tls": node.get("tls", False) or False,
                "skip-cert-verify": True,
                "udp": node.get("net") != "ws"
            }
            nodes.append(proxies_dict)
    return nodes

def proxies_to_flow_list(nodes):
    """将每个 proxy 转成单行 {…}"""
    lines = []
    for node in nodes:
        items = [f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in node.items()]
        line = "{%s}" % ", ".join(items)
        lines.append(f"  - {line}")
    return "\n".join(lines)

def main():
    if not CLASH_CONFIG_PATH.exists():
        raise FileNotFoundError(f"{CLASH_CONFIG_PATH} 不存在")
    with open(CLASH_CONFIG_PATH, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    nodes = fetch_subscription(SUB_URL)

    # 生成 YAML 内容顺序：其他字段 -> proxies -> proxy-groups -> rules
    keys_before_proxies = [k for k in config if k not in ("proxies", "proxy-groups", "rules")]
    
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        # 先写其他字段
        for key in keys_before_proxies:
            yaml.dump({key: config[key]}, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
        # 写 proxies
        f.write("proxies:\n")
        f.write(proxies_to_flow_list(nodes) + "\n")
        # 写 proxy-groups
        if "proxy-groups" in config:
            yaml.dump({"proxy-groups": config["proxy-groups"]}, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
        # 写 rules
        if "rules" in config:
            yaml.dump({"rules": config["rules"]}, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    print(f"配置更新完成，保存在 {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
