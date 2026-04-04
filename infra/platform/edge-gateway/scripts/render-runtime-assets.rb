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

egress_config = {
  "log" => {
    "level" => "info",
    "timestamp" => true
  },
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
    "final" => "direct"
  }
}

File.write(File.join(output_dir, "config.json"), JSON.pretty_generate(egress_config))

clash_proxies = ingress_nodes.map do |node|
  {
    "name" => "#{node.fetch("name")}-ss",
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
    "tag" => "#{node.fetch("name")}-ss",
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
  "ss://#{creds}@#{node.fetch("server")}:#{ss.fetch("port")}##{CGI.escape("#{node.fetch("name")}-ss")}"
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

File.write(File.join(output_dir, "clash-#{subscription_token}.yaml"), YAML.dump(clash_config))
File.write(File.join(output_dir, "sing-box-#{subscription_token}.json"), JSON.pretty_generate(sing_box_config))
File.write(File.join(output_dir, "shadowrocket-#{subscription_token}.txt"), shadowrocket_uris.join("\n") + "\n")
File.write(File.join(output_dir, "index-#{subscription_token}.json"), JSON.pretty_generate(subscription_index))
