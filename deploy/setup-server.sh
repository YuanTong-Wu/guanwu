#!/usr/bin/env bash
# 在一台新的 Ubuntu/Debian 服务器上装好 Caddy，只做一次（重复跑也没关系）。由 scripts/deploy.sh setup 远程调用。
# 用法：bash setup-server.sh <域名>
set -euo pipefail
DOMAIN="${1:?usage: setup-server.sh <domain>}"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "bad domain: $DOMAIN (just the name, like example.com)" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"

# 新开的机器常在后台自动装更新，占着 apt 的锁：先等它做完，再带超时去拿锁
sudo systemd-run --quiet --wait -p After=apt-daily.service -p After=apt-daily-upgrade.service /bin/true || true
APT=(sudo DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600)
apt_update() {
  for _ in $(seq 30); do
    "${APT[@]}" update -y && return 0
    echo 'apt is busy (automatic updates), retrying in 10 s...'
    sleep 10
  done
  "${APT[@]}" update -y
}

apt_update
"${APT[@]}" install -y apt-transport-https curl gnupg rsync unattended-upgrades

# Caddy 官方 apt 源
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt_update
  "${APT[@]}" install -y caddy
fi

# 网站文件放在 /srv/guanwu，归登录用户所有，部署时直接 rsync
sudo mkdir -p /srv/guanwu
sudo chown "$(id -un):$(id -gn)" /srv/guanwu
if [ ! -f /srv/guanwu/index.html ]; then
  printf '<!doctype html><meta charset="utf-8"><title>观物</title><p style="font:20px serif;text-align:center;margin-top:40vh">观物　即将上线</p>\n' > /srv/guanwu/index.html
fi

# 先写到临时文件并检查，通过了才换掉正在用的配置
tmp="$(mktemp)"
sed "s/guanwu\.example/${DOMAIN}/g" "$HERE/Caddyfile" > "$tmp"
caddy validate --config "$tmp" --adapter caddyfile
sudo install -m 644 -o root -g root "$tmp" /etc/caddy/Caddyfile
rm -f "$tmp"
sudo systemctl enable caddy
sudo systemctl reload-or-restart caddy

# 安全更新自动装
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null

echo "setup done: https://${DOMAIN}"
