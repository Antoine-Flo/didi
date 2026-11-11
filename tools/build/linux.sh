#!/usr/bin/env bash
# Builds the Linux AppImage in a container (see linux.Containerfile), on the oldest system
# supported. The output is in src-tauri/target/container/release/bundle/appimage/.
#
#   tools/build/linux.sh                 the store build
#   tools/build/linux.sh --updater       the testers' build, which updates itself: needs
#                                        TAURI_SIGNING_PRIVATE_KEY (and _PASSWORD) set
#
# What follows is passed to `tauri build`, e.g. `--config '{"version":"0.1.0-alpha.2"}'`.
#
# The interface is built here, outside the container: it is the same on every system.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE=didi-build-linux

args=(--bundles appimage --config '{"build":{"beforeBuildCommand":""}}')
if [[ "${1:-}" == "--updater" ]]; then
  shift
  [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]] || {
    echo "TAURI_SIGNING_PRIVATE_KEY is not set (see npx tauri signer generate)" >&2
    exit 1
  }
  args+=(--features updater --config src-tauri/tauri.updater.conf.json)
fi
args+=("$@")

podman build -t "$IMAGE" -f "$ROOT/tools/build/linux.Containerfile" "$ROOT/tools/build"
(cd "$ROOT" && npm run build)

# Rootless podman: the files written belong to the user. The Rust build goes to its own
# folder, as the host's (built on a newer system) can't be reused; the crates are kept
# between builds in a volume.
podman run --rm \
  -v "$ROOT:/work:z" \
  -v didi-cargo-registry:/usr/local/cargo/registry \
  -e CARGO_TARGET_DIR=/work/src-tauri/target/container \
  -e TAURI_SIGNING_PRIVATE_KEY \
  -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD \
  "$IMAGE" \
  npx tauri build "${args[@]}"
