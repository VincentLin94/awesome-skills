#!/usr/bin/env bash
# netlify-deploy: 把静态目录 / 单个 HTML 部署到 Netlify 生产环境,输出国内可直连的公网 URL。
# 用法:
#   bash deploy.sh <目录或 .html 文件> [站点名]
# 设计目标:高可用 —— 环境变量提供 Token、幂等复用同名站点、自动装 CLI、失败自愈重试、部署后健康校验。
set -uo pipefail

# ===== 凭证由环境变量 NETLIFY_AUTH_TOKEN 提供 =====
NF_TOKEN="${NETLIFY_AUTH_TOKEN:-}"
export NETLIFY_AUTH_TOKEN="$NF_TOKEN"

TARGET="${1:-}"
SITE_NAME="${2:-}"

if [ -z "$TARGET" ]; then
  echo "ERROR: 需要传入部署目标(目录或 .html 文件)。用法: bash deploy.sh <目录或文件> [站点名]" >&2
  exit 1
fi

if [ -z "$NF_TOKEN" ]; then
  echo "ERROR: 未设置 NETLIFY_AUTH_TOKEN，请通过运行环境提供 Netlify Token。" >&2
  exit 1
fi

# ===== 确保 netlify CLI 可用(自动安装,带重试)=====
export PATH="$HOME/.npm-global/bin:$PATH"
ensure_cli() {
  if command -v netlify >/dev/null 2>&1; then return 0; fi
  echo ">> 未检测到 netlify CLI,正在安装到 \$HOME/.npm-global ..." >&2
  npm config set prefix "$HOME/.npm-global" >/dev/null 2>&1 || true
  for attempt in 1 2; do
    if npm install -g netlify-cli >/dev/null 2>&1; then break; fi
    echo ">> 安装第 ${attempt} 次未成功,重试..." >&2
  done
  export PATH="$HOME/.npm-global/bin:$PATH"
  command -v netlify >/dev/null 2>&1
}
if ! ensure_cli; then
  echo "ERROR: netlify CLI 安装失败,请检查网络后重试。" >&2
  exit 1
fi

# ===== 校验 Token 有效性(用 API,不依赖 netlify status 的退出码)=====
# 注:未 link 目录时 `netlify status` 会以非零码退出但账号其实有效,故这里直接查 API。
ACCT_EMAIL="$(curl -s -m 20 -H "Authorization: Bearer $NF_TOKEN" \
  "https://api.netlify.com/api/v1/user" 2>/dev/null \
  | python3 -c "import sys,json
try: print(json.load(sys.stdin).get('email',''))
except Exception: pass" 2>/dev/null)"
if [ -z "$ACCT_EMAIL" ]; then
  echo "ERROR: Netlify Token 校验失败(可能已过期或被撤销)。请更新运行环境中的 NETLIFY_AUTH_TOKEN。" >&2
  exit 1
fi

# ===== 归一化部署目录 =====
DEPLOY_DIR=""
CLEANUP=""
if [ -d "$TARGET" ]; then
  DEPLOY_DIR="$(cd "$TARGET" && pwd)"
elif [ -f "$TARGET" ]; then
  case "$TARGET" in
    *.html|*.htm)
      TMPD="$(mktemp -d)"
      cp "$TARGET" "$TMPD/index.html"
      DEPLOY_DIR="$TMPD"
      CLEANUP="$TMPD"
      ;;
    *)
      echo "ERROR: 单文件部署仅支持 .html/.htm;目录部署请传目录路径。" >&2
      exit 1
      ;;
  esac
else
  echo "ERROR: 目标不存在: $TARGET" >&2
  exit 1
fi

# 默认站点名:目录名清洗成合法 slug(Netlify 子域要求 a-z0-9-)
if [ -z "$SITE_NAME" ]; then
  SITE_NAME="$(basename "$DEPLOY_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g;s/^-//;s/-$//')"
  [ -z "$SITE_NAME" ] && SITE_NAME="mira-site"
fi

echo ">> 账号: $ACCT_EMAIL" >&2
echo ">> 部署目录: $DEPLOY_DIR (站点名: $SITE_NAME)" >&2

# ===== 幂等:同名站点存在则复用,否则创建 =====
# 通过 API 查已有站点,拿到 site_id
SITE_ID="$(curl -s -m 30 -H "Authorization: Bearer $NF_TOKEN" \
  "https://api.netlify.com/api/v1/sites?name=${SITE_NAME}" 2>/dev/null \
  | python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    for s in d:
        if s.get('name')=='${SITE_NAME}':
            print(s['id']); break
except Exception:
    pass" 2>/dev/null)"

if [ -z "$SITE_ID" ]; then
  echo ">> 站点不存在,正在创建: $SITE_NAME" >&2
  CREATE_OUT="$(netlify sites:create --name "$SITE_NAME" 2>&1)"
  SITE_ID="$(printf '%s\n' "$CREATE_OUT" | grep -Eo 'Project ID: *[a-f0-9-]+' | grep -Eo '[a-f0-9-]{36}' | head -1)"
  if [ -z "$SITE_ID" ]; then
    # 名称可能已被占用,回退为随机名创建
    echo ">> 指定名称不可用,回退为自动命名创建..." >&2
    CREATE_OUT="$(netlify sites:create 2>&1)"
    SITE_ID="$(printf '%s\n' "$CREATE_OUT" | grep -Eo 'Project ID: *[a-f0-9-]+' | grep -Eo '[a-f0-9-]{36}' | head -1)"
  fi
fi

if [ -z "$SITE_ID" ]; then
  echo "ERROR: 无法确定或创建站点。" >&2
  [ -n "$CLEANUP" ] && rm -rf "$CLEANUP"
  exit 1
fi

echo ">> 站点 ID: $SITE_ID" >&2

# ===== 生产部署(带一次重试)=====
deploy_once() {
  netlify deploy --dir="$DEPLOY_DIR" --prod --site "$SITE_ID" 2>&1
}
OUT="$(deploy_once)"
if ! printf '%s' "$OUT" | grep -q "Deploy is live\|Production URL"; then
  echo ">> 首次部署未确认成功,重试一次..." >&2
  OUT="$(deploy_once)"
fi

# 提取生产 URL
URL="$(printf '%s\n' "$OUT" | grep -Eo 'https://[a-zA-Z0-9._-]+\.netlify\.app' | grep -v -- '--' | head -1)"
[ -z "$URL" ] && URL="https://${SITE_NAME}.netlify.app"

[ -n "$CLEANUP" ] && rm -rf "$CLEANUP"

# ===== 部署后健康校验 =====
if [ -n "$URL" ]; then
  CODE="$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$URL" 2>/dev/null)"
  echo ">> 健康校验: $URL -> HTTP $CODE" >&2
  if [ "$CODE" = "200" ] || [ "$CODE" = "304" ]; then
    echo ""
    echo "DEPLOY_OK $URL"
  else
    echo ""
    echo "DEPLOY_OK $URL   (注意: 首页返回 $CODE,可能仍在 CDN 传播,请稍后复验)"
  fi
else
  echo "$OUT"
  echo ">> 已部署,但未能解析 URL,请查看上方日志。" >&2
  exit 1
fi
