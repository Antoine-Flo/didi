---
title: Lab pages
description: The test pages that measure the tablet input, the rendering and the performance with large documents.
sidebar:
  order: 28
---

## Purpose

The lab pages are pages for developers, at `/lab`. They measure what the platform really gives: the pen events of the webview, the speed of the GPU, the behavior of the editor with very large documents. They are not a part of the editor.

## Files

| File                                       | Purpose                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/routes/(app)/lab/+page.svelte`        | The list of lab pages.                                                          |
| `src/routes/(app)/lab/tablet/+page.svelte` | Tablet: pressure, tilt, sample rate, latency.                                   |
| `src/routes/(app)/lab/stress/+page.svelte` | Stress: the real editor with a very large document.                             |
| `src/routes/(app)/lab/render/+page.svelte` | Rendering: dab stamping with PixiJS, frame time, GPU readback.                  |
| `src/lib/lab/input-stats.ts`               | `InputStats`: measures the pen samples of one stroke.                           |
| `src/lib/lab/tablet-report.ts`             | What the browser supports, and the text report of the tablet page.              |
| `src/lib/lab/frame-stats.ts`               | `FrameStats`: average, 95th percentile and maximum of the last 120 frame times. |
| `src/lib/lab/dabs.ts`                      | `placeDabs`: positions of dabs at a regular spacing along a segment.            |
| `src/lib/lab/dab-batch.ts`                 | `DabBatch`: stamps many dabs into a render texture in one pass.                 |
| `src/lib/lab/readback.ts`                  | `readSync`, `readAsync`: read pixels back from the GPU.                         |
| `src/lib/lab/gpu-info.ts`                  | The name of the GPU and the maximum texture size.                               |
| `src/lib/lab/ui/`                          | `TabletPanel`, `RenderPanel`: the panels that show the results.                 |

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

### Rendering page

This page tests GPU stamping with PixiJS: each dab is a sprite with a soft round texture, and `DabBatch` renders all the dabs of a frame into a render texture in one pass. `FrameStats` measures the frame times.

The page also measures **readback**: the copy of pixels from the GPU to the CPU.

- `readSync` calls `gl.readPixels`. The main thread waits until the GPU finishes all its work. After a stroke, this wait can be long.
- `readAsync` copies the pixels into a GPU buffer (`PIXEL_PACK_BUFFER`) and puts a fence (`fenceSync`). Then it checks the fence once for each frame. When the GPU signals the fence, it copies the buffer to the CPU (`getBufferSubData`). The main thread does not wait for the GPU.

The result shows the blocked time and the total time for each method and zone size.

## Concepts

### Why measure the webview

The editor runs in a webview: WebKitGTK on Linux, WebView2 on Windows, WKWebView on macOS. Each one gives different pen events. For example, some do not give the pressure, or give fewer samples for each second. The lab pages show what a webview really gives on a real device.

### Why these pages can use Tauri directly

All the other code must use Tauri through `src/lib/platform/`. The ESLint rule ignores `src/routes/(app)/lab/**` (see [Tests and code rules](/doc/dev/app/tests/)). The lab pages need to test the platform directly, for example to copy the report with the clipboard plugin.

## Limits

- The editor does not use the dab stamping of the render page. Painting uses libmypaint (see the Painting section).
- The pages have their own simple styles. They do not use the theme.
