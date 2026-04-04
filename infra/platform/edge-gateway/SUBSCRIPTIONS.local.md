# Edge Gateway Local Access

> 这个文件包含真实订阅 token 和代理凭据，只用于本机复制使用。不要提交到远端，不要外传。

## 当前节点

- 展示名：`广州->新加坡`
- 入口地址：`gz.butcoder.com`
- 订阅服务：`http://106.55.163.135:11800`

## 订阅地址

- Clash / ClashX / Mihomo：`http://106.55.163.135:11800/clash-egw-20260404-9a7c3d.yaml`
- sing-box：`http://106.55.163.135:11800/sing-box-egw-20260404-9a7c3d.json`
- Shadowrocket：`http://106.55.163.135:11800/shadowrocket-egw-20260404-9a7c3d.txt`
- 订阅索引：`http://106.55.163.135:11800/index-egw-20260404-9a7c3d.json`

## 手工导入

### Shadowsocks

- 名称：`广州->新加坡`
- server：`gz.butcoder.com`
- port：`18388`
- method：`chacha20-ietf-poly1305`
- password：`dUsk5FWuqQ2mwPnG5TRuply5`
- URI：`ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpkVXNrNUZXdXFRMm13UG5HNVRSdXBseTU@gz.butcoder.com:18388#%E5%B9%BF%E5%B7%9E-%3E%E6%96%B0%E5%8A%A0%E5%9D%A1`

### SOCKS5

- 名称：`广州->新加坡`
- server：`gz.butcoder.com`
- port：`11080`
- username：`edge-user`
- password：`ZGMSVYKJIdT48RtsAAGa`

### HTTP CONNECT

- 名称：`广州->新加坡`
- server：`gz.butcoder.com`
- port：`11081`
- username：`edge-user`
- password：`ZGMSVYKJIdT48RtsAAGa`

## 复制即用

```bash
curl --proxy "http://edge-user:ZGMSVYKJIdT48RtsAAGa@gz.butcoder.com:11081" https://api.ipify.org
curl --proxy "socks5h://edge-user:ZGMSVYKJIdT48RtsAAGa@gz.butcoder.com:11080" https://api.ipify.org
```

```yaml
proxies:
  - name: 广州->新加坡
    type: ss
    server: gz.butcoder.com
    port: 18388
    cipher: chacha20-ietf-poly1305
    password: dUsk5FWuqQ2mwPnG5TRuply5
    udp: true
```
