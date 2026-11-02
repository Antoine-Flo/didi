<script lang="ts">
  // The bar above the canvas: the mode, import and history on the left, the active tool's
  // options in the middle, the view (zoom, rotation) on the right. Every button runs a
  // command.

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
    type Tool,
    type ToolSettings,
  } from "#lib/app/tools/tool.js";
  import type { Mode } from "#lib/app/modes/mode.js";
  import type { Camera } from "#lib/render/camera.js";

  let {
    modes,
    mode,
    tool,
    settings,
    camera,
    tip,
    run,
    enabled,
  }: {
    modes: Mode[];
    /** Id of the current mode. */
    mode: string;
    tool: Tool;
    /** The tool's settings, changed in place by the controls. */
    settings: ToolSettings;
    camera: Camera;
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
    enabled: (id: string) => boolean;
  } = $props();

  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
</script>

<div class="panel toolbar">
  <div class="group modes" role="radiogroup" aria-label="Mode">
    {#each modes as m (m.id)}
      {@const Icon = m.icon}
      <button
        class:active={m.id === mode}
        role="radio"
        aria-checked={m.id === mode}
        title={tip(`mode.${m.id}`)}
        onclick={() => run(`mode.${m.id}`)}
      >
        <Icon size={16} />
        {m.title}
      </button>
    {/each}
  </div>

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
    {#each tool.fields ?? [] as field (field.key)}
      {@const value = settings[field.key]}
      {#if field.kind === "size" && typeof value === "number"}
        <Slider
          label={field.label}
          min={0}
          max={1}
          step={0.001}
          value={sliderFromSize(value)}
          display="{value} px"
          oninput={(v) => (settings[field.key] = sizeFromSlider(v))}
        />
      {:else if field.kind === "integer" && typeof value === "number"}
        <Slider
          label={field.label}
          min={field.min}
          max={field.max}
          step={1}
          {value}
          display={field.unit ? `${value} ${field.unit}` : `${value}`}
          oninput={(v) => (settings[field.key] = v)}
        />
      {:else if field.kind === "percent" && typeof value === "number"}
        <Slider
          label={field.label}
          {value}
          display="{Math.round(value * 100)}%"
          oninput={(v) => (settings[field.key] = v)}
        />
      {:else if field.kind === "toggle" && typeof value === "boolean"}
        <label class="check" title={field.title}>
          <input
            type="checkbox"
            checked={value}
            onchange={(e) => (settings[field.key] = e.currentTarget.checked)}
          />
          {field.label}
        </label>
      {/if}
    {:else}
      {#if tool.hint}<span class="hint">{tool.hint}</span>{/if}
    {/each}
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

  .modes {
    gap: 2px;
    padding: 2px;
    background: var(--field);
    border-radius: var(--radius);
  }

  .modes button {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
    white-space: nowrap;
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
