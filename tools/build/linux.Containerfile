# The system the Linux build is made on: the oldest one supported, so that the app runs on it
# and everything newer (a build on a newer system needs its newer glibc). Ubuntu 22.04 is the
# oldest with WebKitGTK 4.1, which Tauri 2 needs. Used by tools/build/linux.sh.
FROM docker.io/library/ubuntu:22.04

# The same major version as .nvmrc.
ARG NODE_VERSION=26.13.0

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl file wget xz-utils \
    libwebkit2gtk-4.1-dev libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev \
    patchelf \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
  | tar -xJ -C /usr/local --strip-components=1

ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable

# The AppImage tools are AppImages themselves: without FUSE in a container, they unpack first.
ENV APPIMAGE_EXTRACT_AND_RUN=1
WORKDIR /work
