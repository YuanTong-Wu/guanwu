#!/usr/bin/env bash
# 把观物部署到自己的服务器。
#   准备：在仓库根目录建 .deploy.env（不进仓库），写上
#     GUANWU_HOST=ubuntu@1.2.3.4
#     GUANWU_DOMAIN=example.com
#     GUANWU_KEY=~/.ssh/guanwu_deploy      # 可省略，默认用 ssh 自己的配置
#   第一次：scripts/deploy.sh setup    （装 Caddy、写配置）
#   以后每次：npm run deploy          （构建、压缩、上传）
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .deploy.env ] && . ./.deploy.env
: "${GUANWU_HOST:?set GUANWU_HOST in .deploy.env}"
: "${GUANWU_DOMAIN:?set GUANWU_DOMAIN in .deploy.env}"
KEY="${GUANWU_KEY:+${GUANWU_KEY/#\~/$HOME}}"
SSH=(ssh -o StrictHostKeyChecking=accept-new)
RSH="ssh -o StrictHostKeyChecking=accept-new"
if [ -n "$KEY" ]; then
  case "$KEY" in *"'"*) echo "GUANWU_KEY must not contain a single quote" >&2; exit 1 ;; esac
  SSH+=(-i "$KEY" -o IdentitiesOnly=yes)
  # rsync 的 -e 按空格拆词，路径要用单引号包住
  RSH+=" -i '$KEY' -o IdentitiesOnly=yes"
fi

if [ "${1:-}" = "setup" ]; then
  # 服务器上可能还没有 rsync，配置文件直接用 ssh 送过去
  "${SSH[@]}" "$GUANWU_HOST" 'mkdir -p guanwu-deploy'
  for f in Caddyfile setup-server.sh; do
    "${SSH[@]}" "$GUANWU_HOST" "cat > guanwu-deploy/$f" < "deploy/$f"
  done
  "${SSH[@]}" "$GUANWU_HOST" "bash guanwu-deploy/setup-server.sh '$GUANWU_DOMAIN'"
  exit 0
fi

npx vite build
node scripts/check-dist.mjs
node scripts/compress.mjs
# 先传新资源，再换页面，最后删旧文件。assets/ 里上一版的文件留 7 天：
# 已经打开着旧页面的人，点"起卦"时还要按需加载旧版的分块
rsync -az -e "$RSH" --exclude 'index.html*' dist/ "$GUANWU_HOST:/srv/guanwu/"
rsync -az -e "$RSH" dist/index.html* "$GUANWU_HOST:/srv/guanwu/"
rsync -az -e "$RSH" --delete --exclude 'assets/' dist/ "$GUANWU_HOST:/srv/guanwu/"
"${SSH[@]}" "$GUANWU_HOST" 'find /srv/guanwu/assets -type f -mtime +7 -delete'
echo "deployed: https://$GUANWU_DOMAIN"
