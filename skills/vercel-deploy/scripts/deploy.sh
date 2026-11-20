#!/usr/bin/env bash
# vercel-deploy: 把静态目录 / 单个 HTML 部署到 Vercel 生产环境,输出可分发 URL。
# 用法:
#   bash deploy.sh <目录或 .html 文件> [项目名]
set -euo pipefail

# ===== 凭证由环境变量 VERCEL_TOKEN 提供 =====
VC_TOKEN="${VERCEL_TOKEN:-}"

TARGET="${1:-}"
PROJECT="${2:-}"

if [ -z "$TARGET" ]; then
  echo "ERROR: 需要传入部署目标(目录或 .html 文件)。用法: bash deploy.sh <目录或文件> [项目名]" >&2
  exit 1
fi

if [ -z "$VC_TOKEN" ]; then
  echo "ERROR: 未设置 VERCEL_TOKEN，请通过运行环境提供 Vercel Token。" >&2
  exit 1
fi

# ===== 确保 vercel CLI 可用 =====
export PATH="$HOME/.npm-global/bin:$PATH"
if ! command -v vercel >/dev/null 2>&1; then
  echo ">> 未检测到 vercel CLI,正在安装到 \$HOME/.npm-global ..." >&2
  npm config set prefix "$HOME/.npm-global" >/dev/null 2>&1 || true
  npm install -g vercel@latest >/dev/null 2>&1
  export PATH="$HOME/.npm-global/bin:$PATH"
fi

# ===== 归一化部署目录 =====
DEPLOY_DIR=""
CLEANUP=""
if [ -d "$TARGET" ]; then
  DEPLOY_DIR="$TARGET"
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

# 默认项目名:目录名清洗成合法 slug
if [ -z "$PROJECT" ]; then
  PROJECT="$(basename "$(cd "$DEPLOY_DIR" && pwd)" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g;s/^-//;s/-$//')"
  [ -z "$PROJECT" ] && PROJECT="mira-site"
fi

echo ">> 账号: $(vercel whoami --token="$VC_TOKEN" 2>/dev/null | tail -1)" >&2
echo ">> 部署目录: $DEPLOY_DIR (项目名: $PROJECT)" >&2

# ===== 生产部署 =====
cd "$DEPLOY_DIR"
OUT="$(vercel deploy --prod --yes --name "$PROJECT" --token="$VC_TOKEN" 2>&1)" || {
  echo "$OUT" >&2
  [ -n "$CLEANUP" ] && rm -rf "$CLEANUP"
  echo "ERROR: 部署失败,请检查上方日志。" >&2
  exit 1
}

# 提取生产 URL
URL="$(printf '%s\n' "$OUT" | grep -Eo 'https://[a-zA-Z0-9._-]+\.vercel\.app' | head -1)"

[ -n "$CLEANUP" ] && rm -rf "$CLEANUP"

if [ -n "$URL" ]; then
  echo ""
  echo "DEPLOY_OK $URL"
else
  echo "$OUT"
  echo ">> 已部署,但未能从输出解析 URL,请查看上方日志。" >&2
fi
