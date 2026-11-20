#!/usr/bin/env bash
# 新建家装 3D 项目
#   new_home.sh <目标目录>            默认：纯原生 Three.js 版（零外部素材，双击 index.html 即开）
#   new_home.sh <目标目录> --blender  可选：Blender → glTF → Three.js PBR 照片级管线
set -euo pipefail
TARGET="${1:?usage: new_home.sh <target_dir> [--blender]}"
MODE="${2:-native}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$TARGET"
if [ "$MODE" = "--blender" ]; then
  mkdir -p "$TARGET/blender" "$TARGET/web/assets"
  cp -R "$HERE/assets/pipeline-template/blender/." "$TARGET/blender/"
  cp "$HERE/assets/pipeline-template/build_web.py" "$HERE/assets/pipeline-template/fetch_assets.py" "$TARGET/"
  cp -R "$HERE/assets/pipeline-template/web/." "$TARGET/web/"
  echo "created $TARGET (blender pipeline)"
  echo "next: python3 fetch_assets.py assets; blender -b -P blender/build_scene.py && blender -b -P blender/export_glb.py && python3 build_web.py"
else
  cp "$HERE/assets/native-template/"{index.html,materials.js,plants.js,scene.js,viewer.js} "$TARGET/"
  [ -f "$TARGET/home-data.js" ] || cp "$HERE/assets/native-template/home-data.js" "$TARGET/home-data.js"
  echo "created $TARGET (native three.js)"
  echo "next: 用新户型的 home.json 生成 home-data.js（window.HOME = {...}），改 viewer.js 的 OVERRIDE 机位，"
  echo "      然后 node scripts/verify-web.js $TARGET/index.html /tmp/check living:dusk plan  逐间截图验收"
fi
