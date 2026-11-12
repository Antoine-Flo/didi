---
title: Updates
description: How a desktop build finds, downloads and installs a new version.
sidebar:
  order: 4
---

## Purpose

Some desktop builds update themselves. `src/lib/platform/updater.ts` finds a newer version, downloads it and installs it. A browser always loads the latest version, thus it does not need this.

## Files

| File                                | Purpose                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `src/lib/platform/updater.ts`       | `findUpdate`, `restartApp`.                                  |
| `src/lib/platform/fake-update.ts`   | A pretend update, for development.                           |
| `src-tauri/src/lib.rs`              | The `updates_enabled` command, the updater plugins.          |
| `src-tauri/Cargo.toml`              | The `updater` feature.                                       |
| `src-tauri/tauri.updater.conf.json` | The updater configuration: public key, address, permissions. |

## Concepts

### A Cargo feature

A Cargo **feature** is an option of the Rust build. The `updater` feature adds two optional dependencies: `tauri-plugin-updater` and `tauri-plugin-process`. A build without this feature does not contain the updater code at all.

```rust
// src-tauri/src/lib.rs
#[tauri::command]
fn updates_enabled() -> bool {
    cfg!(feature = "updater")
}
```

`cfg!` is true or false at compile time. Thus, JavaScript asks Rust if this build has the updater.

### Signed updates

`tauri.updater.conf.json` contains a **public key**. Each update has a signature, made with the matching private key. The plugin refuses an update with an incorrect signature. Thus, a person who controls the download server cannot install a different program.

The file also adds the permissions `updater:default` and `process:allow-restart` for the `main` window. A build with the updater uses this file as a second configuration: `--features updater --config src-tauri/tauri.updater.conf.json`.

## How it works

`findUpdate()`:

1. In development with `npm run dev:fake-update`, it returns a fake update.
2. In a browser, or if `updates_enabled` is false, it returns `null`.
3. Else it calls `check()` of the plugin. The plugin reads a JSON file at the address of the configuration and compares the versions.
4. It returns an `AvailableUpdate`: the version, the current version, the notes, and two functions.

`download(onProgress)` gives the progress from 0 to 1. The plugin sends a `Started` event with the total length, then `Progress` events with the length of each part. If the server does not give the total length, the progress is `null`.

`install()` installs the downloaded version. On Windows, the app stops and the installer runs. `restartApp()` starts the app again.

### The fake update

`fake-update.ts` is active only when `import.meta.env.DEV` is true and `VITE_DIDI_FAKE_UPDATE` is set. Vite replaces these values at build time. Thus, a production build removes this code. The fake download takes 3 seconds, the install does nothing, and the restart reloads the page.

## Limits

- Builds without the `updater` feature do not update themselves.
