<script lang="ts">
  // The bar above the canvas: the active tool's options, and on the side, actions on the document.

  import type { Snippet } from "svelte";
  import Segmented from "#lib/app/widgets/Segmented.svelte";
  import Slider from "#lib/app/widgets/Slider.svelte";
  import {
    sizeFromSlider,
    sliderFromSize,
    type ColorPreview,
    type Tool,
    type ToolSettings,
  } from "#lib/app/tools/tool.js";

  let {
    tool,
    settings,
    preview,
    actions,
    bare = false,
    wrap = false,
    wrapSide = "right",
    onoverflow,
  }: {
    tool: Tool;
    /** The tool's settings, changed in place by the controls. */
    settings: ToolSettings;
    /** The color of the swatch, for tools that have one (see Tool.preview). */
    preview?: ColorPreview | null;
    /** On the right, whatever the tool. Coming and going, they don't move the options. */
    actions?: Snippet;
    /** Without its panel's background and border: inside another bar (the title bar). */
    bare?: boolean;
    /** On several lines if need be, centered: a line of its own on a narrow screen. */
    wrap?: boolean;
    /** Wrapped, the side of the next lines: away from the panels' tab. */
    wrapSide?: "left" | "right";
    /** How much wider the options would need to be to fit, in pixels: 0 if they fit. */
    onoverflow?: (pixels: number) => void;
  } = $props();

  type Field = NonNullable<Tool["fields"]>[number];
  const isSlider = (field: Field) =>
    field.kind === "size" || field.kind === "integer" || field.kind === "percent";
  const sliders = $derived((tool.fields ?? []).filter(isSlider));
  const rest = $derived((tool.fields ?? []).filter((field) => !isSlider(field)));

  let optionsElement: HTMLElement;
  let optionsWidth = $state(0);
  $effect(() => {
    void optionsWidth;
    void tool;
    void preview;
    onoverflow?.(Math.max(0, optionsElement.scrollWidth - optionsElement.clientWidth));
  });
</script>

{#snippet control(field: Field)}
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
  {:else if field.kind === "choice" && typeof value === "string"}
    <Segmented
      label={field.label}
      {value}
      choices={field.choices}
      onselect={(v) => (settings[field.key] = v)}
    />
  {/if}
{/snippet}

<!-- Wrapped (a narrow screen), each group is a panel of its own, as wide as its content: the
     sliders together, never broken, then each of the other controls and the actions, beside
     or below, against the side away from the panels' tab. -->
<div class="toolbar" class:panel={!bare && !wrap} class:wrap class:wrap-left={wrapSide === "left"}>
  <div class="options" bind:this={optionsElement} bind:clientWidth={optionsWidth}>
    <div class="group sliders" class:panel={wrap}>
      <!-- Not when wrapped: a narrow screen, where the panels' tab shows the color. -->
      {#if preview && !wrap}
        <span class="swatch" aria-hidden="true">
          {#if preview.color}
            {@const [r, g, b] = preview.color}
            <span style:background="rgb({r} {g} {b} / {preview.opacity})"></span>
          {/if}
        </span>
      {/if}
      {#each sliders as field (field.key)}
        {@render control(field)}
      {/each}
    </div>
    {#each rest as field (field.key)}
      <div class="group" class:panel={wrap}>{@render control(field)}</div>
    {:else}
      {#if !tool.fields?.length && tool.hint}
        <div class="group" class:panel={wrap}><span class="hint">{tool.hint}</span></div>
      {/if}
    {/each}
    <div class="group actions" class:panel={wrap}>{@render actions?.()}</div>
  </div>
</div>

<style>
  /* The options, then the actions: as wide as they are, nothing more. */
  .toolbar {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 calc(var(--space) / 2);
  }

  .options {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: calc(var(--space) * 2);
    min-width: 0;
    /* Room for the focus outline, which the clipping would hide. */
    padding: 2px var(--space);
    /* Too narrow for the sliders' smallest, for a moment: the bar then moves (see EditorApp). */
    overflow: hidden;
  }

  /* On one line, the groups are not boxes. */
  .group {
    display: contents;
  }

  .actions :global(*) {
    white-space: nowrap;
  }

  /* Wrapped: no bar, a panel per group, the window's gutter between them, each as high as
     the bar. The sliders, first, are centered on their line. */
  .toolbar.wrap {
    height: auto;
    padding: 0;
    pointer-events: none;
  }

  .wrap .options {
    flex: 1;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space);
    padding: 0;
    overflow: visible;
  }

  .wrap-left .options {
    justify-content: flex-start;
  }

  .wrap .group {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: var(--space);
    box-sizing: border-box;
    min-width: 0;
    /* As high as the bar, whatever they hold (a checkbox is lower than a button). */
    height: var(--bar-height);
    padding: 0 calc(var(--space) / 2);
    pointer-events: auto;
  }

  .wrap .sliders {
    margin: 0 auto;
  }

  .wrap .group:not(:has(*)) {
    display: none;
  }

  /* A fixed width: the bar does not change size while a value changes. Short of room, the
     sliders shrink, not below what keeps their label and value readable. */
  .options :global(.slider) {
    flex: 0 1 auto;
    width: calc(180px * var(--ui-scale));
    min-width: calc(120px * var(--ui-scale));
  }

  /* On a checkerboard, to show the opacity, or that there is no color. */
  .swatch {
    flex: none;
    width: calc(var(--control-height) - 4px);
    height: calc(var(--control-height) - 4px);
    overflow: hidden;
    background: repeating-conic-gradient(var(--field-border) 0 25%, var(--field) 0 50%) 0 0 / 8px
      8px;
    border-radius: var(--radius);
  }

  .swatch span {
    display: block;
    width: 100%;
    height: 100%;
  }

  .check {
    display: flex;
    flex: none;
    align-items: center;
    gap: calc(var(--space) / 2);
    white-space: nowrap;
  }
</style>
