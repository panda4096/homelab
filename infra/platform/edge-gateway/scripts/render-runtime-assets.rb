#!/usr/bin/env ruby
require "base64"
require "cgi"
require "fileutils"
require "json"
require "yaml"

def fail_usage!
  warn "usage: render-runtime-assets.rb <values.yaml> <output-dir>"
  exit 1
end

fail_usage! unless ARGV.size == 2

values_path = ARGV[0]
output_dir = ARGV[1]
values = YAML.safe_load(File.read(values_path), permitted_classes: [], aliases: false)

cluster = values.fetch("cluster")
subscription = cluster.fetch("subscription")
kilo = cluster.fetch("kilo")
egress = cluster.fetch("egress", {})
ingress_nodes = values.fetch("ingress_nodes").select { |node| node.fetch("enabled", true) }
protocols = values.fetch("protocols")
socks = protocols.fetch("socks")
http = protocols.fetch("http")
ss = protocols.fetch("shadowsocks")

FileUtils.mkdir_p(output_dir)
subscription_token = subscription.fetch("token")
subscription_host = subscription.fetch("host")
subscription_port = subscription.fetch("port")
sg_ip = kilo.fetch("sg_ip")

dns_servers = Array(egress.fetch("dns_servers", []))
dns_strategy = egress.fetch("dns_strategy", "prefer_ipv4")

if dns_servers.empty?
  dns_servers = [
    {"tag" => "cloudflare-1", "server" => "1.1.1.1", "server_port" => 53},
    {"tag" => "cloudflare-2", "server" => "1.0.0.1", "server_port" => 53},
    {"tag" => "google-1", "server" => "8.8.8.8", "server_port" => 53},
    {"tag" => "google-2", "server" => "8.8.4.4", "server_port" => 53}
  ]
end

dns_config = {
  "servers" => dns_servers.map do |server|
    {
      "type" => "udp",
      "tag" => server.fetch("tag"),
      "server" => server.fetch("server"),
      "server_port" => server.fetch("server_port", 53)
    }
  end,
  "final" => dns_servers.first.fetch("tag"),
  "strategy" => dns_strategy
}

egress_config = {
  "log" => {
    "level" => "info",
    "timestamp" => true
  },
  "dns" => dns_config,
  "inbounds" => [
    {
      "type" => "socks",
      "tag" => "socks-in",
      "listen" => sg_ip,
      "listen_port" => socks.fetch("port"),
      "users" => [
        {
          "username" => socks.fetch("username"),
          "password" => socks.fetch("password")
        }
      ]
    },
    {
      "type" => "http",
      "tag" => "http-in",
      "listen" => sg_ip,
      "listen_port" => http.fetch("port"),
      "users" => [
        {
          "username" => http.fetch("username"),
          "password" => http.fetch("password")
        }
      ]
    },
    {
      "type" => "shadowsocks",
      "tag" => "ss-in",
      "listen" => sg_ip,
      "listen_port" => ss.fetch("port"),
      "method" => ss.fetch("method"),
      "password" => ss.fetch("password")
    }
  ],
  "outbounds" => [
    {
      "type" => "direct",
      "tag" => "direct"
    }
  ],
  "route" => {
    "default_domain_resolver" => dns_config.fetch("final"),
    "final" => "direct"
  }
}

File.write(File.join(output_dir, "config.json"), JSON.pretty_generate(egress_config))

def display_name(node)
  node.fetch("display_name", node.fetch("name"))
end

clash_proxies = ingress_nodes.map do |node|
  {
    "name" => display_name(node),
    "type" => "ss",
    "server" => node.fetch("server"),
    "port" => ss.fetch("port"),
    "cipher" => ss.fetch("method"),
    "password" => ss.fetch("password"),
    "udp" => true
  }
end

clash_config = {
  "mixed-port" => 7890,
  "allow-lan" => false,
  "mode" => "Rule",
  "log-level" => "info",
  "proxies" => clash_proxies,
  "proxy-groups" => [
    {
      "name" => "PROXY",
      "type" => "select",
      "proxies" => clash_proxies.map { |proxy| proxy.fetch("name") }
    }
  ],
  "rules" => [
    "MATCH,PROXY"
  ]
}

sing_box_outbounds = ingress_nodes.map do |node|
  {
    "type" => "shadowsocks",
    "tag" => display_name(node),
    "server" => node.fetch("server"),
    "server_port" => ss.fetch("port"),
    "method" => ss.fetch("method"),
    "password" => ss.fetch("password")
  }
end

sing_box_config = {
  "log" => {
    "level" => "info",
    "timestamp" => true
  },
  "inbounds" => [
    {
      "type" => "mixed",
      "tag" => "mixed-in",
      "listen" => "127.0.0.1",
      "listen_port" => 2080
    }
  ],
  "outbounds" => [
    {
      "type" => "selector",
      "tag" => "select",
      "outbounds" => sing_box_outbounds.map { |outbound| outbound.fetch("tag") },
      "default" => sing_box_outbounds.first.fetch("tag")
    }
  ] + sing_box_outbounds,
  "route" => {
    "final" => "select",
    "auto_detect_interface" => true
  }
}

shadowrocket_uris = ingress_nodes.map do |node|
  creds = Base64.urlsafe_encode64("#{ss.fetch("method")}:#{ss.fetch("password")}", padding: false)
  "ss://#{creds}@#{node.fetch("server")}:#{ss.fetch("port")}##{CGI.escape(display_name(node))}"
end

base_url = "http://#{subscription_host}:#{subscription_port}"
subscription_index = {
  "token" => subscription_token,
  "urls" => {
    "clash" => "#{base_url}/clash-#{subscription_token}.yaml",
    "sing_box" => "#{base_url}/sing-box-#{subscription_token}.json",
    "shadowrocket" => "#{base_url}/shadowrocket-#{subscription_token}.txt"
  }
}

probe_config = {
  "proxy_host" => "127.0.0.1",
  "targets" => {
    "ip_echo_url" => "https://api.ipify.org",
    "generate_204_url" => "https://www.gstatic.com/generate_204"
  },
  "relay" => {
    "host" => sg_ip,
    "protocols" => {
      "http_connect" => {"port" => http.fetch("port")},
      "socks5" => {"port" => socks.fetch("port")},
      "shadowsocks" => {"port" => ss.fetch("port")}
    }
  },
  "http" => {
    "port" => http.fetch("port"),
    "username" => http.fetch("username"),
    "password" => http.fetch("password")
  },
  "socks" => {
    "port" => socks.fetch("port"),
    "username" => socks.fetch("username"),
    "password" => socks.fetch("password")
  }
}

expected_exit_ip = egress.fetch("expected_public_ip", "").strip
probe_config["expected_exit_ip"] = expected_exit_ip unless expected_exit_ip.empty?

File.write(File.join(output_dir, "clash-#{subscription_token}.yaml"), YAML.dump(clash_config))
File.write(File.join(output_dir, "sing-box-#{subscription_token}.json"), JSON.pretty_generate(sing_box_config))
File.write(File.join(output_dir, "shadowrocket-#{subscription_token}.txt"), shadowrocket_uris.join("\n") + "\n")
File.write(File.join(output_dir, "index-#{subscription_token}.json"), JSON.pretty_generate(subscription_index))
File.write(File.join(output_dir, "probe-config.json"), JSON.pretty_generate(probe_config))
