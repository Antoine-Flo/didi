<script lang="ts">
  // The bar above the canvas: import and history on the left, the active tool's options in
  // the middle, the view (zoom, rotation) on the right. Every button runs a command.

  import {
    Compass,
    ImagePlus,
    Maximize,
    Redo2,
    RotateCcw,
    RotateCw,
    Undo2,
    ZoomIn,
    ZoomOut,
  } from "@lucide/svelte";
  import Slider from "#lib/app/widgets/Slider.svelte";
  import {
    sizeFromSlider,
    sliderFromSize,
    MAX_PIXEL_SIZE,
    type ToolId,
    type ToolOptions,
  } from "#lib/app/canvas/tools.js";
  import type { Camera } from "#lib/render/camera.js";

  let {
    tool,
    options = $bindable(),
    camera,
    tip,
    run,
    enabled,
  }: {
    tool: ToolId;
    /** The tools' settings, changed in place by the sliders. */
    options: ToolOptions;
    camera: Camera;
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
    enabled: (id: string) => boolean;
  } = $props();

  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
</script>

<div class="panel toolbar">
  <div class="group">
    <button class="icon" title={tip("file.importImage")} onclick={() => run("file.importImage")}
      ><ImagePlus size={16} /></button
    >

    <button
      class="icon"
      title={tip("history.undo")}
      disabled={!enabled("history.undo")}
      onclick={() => run("history.undo")}
    >
      <Undo2 size={16} />
    </button>
    <button
      class="icon"
      title={tip("history.redo")}
      disabled={!enabled("history.redo")}
      onclick={() => run("history.redo")}
    >
      <Redo2 size={16} />
    </button>
  </div>

  <div class="group options">
    {#if tool === "brush" || tool === "eraser"}
      {@const settings = tool === "brush" ? options.brush : options.eraser}
      <Slider
        label="Size"
        min={0}
        max={1}
        step={0.001}
        value={sliderFromSize(settings.size)}
        display="{settings.size} px"
        oninput={(v) => (settings.size = sizeFromSlider(v))}
      />
      <Slider
        label="Opacity"
        value={settings.opacity}
        display="{Math.round(settings.opacity * 100)}%"
        oninput={(v) => (settings.opacity = v)}
      />
    {:else if tool === "pixel"}
      <Slider
        label="Size"
        min={1}
        max={MAX_PIXEL_SIZE}
        step={1}
        value={options.pixel.size}
        display="{options.pixel.size} px"
        oninput={(v) => (options.pixel.size = v)}
      />
      <Slider
        label="Opacity"
        value={options.pixel.opacity}
        display="{Math.round(options.pixel.opacity * 100)}%"
        oninput={(v) => (options.pixel.opacity = v)}
      />
      <label class="check" title="Removes L-shaped corners (1 px brush)">
        <input type="checkbox" bind:checked={options.pixel.pixelPerfect} /> Pixel-perfect
      </label>
    {:else}
      <span class="hint">Click on the canvas to pick a color.</span>
    {/if}
  </div>

  <div class="group">
    <button class="icon" title={tip("view.zoomOut")} onclick={() => run("view.zoomOut")}
      ><ZoomOut size={16} /></button
    >

    <button class="zoom" title={tip("view.actualSize")} onclick={() => run("view.actualSize")}
      >{Math.round(camera.zoom * 100)}%</button
    >

    <button class="icon" title={tip("view.zoomIn")} onclick={() => run("view.zoomIn")}
      ><ZoomIn size={16} /></button
    >

    <button class="icon" title={tip("view.fit")} onclick={() => run("view.fit")}
      ><Maximize size={16} /></button
    >

    <button class="icon" title={tip("view.rotateLeft")} onclick={() => run("view.rotateLeft")}
      ><RotateCcw size={16} /></button
    >

    <button class="icon" title={tip("view.rotateRight")} onclick={() => run("view.rotateRight")}
      ><RotateCw size={16} /></button
    >

    <button
      class="icon"
      title="{tip('view.resetRotation')} · {degrees(camera.rotation)}°"
      onclick={() => run("view.resetRotation")}
    >
      <Compass size={16} />
    </button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space);
    height: 100%;
    padding: 0 calc(var(--space) / 2);
  }

  .group {
    display: flex;
    align-items: center;
    flex: none;
  }

  .options {
    flex: 1;
    gap: calc(var(--space) * 2);
    min-width: 0;
    padding: 0 var(--space);
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }

  .options :global(.slider) {
    flex: 1;
    max-width: 240px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
    white-space: nowrap;
  }

  .zoom {
    width: 4.5em;
    padding: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
