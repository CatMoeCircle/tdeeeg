#!/usr/bin/env bash
# TDLib on macOS — follow https://tdlib.github.io/td/build.html
# Official flow: brew deps → cmake Release → prepare_cross_compiling → tdjson
# Additional on top: link OpenSSL/zlib statically into tdjson.
# Args: <tdlib-src-dir> <output-dir> <arch>
set -euo pipefail

TDLIB_SRC="${1:?tdlib source dir}"
OUT_DIR="${2:?output dir}"
ARCH="${3:?arch: x86_64 | arm64}"

case "$ARCH" in
  x86_64) OSX_ARCH=x86_64; MIN_TARGET=10.15 ;;
  arm64)  OSX_ARCH=arm64;  MIN_TARGET=11.0 ;;
  *)
    echo "unsupported arch: $ARCH" >&2
    exit 1
    ;;
esac

echo "==> macOS TDLib arch=${ARCH}"
echo "==> Official build doc: https://tdlib.github.io/td/build.html"
echo "==> Extra: static OpenSSL/zlib merged into libtdjson.dylib"

if ! command -v brew >/dev/null 2>&1; then
  echo "error: Homebrew required (official macOS instructions)" >&2
  exit 1
fi
# Official: brew install gperf openssl cmake
brew install gperf cmake ninja openssl@3 zlib curl perl || true

# Prefer Homebrew OpenSSL headers/libs; for static merge we may point at static .a
BREW_OSSL="$(brew --prefix openssl@3 2>/dev/null || brew --prefix openssl)"
BREW_ZLIB="$(brew --prefix zlib 2>/dev/null || true)"

WORK_DIR="${TDLIB_SRC}/build-macos-${ARCH}"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

# If Homebrew only ships shared libs, build static OpenSSL/zlib as an extra step
# on top of the official install (same cmake path, static archives for merge).
PREFIX="$WORK_DIR/deps-static"
mkdir -p "$PREFIX"

need_static=1
if [[ -f "$BREW_OSSL/lib/libssl.a" && -f "$BREW_OSSL/lib/libcrypto.a" ]]; then
  PREFIX="$BREW_OSSL"
  need_static=0
  echo "==> using Homebrew static OpenSSL at $PREFIX"
fi
if [[ -n "$BREW_ZLIB" && -f "$BREW_ZLIB/lib/libz.a" ]]; then
  ZLIB_LIB="$BREW_ZLIB/lib/libz.a"
else
  ZLIB_LIB=""
fi

if [[ "$need_static" == "1" ]]; then
  echo "==> build static OpenSSL (extra on top of official brew install)"
  OSSL_SRC="$WORK_DIR/openssl-src"
  OSSL_BUILD="$WORK_DIR/openssl-build"
  OPENSSL_VERSION="${OPENSSL_VERSION:-3.0.15}"
  curl -fsSL "https://www.openssl.org/source/openssl-${OPENSSL_VERSION}.tar.gz" -o "$WORK_DIR/openssl.tar.gz" \
    || curl -fsSL "https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz" \
      -o "$WORK_DIR/openssl.tar.gz"
  mkdir -p "$OSSL_SRC"
  tar -xzf "$WORK_DIR/openssl.tar.gz" -C "$OSSL_SRC" --strip-components=1
  mkdir -p "$OSSL_BUILD"
  cd "$OSSL_BUILD"
  case "$ARCH" in
    x86_64) OSSL_TARGET="darwin64-x86_64-cc" ;;
    arm64)  OSSL_TARGET="darwin64-arm64-cc" ;;
  esac
  "$OSSL_SRC/Configure" "$OSSL_TARGET" \
    no-shared no-tests no-unit-test no-comp \
    -D__APPLE_USE_RFC_3542_MSGS=1 -fPIC \
    --prefix="$PREFIX" --openssldir="$PREFIX/ssl"
  make -j "$(sysctl -n hw.ncpu)"
  make install_sw
  cd "$WORK_DIR"
fi

if [[ -z "${ZLIB_LIB:-}" || ! -f "${ZLIB_LIB}" ]]; then
  echo "==> build static zlib (extra on top of official brew install)"
  ZLIB_SRC="$WORK_DIR/zlib-src"
  ZLIB_BUILD="$WORK_DIR/zlib-build"
  ZLIB_VERSION="${ZLIB_VERSION:-1.3.1}"
  curl -fsSL "https://zlib.net/fossils/zlib-${ZLIB_VERSION}.tar.gz" -o "$WORK_DIR/zlib.tar.gz" \
    || curl -fsSL "https://github.com/madler/zlib/releases/download/v${ZLIB_VERSION}/zlib-${ZLIB_VERSION}.tar.gz" \
      -o "$WORK_DIR/zlib.tar.gz"
  mkdir -p "$ZLIB_SRC"
  tar -xzf "$WORK_DIR/zlib.tar.gz" -C "$ZLIB_SRC" --strip-components=1
  mkdir -p "$ZLIB_BUILD"
  cd "$ZLIB_BUILD"
  "$ZLIB_SRC/configure" --static --prefix="$PREFIX" CFLAGS="-O2 -fPIC"
  make -j "$(sysctl -n hw.ncpu)"
  make install
  ZLIB_LIB="$PREFIX/lib/libz.a"
  if [[ ! -f "$ZLIB_LIB" && -f "$PREFIX/lib64/libz.a" ]]; then
    mkdir -p "$PREFIX/lib"
    cp -a "$PREFIX/lib64/libz.a" "$PREFIX/lib/"
    ZLIB_LIB="$PREFIX/lib/libz.a"
  fi
  cd "$WORK_DIR"
fi

if [[ ! -f "$PREFIX/lib/libssl.a" || ! -f "$PREFIX/lib/libcrypto.a" ]]; then
  # Homebrew layout
  if [[ -f "$PREFIX/lib/libssl.a" ]]; then
    :
  elif [[ -f "$BREW_OSSL/lib/libssl.a" ]]; then
    PREFIX="$BREW_OSSL"
  fi
fi
if [[ ! -f "$PREFIX/lib/libssl.a" ]]; then
  echo "error: static libssl.a not found under $PREFIX" >&2
  find "$PREFIX" "$BREW_OSSL" -name 'libssl*' 2>/dev/null | head || true
  exit 1
fi
if [[ ! -f "${ZLIB_LIB}" ]]; then
  echo "error: static libz.a not found: ${ZLIB_LIB}" >&2
  exit 1
fi

# Official cmake directory layout
BUILD_DIR="$WORK_DIR/td"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

CMAKE_ARGS=(
  -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_OSX_ARCHITECTURES="$OSX_ARCH"
  -DCMAKE_OSX_DEPLOYMENT_TARGET="$MIN_TARGET"
  -DBUILD_SHARED_LIBS=ON
  -DTD_ENABLE_JNI=OFF
  -DCMAKE_PREFIX_PATH="$PREFIX"
  -DOPENSSL_ROOT_DIR="$PREFIX"
  -DOPENSSL_CRYPTO_LIBRARY="$PREFIX/lib/libcrypto.a"
  -DOPENSSL_SSL_LIBRARY="$PREFIX/lib/libssl.a"
  -DZLIB_LIBRARY="$ZLIB_LIB"
  -DOPENSSL_USE_STATIC_LIBS=TRUE
  -DZLIB_USE_STATIC_LIBS=TRUE
)

echo "==> cmake -DCMAKE_BUILD_TYPE=Release .. (+ static merge)"
cmake "${CMAKE_ARGS[@]}" "$TDLIB_SRC"

echo "==> cmake --build . --target prepare_cross_compiling"
cmake --build . --target prepare_cross_compiling -j "$(sysctl -n hw.ncpu)" || true
echo "==> cmake --build . --target tdjson"
cmake --build . --target tdjson -j "$(sysctl -n hw.ncpu)"

echo "==> collect artifacts"
mkdir -p "$OUT_DIR/tdjson"
LIB="$(find "$BUILD_DIR" -type f -name 'libtdjson*.dylib' ! -type l | head -n1 || true)"
if [[ -z "$LIB" ]]; then
  LIB="$(find "$BUILD_DIR" -type f -name 'libtdjson*.dylib' | head -n1 || true)"
fi
if [[ -z "$LIB" ]]; then
  echo "error: no libtdjson.dylib produced" >&2
  find "$BUILD_DIR" -name '*tdjson*' >&2 || true
  exit 1
fi
cp -aL "$LIB" "$OUT_DIR/tdjson/libtdjson.dylib"

if command -v install_name_tool >/dev/null 2>&1; then
  install_name_tool -id @rpath/libtdjson.dylib "$OUT_DIR/tdjson/libtdjson.dylib" || true
  while read -r dep; do
    [[ -z "$dep" ]] && continue
    case "$dep" in
      @rpath/*|@loader_path/*|/usr/lib/*|/System/*) continue ;;
    esac
    if [[ "$dep" == *libssl* || "$dep" == *libcrypto* || "$dep" == *libz* || "$dep" == *openssl* ]]; then
      echo "error: unexpected dynamic openssl/zlib dependency: $dep" >&2
      exit 1
    fi
    if [[ "$dep" == */libc++* ]]; then
      install_name_tool -change "$dep" /usr/lib/libc++.1.dylib \
        "$OUT_DIR/tdjson/libtdjson.dylib" || true
    fi
  done < <(otool -L "$OUT_DIR/tdjson/libtdjson.dylib" | awk 'NR>1 {print $1}')
  codesign -s - --force "$OUT_DIR/tdjson/libtdjson.dylib" || true
fi

otool -L "$OUT_DIR/tdjson/libtdjson.dylib" > "$OUT_DIR/tdjson/otool-L.txt" || true
cat "$OUT_DIR/tdjson/otool-L.txt" || true
if otool -L "$OUT_DIR/tdjson/libtdjson.dylib" 2>/dev/null | grep -E 'libssl|libcrypto|libz\.|/opt/homebrew|/usr/local/opt' >/dev/null; then
  echo "error: dylib still dynamically depends on openssl/zlib/homebrew" >&2
  exit 1
fi

{
  echo "platform=macos"
  echo "arch=${ARCH}"
  echo "doc=https://tdlib.github.io/td/build.html"
  echo "official_flow=brew+cmake+prepare_cross_compiling+tdjson"
  echo "linkage=static"
  echo "openssl_prefix=$PREFIX"
  echo "zlib_lib=$ZLIB_LIB"
  echo "note=OpenSSL+zlib merged into libtdjson.dylib"
} > "$OUT_DIR/tdjson/build-info.txt"

file "$OUT_DIR/tdjson/libtdjson.dylib" || true
echo "==> macOS ${ARCH} tdjson ready"
