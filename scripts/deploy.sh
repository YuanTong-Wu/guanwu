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
SSH=(ssh -o StrictHostKeyChecking=accept-new)
[ -n "${GUANWU_KEY:-}" ] && SSH+=(-i "${GUANWU_KEY/#\~/$HOME}" -o IdentitiesOnly=yes)
RSH="${SSH[*]}"

if [ "${1:-}" = "setup" ]; then
  rsync -az -e "$RSH" deploy/ "$GUANWU_HOST:guanwu-deploy/"
  "${SSH[@]}" "$GUANWU_HOST" "bash guanwu-deploy/setup-server.sh '$GUANWU_DOMAIN'"
  exit 0
fi

npx vite build
node scripts/check-dist.mjs
node scripts/compress.mjs
# 先传新资源，再换页面，最后删旧文件：访问中途不会拿到指向不存在文件的页面
rsync -az -e "$RSH" --exclude 'index.html*' dist/ "$GUANWU_HOST:/srv/guanwu/"
rsync -az -e "$RSH" dist/index.html* "$GUANWU_HOST:/srv/guanwu/"
rsync -az -e "$RSH" --delete dist/ "$GUANWU_HOST:/srv/guanwu/"
echo "deployed: https://$GUANWU_DOMAIN"
