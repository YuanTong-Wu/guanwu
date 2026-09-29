#!/usr/bin/env bash
# 把观物发布到魔搭创空间（ModelScope Studio，静态类型；国内免费托管）。
#   准备：魔搭的"写权限令牌"存在一个只含令牌的文本文件里，
#     MODELSCOPE_TOKEN_FILE=~/Desktop/modelscope-token.txt   （默认就是这个）
#     MODELSCOPE_STUDIO=yuantongwu/guanwu                    （默认）
#   需要：git、uv（用 uvx 调 modelscope 命令行）
#   用法：scripts/deploy-modelscope.sh
# 注意：魔搭的静态空间不解析 Git LFS，模型、wasm、字体必须作为普通文件提交。
set -euo pipefail
cd "$(dirname "$0")/.."
TOKEN_FILE="${MODELSCOPE_TOKEN_FILE:-$HOME/Desktop/modelscope-token.txt}"
STUDIO="${MODELSCOPE_STUDIO:-yuantongwu/guanwu}"
[ -s "$TOKEN_FILE" ] || { echo "token file not found: $TOKEN_FILE" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
# git 问用户名答 oauth2，问密码从令牌文件读；令牌不进命令行、不进 git 配置
cat > "$WORK/askpass.sh" <<ASK
#!/bin/sh
case "\$1" in *sername*) echo oauth2 ;; *) tr -d '\n\r ' < "$TOKEN_FILE" ;; esac
ASK
chmod 700 "$WORK/askpass.sh"
export GIT_ASKPASS="$WORK/askpass.sh" GIT_TERMINAL_PROMPT=0 GIT_LFS_SKIP_SMUDGE=1

npx vite build
node scripts/check-dist.mjs
git -c credential.helper= clone -q "https://www.modelscope.cn/studios/$STUDIO.git" "$WORK/studio"
cd "$WORK/studio"
# 大文件不走 LFS
python3 - <<'PY'
lines = open('.gitattributes').read().splitlines()
keep = [l for l in lines if not l.startswith(('*.gz ', '*.tflite ', '*.wasm ', '*.woff2 '))]
open('.gitattributes', 'w').write('\n'.join(keep) + '\n')
PY
rsync -a --delete --exclude .git --exclude .gitattributes --exclude README.md "$OLDPWD/dist/" ./
git add -A
if git diff --cached --quiet; then
  echo "nothing changed"
else
  git -c user.name="guanwu contributors" -c user.email="231900814+YuanTong-Wu@users.noreply.github.com" commit -qm "Update site"
  git -c credential.helper= push -q origin HEAD
fi
cd "$OLDPWD"
# 登录（令牌从文件经标准输入给出，不上命令行），然后重新部署
uvx -q --from modelscope-hub modelscope login < "$TOKEN_FILE" >/dev/null 2>&1
uvx -q --from modelscope-hub modelscope deploy "$STUDIO" --repo-type studio >/dev/null
echo "deploy requested: https://modelscope.cn/studios/$STUDIO"
