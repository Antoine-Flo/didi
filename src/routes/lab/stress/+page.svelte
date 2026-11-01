<script lang="ts">
  // Stress test: a large drawing with many layers, opened in the regular editor.
  // Parameters: ?size=4096&layers=10&fill=0.5 (fraction of tiles filled per layer).
  import { page } from "$app/state";
  import EditorApp from "#lib/app/EditorApp.svelte";
  import { Drawing } from "#lib/core/document/drawing.js";
  import { Editor } from "#lib/core/editor/editor.js";
  import { TILE_SIZE } from "#lib/core/document/tiles.js";

  const params = page.url.searchParams;
  const size = Number(params.get("size") ?? 4096);
  const layerCount = Number(params.get("layers") ?? 10);
  const fill = Number(params.get("fill") ?? 0.5);

  const drawing = new Drawing(size, size);
  const start = performance.now();
  for (let l = 0; l < layerCount; l++) {
    const layer = drawing.createLayer({ name: `Stress ${l + 1}` });
    drawing.addLayer(layer);
    const hue = (l * 47) % 360;
    for (let ty = 0; ty < Math.ceil(size / TILE_SIZE); ty++) {
      for (let tx = 0; tx < Math.ceil(size / TILE_SIZE); tx++) {
        if (Math.random() >= fill) continue;
        const rect = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE };
        drawing.writePixels(layer.id, rect, tileData(hue, tx, ty));
      }
    }
  }
  const generatedIn = Math.round(performance.now() - start);

  const editor = new Editor(drawing);

  /** Semi-transparent diagonal stripes, premultiplied. */
  function tileData(hue: number, tx: number, ty: number): Uint8ClampedArray {
    const [r, g, b] = hsl(hue, 0.6, 0.5);
    const data = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const a = ((x + y + tx * 7 + ty * 13) >> 4) % 2 ? 200 : 60;
        const i = (y * TILE_SIZE + x) * 4;
        data[i] = Math.round((r * a) / 255);
        data[i + 1] = Math.round((g * a) / 255);
        data[i + 2] = Math.round((b * a) / 255);
        data[i + 3] = a;
      }
    }
    return data;
  }

  function hsl(h: number, s: number, l: number): [number, number, number] {
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }
</script>

<svelte:head><title>Stress {size} × {layerCount} ({generatedIn} ms)</title></svelte:head>

<EditorApp initial={editor} />
