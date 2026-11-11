#!/usr/bin/env bash
# 本地准备 Playwright chromium 的运行库（WSL / 无 sudo 环境用）。
# 不安装系统包、不改系统目录：把 Ubuntu jammy 的 deb 解包到项目内 .playwright-libs/，
# 由 package.json 的 e2e 脚本通过 LD_LIBRARY_PATH 注入。
#
# CI / 有 sudo 的机器不需要本脚本：`pnpm exec playwright install --with-deps chromium` 即可。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/.playwright-libs"
LIBS="$DEST/root/usr/lib/x86_64-linux-gnu"

if [ -f "$LIBS/libnss3.so" ] && [ -f "$LIBS/libnspr4.so" ] && [ -f "$LIBS/libasound.so.2" ]; then
  echo "✓ 运行库已就绪：$LIBS"
  exit 0
fi

mkdir -p "$DEST/debs"
cd "$DEST/debs"

download() {
  local name="$1" url="$2"
  if [ ! -s "$name.deb" ]; then
    echo "下载 $name ..."
    curl -fL --retry 2 -o "$name.deb" "$url"
  fi
}

# 版本固定为 Ubuntu jammy 上仍可下载的构建，避免源更新后 404。
download libnspr4 "http://archive.ubuntu.com/ubuntu/pool/main/n/nspr/libnspr4_2%3a4.35-0ubuntu0.22.04.1_amd64.deb"
download libnss3 "http://archive.ubuntu.com/ubuntu/pool/main/n/nss/libnss3_3.98-0ubuntu0.22.04.5_amd64.deb"
download libasound2 "http://archive.ubuntu.com/ubuntu/pool/main/a/alsa-lib/libasound2_1.2.6.1-1ubuntu1.2_amd64.deb"

rm -rf "$DEST/root"
mkdir -p "$DEST/root"
for deb in ./*.deb; do
  dpkg-deb -x "$deb" "$DEST/root"
done

echo "✓ 运行库已解包：$LIBS"
echo "  现在可以运行：pnpm e2e"
