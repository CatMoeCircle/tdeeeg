#!/usr/bin/env bash
# TDLib on Linux — follow https://tdlib.github.io/td/build.html
# Official flow: install deps → cmake Release → prepare_cross_compiling → tdjson
# Additional on top: link OpenSSL/zlib statically into tdjson.
# Args: <tdlib-src-dir> <output-dir> <arch>
set -euo pipefail

TDLIB_SRC="${1:?tdlib source dir}"
OUT_DIR="${2:?output dir}"
ARCH="${3:?arch: x86_64 | arm64}"

case "$ARCH" in
  x86_64) CMAKE_PROCESSOR=x86_64;  SSL_LIB_GLOB='/usr/lib/x86_64-linux-gnu/libssl.a' ;;
  arm64)  CMAKE_PROCESSOR=aarch64; SSL_LIB_GLOB='/usr/lib/aarch64-linux-gnu/libssl.a' ;;
  *)
    echo "unsupported arch: $ARCH" >&2
    exit 1
    ;;
esac

echo "==> Linux TDLib arch=${ARCH}"
echo "==> Official build doc: https://tdlib.github.io/td/build.html"
echo "==> Extra: static OpenSSL/zlib merged into tdjson"

# Official deps (Ubuntu/Debian): gperf cmake clang/c++ zlib1g-dev libssl-dev
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  gperf cmake ninja-build \
  clang g++ \
  zlib1g-dev libssl-dev \
  perl make curl ca-certificates

# Official: mkdir build && cd build && cmake -DCMAKE_BUILD_TYPE=Release ..
BUILD_DIR="${TDLIB_SRC}/build-linux-${ARCH}"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Locate static system archives for the merge (official packages provide .a)
find_static() {
  local name="$1"
  local candidate
  for candidate in \
    "$SSL_LIB_GLOB" \
    /usr/lib/"$(dpkg-architecture -qDEB_HOST_MULTIARCH 2>/dev/null || echo x86_64-linux-gnu)"/"${name}" \
    /usr/lib/"${name}" \
    /usr/lib64/"${name}" \
    /usr/local/lib/"${name}"
  do
    if [[ -f "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  # Fallback: any static libssl/libz on the system
  candidate="$(find /usr/lib /usr/lib64 /usr/local/lib -name "${name}" 2>/dev/null | head -n1 || true)"
  if [[ -n "$candidate" && -f "$candidate" ]]; then
    echo "$candidate"
    return 0
  fi
  return 1
}

SSL_LIB="$(find_static libssl.a || true)"
CRYPTO_LIB="$(find_static libcrypto.a || true)"
ZLIB_LIB="$(find_static libz.a || true)"

if [[ -z "$SSL_LIB" || -z "$CRYPTO_LIB" || -z "$ZLIB_LIB" ]]; then
  echo "error: static OpenSSL/zlib not found (need libssl.a/libcrypto.a/libz.a from libssl-dev/zlib1g-dev)" >&2
  dpkg -L libssl-dev 2>/dev/null | grep -E 'libssl|libcrypto' || true
  dpkg -L zlib1g-dev 2>/dev/null | grep 'libz' || true
  exit 1
fi
echo "==> static libs: ssl=$SSL_LIB crypto=$CRYPTO_LIB zlib=$ZLIB_LIB"

CMAKE_ARGS=(
  -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_SYSTEM_PROCESSOR="$CMAKE_PROCESSOR"
  -DBUILD_SHARED_LIBS=ON
  -DTD_ENABLE_JNI=OFF
)

# Official uses clang when available
if command -v clang >/dev/null 2>&1 && command -v clang++ >/dev/null 2>&1; then
  CMAKE_ARGS+=(-DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++)
fi

# Extra: force static OpenSSL/zlib into tdjson
CMAKE_ARGS+=(
  -DOPENSSL_USE_STATIC_LIBS=TRUE
  -DZLIB_USE_STATIC_LIBS=TRUE
  -DOPENSSL_CRYPTO_LIBRARY="$CRYPTO_LIB"
  -DOPENSSL_SSL_LIBRARY="$SSL_LIB"
  -DZLIB_LIBRARY="$ZLIB_LIB"
)

echo "==> cmake -DCMAKE_BUILD_TYPE=Release .. (+ static merge)"
cmake "${CMAKE_ARGS[@]}" "$TDLIB_SRC"

# Official build sequence
echo "==> cmake --build . --target prepare_cross_compiling"
cmake --build . --target prepare_cross_compiling -j "$(nproc)" || true
echo "==> cmake --build . --target tdjson"
cmake --build . --target tdjson -j "$(nproc)"

echo "==> collect artifacts"
mkdir -p "$OUT_DIR/tdjson"
MAIN=""
while IFS= read -r -d '' f; do
  if [[ ! -L "$f" ]]; then
    MAIN="$f"
    break
  fi
done < <(find "$BUILD_DIR" -type f -name 'libtdjson.so*' -print0 2>/dev/null | sort -z)
if [[ -z "$MAIN" ]]; then
  MAIN="$(find "$BUILD_DIR" -type f -name 'libtdjson.so' | head -n1 || true)"
fi
if [[ -z "$MAIN" ]]; then
  echo "error: no libtdjson produced" >&2
  find "$BUILD_DIR" -type f -name '*tdjson*' >&2 || true
  exit 1
fi
cp -aL "$MAIN" "$OUT_DIR/tdjson/libtdjson.so"
strip --strip-unneeded "$OUT_DIR/tdjson/libtdjson.so" 2>/dev/null || true

echo "==> ldd (must NOT list libssl/libcrypto/libz)"
ldd_out="$(ldd "$OUT_DIR/tdjson/libtdjson.so" 2>&1 || true)"
echo "$ldd_out"
if echo "$ldd_out" | grep -E 'libssl|libcrypto|libz\.so|libz\.' >/dev/null; then
  echo "error: tdjson still dynamically depends on openssl/zlib" >&2
  exit 1
fi

{
  echo "platform=linux"
  echo "arch=${ARCH}"
  echo "doc=https://tdlib.github.io/td/build.html"
  echo "official_flow=cmake+prepare_cross_compiling+tdjson"
  echo "linkage=static"
  echo "openssl_lib=$SSL_LIB"
  echo "zlib_lib=$ZLIB_LIB"
  echo "note=OpenSSL+zlib merged into tdjson (official build + static merge)"
} > "$OUT_DIR/tdjson/build-info.txt"

file "$OUT_DIR/tdjson/libtdjson.so" || true
echo "==> Linux ${ARCH} tdjson ready"
