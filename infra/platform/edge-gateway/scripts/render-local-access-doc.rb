#!/usr/bin/env ruby
require "base64"
require "cgi"
require "yaml"

def fail_usage!
  warn "usage: render-local-access-doc.rb <values.yaml> <output-path>"
  exit 1
end

fail_usage! unless ARGV.size == 2

values_path = ARGV[0]
output_path = ARGV[1]
values = YAML.safe_load(File.read(values_path), permitted_classes: [], aliases: false)

cluster = values.fetch("cluster")
subscription = cluster.fetch("subscription")
ingress_nodes = values.fetch("ingress_nodes").select { |node| node.fetch("enabled", true) }
protocols = values.fetch("protocols")
socks = protocols.fetch("socks")
http = protocols.fetch("http")
ss = protocols.fetch("shadowsocks")

subscription_host = subscription.fetch("host")
subscription_port = subscription.fetch("port")
subscription_token = subscription.fetch("token")
subscription_base = "http://#{subscription_host}:#{subscription_port}"

node = ingress_nodes.first
display_name = node.fetch("display_name", node.fetch("name"))
server = node.fetch("server")

ss_creds = Base64.urlsafe_encode64("#{ss.fetch("method")}:#{ss.fetch("password")}", padding: false)
shadowrocket_uri = "ss://#{ss_creds}@#{server}:#{ss.fetch("port")}##{CGI.escape(display_name)}"

content = <<~MARKDOWN
  # Edge Gateway Local Access

  > 这个文件包含真实订阅 token 和代理凭据，只用于本机复制使用。不要提交到远端，不要外传。

  ## 当前节点

  - 展示名：`#{display_name}`
  - 入口地址：`#{server}`
  - 订阅服务：`#{subscription_base}`

  ## 订阅地址

  - Clash / ClashX / Mihomo：`#{subscription_base}/clash-#{subscription_token}.yaml`
  - sing-box：`#{subscription_base}/sing-box-#{subscription_token}.json`
  - Shadowrocket：`#{subscription_base}/shadowrocket-#{subscription_token}.txt`
  - 订阅索引：`#{subscription_base}/index-#{subscription_token}.json`

  ## 手工导入

  ### Shadowsocks

  - 名称：`#{display_name}`
  - server：`#{server}`
  - port：`#{ss.fetch("port")}`
  - method：`#{ss.fetch("method")}`
  - password：`#{ss.fetch("password")}`
  - URI：`#{shadowrocket_uri}`

  ### SOCKS5

  - 名称：`#{display_name}`
  - server：`#{server}`
  - port：`#{socks.fetch("port")}`
  - username：`#{socks.fetch("username")}`
  - password：`#{socks.fetch("password")}`

  ### HTTP CONNECT

  - 名称：`#{display_name}`
  - server：`#{server}`
  - port：`#{http.fetch("port")}`
  - username：`#{http.fetch("username")}`
  - password：`#{http.fetch("password")}`

  ## 复制即用

  ```bash
  curl --proxy "http://#{http.fetch("username")}:#{http.fetch("password")}@#{server}:#{http.fetch("port")}" https://api.ipify.org
  curl --proxy "socks5h://#{socks.fetch("username")}:#{socks.fetch("password")}@#{server}:#{socks.fetch("port")}" https://api.ipify.org
  ```

  ```yaml
  proxies:
    - name: #{display_name}
      type: ss
      server: #{server}
      port: #{ss.fetch("port")}
      cipher: #{ss.fetch("method")}
      password: #{ss.fetch("password")}
      udp: true
  ```
MARKDOWN

File.write(output_path, content)
