#!/usr/bin/env bash
# Builds libmypaint for WebAssembly into src/lib/mypaint/libmypaint.mjs.
#
# Requires Emscripten (https://emscripten.org): `source ~/emsdk/emsdk_env.sh` first.
# The output is committed, so only needed when changing this folder.
set -euo pipefail

VERSION=1.6.1
SHA256=741754f293f6b7668f941506da07cd7725629a793108bb31633fb6c3eae5315f
URL="https://github.com/mypaint/libmypaint/releases/download/v$VERSION/libmypaint-$VERSION.tar.xz"

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/didi/libmypaint"
SRC="$CACHE/libmypaint-$VERSION"
OUT="$ROOT/src/lib/mypaint/libmypaint.mjs"

command -v emcc > /dev/null || { echo "emcc not found: source ~/emsdk/emsdk_env.sh" >&2; exit 1; }

# Download and verify the release tarball.
mkdir -p "$CACHE"
if [ ! -d "$SRC" ]; then
  curl -sSL -o "$CACHE/libmypaint.tar.xz" "$URL"
  echo "$SHA256  $CACHE/libmypaint.tar.xz" | sha256sum -c --quiet
  tar -xf "$CACHE/libmypaint.tar.xz" -C "$CACHE"
fi

# Quoted includes look next to the source first: replace the autotools config.h there.
cp "$HERE/shim/config.h" "$SRC/config.h"

SOURCES=(
  brushmodes.c fifo.c helpers.c mypaint.c mypaint-brush.c mypaint-brush-settings.c
  mypaint-mapping.c mypaint-matrix.c mypaint-rectangle.c mypaint-surface.c
  mypaint-symmetry.c mypaint-tiled-surface.c operationqueue.c rng-double.c tilemap.c
)

EXPORTS=(
  _malloc _free
  _didi_surface_new _didi_surface_destroy _didi_surface_clear _didi_surface_take_dirty
  _didi_surface_tile _didi_stroke_to _didi_seed
  _mypaint_brush_new_with_buckets _mypaint_brush_unref _mypaint_brush_from_defaults _mypaint_brush_reset
  _mypaint_brush_new_stroke _mypaint_brush_set_base_value _mypaint_brush_get_base_value
  _mypaint_brush_set_mapping_n _mypaint_brush_set_mapping_point
  _mypaint_brush_setting_from_cname _mypaint_brush_input_from_cname
)

mkdir -p "$(dirname "$OUT")"
# shim/ provides json.h (stand-in for json-c).
emcc -O3 \
  -I "$HERE/shim" -I "$SRC" \
  "${SOURCES[@]/#/$SRC/}" "$HERE/didi-surface.c" \
  -o "$OUT" \
  -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createLibMyPaint \
  -sENVIRONMENT=web,node -sSINGLE_FILE -sALLOW_MEMORY_GROWTH \
  -sEXPORTED_FUNCTIONS="$(IFS=,; echo "${EXPORTS[*]}")" \
  -sEXPORTED_RUNTIME_METHODS=stringToNewUTF8,HEAPU16,HEAP32,HEAPF32

echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
