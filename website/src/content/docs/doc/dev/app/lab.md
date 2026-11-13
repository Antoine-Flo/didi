---
title: Lab pages
description: The test pages that measure the tablet input and the performance with large documents.
sidebar:
  order: 28
---

## Purpose

The lab pages are pages for developers, at `/lab`. They measure what the platform really gives: the pen events of the webview and the behavior of the editor with very large documents. They are not a part of the editor.

## Files

| File                                       | Purpose                                                             |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `src/routes/(app)/lab/+page.svelte`        | The list of lab pages.                                              |
| `src/routes/(app)/lab/tablet/+page.svelte` | Tablet: pressure, tilt, sample rate, latency.                       |
| `src/routes/(app)/lab/stress/+page.svelte` | Stress: the real editor with a very large document.                 |
| `src/lib/lab/input-stats.ts`               | `InputStats`: measures the pen samples of one stroke.               |
| `src/lib/lab/tablet-report.ts`             | What the browser supports, and the text report of the tablet page.  |
| `src/lib/lab/ui/`                          | `TabletPanel`: the panel that shows the results of the tablet page. |

## How it works

### Tablet page

The page draws the pen input on a canvas and measures each stroke with `InputStats`. It can receive the events from two sources:

- `"dom"`: the pointer events of the webview.
- `"native"`: the pen events that the Rust side of the desktop app sends (`subscribeNativePen` in `platform/pen.ts`).

For each stroke, the report gives:

| Value                      | Meaning                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `samplesPerEvent`          | The number of samples in one event. A browser can join many samples in one event (coalesced events). |
| `sampleRate`               | Samples for each second, over the stroke.                                                            |
| `pressureLevels`           | The number of different pressure values. A very small number means no real pressure.                 |
| `tiltMax`                  | The largest tilt. Zero means no tilt.                                                                |
| `latencyAvg`, `latencyMax` | The time between the timestamp of the event and its handling.                                        |

`detectSupport` also tells which features the browser has: coalesced events, predicted events, `pointerrawupdate`, altitude and azimuth.

### Stress page

The page makes a large `Drawing` and gives it to the real `EditorApp` (`initial` prop). The URL sets the parameters:

```
/lab/stress?size=4096&layers=10&fill=0.5
```

- `size`: the side of the canvas, in pixels.
- `layers`: the number of layers.
- `fill`: the part of the tiles that have pixels, in each layer.

A full layer of 4096 × 4096 pixels is 64 MB. Twenty full layers are 1.3 GB. This page shows if the editor stays fast and if the memory is sufficient.

## Concepts

### Why measure the webview

The editor runs in a webview: WebKitGTK on Linux, WebView2 on Windows, WKWebView on macOS. Each one gives different pen events. For example, some do not give the pressure, or give fewer samples for each second. The lab pages show what a webview really gives on a real device.

### Why these pages can use Tauri directly

All the other code must use Tauri through `src/lib/platform/`. The ESLint rule ignores `src/routes/(app)/lab/**` (see [Tests and code rules](/doc/dev/app/tests/)). The lab pages need to test the platform directly, for example to copy the report with the clipboard plugin.

## Limits

- The pages have their own simple styles. They do not use the theme.
