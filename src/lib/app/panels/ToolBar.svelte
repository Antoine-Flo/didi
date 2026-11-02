<script lang="ts">
  // The bar above the canvas: the active tool's options.

  import Slider from "#lib/app/widgets/Slider.svelte";
  import {
    sizeFromSlider,
    sliderFromSize,
    type Tool,
    type ToolSettings,
  } from "#lib/app/tools/tool.js";

  let {
    tool,
    settings,
  }: {
    tool: Tool;
    /** The tool's settings, changed in place by the controls. */
    settings: ToolSettings;
  } = $props();
</script>

<div class="panel toolbar">
  <div class="options">
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
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 0 calc(var(--space) / 2);
  }

  .options {
    display: flex;
    align-items: center;
    gap: calc(var(--space) * 2);
    padding: 0 var(--space);
  }

  /* A fixed width: the bar does not change size while a value changes. */
  .options :global(.slider) {
    width: 220px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
    white-space: nowrap;
  }
</style>
