#!/usr/bin/env bash
# 在一台新的 Ubuntu/Debian 服务器上装好 Caddy，只做一次。由 scripts/deploy.sh setup 远程调用。
# 用法：bash setup-server.sh <域名>
set -euo pipefail
DOMAIN="${1:?usage: setup-server.sh <domain>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

sudo apt-get update -y
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg rsync unattended-upgrades

# Caddy 官方 apt 源
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

# 网站文件放在 /srv/guanwu，归登录用户所有，部署时直接 rsync
sudo mkdir -p /srv/guanwu
sudo chown "$(id -un):$(id -gn)" /srv/guanwu
if [ ! -f /srv/guanwu/index.html ]; then
  printf '<!doctype html><meta charset="utf-8"><title>观物</title><p style="font:20px serif;text-align:center;margin-top:40vh">观物　即将上线</p>\n' > /srv/guanwu/index.html
fi

sed "s/guanwu\.example/${DOMAIN}/g" "$HERE/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl enable caddy
sudo systemctl reload-or-restart caddy

# 安全更新自动装
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null

echo "setup done: https://${DOMAIN}"
