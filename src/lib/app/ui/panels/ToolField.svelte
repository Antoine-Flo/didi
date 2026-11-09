<script lang="ts">
  // One control of a tool's options, changing one of its settings in place: in the options'
  // bar, or in the tool's popup when compact (see ToolBar and ToolButton).

  import Segmented from "#lib/app/ui/widgets/Segmented.svelte";
  import Slider from "#lib/app/ui/widgets/Slider.svelte";
  import {
    sizeFromSlider,
    sliderFromSize,
    type ToolField,
    type ToolSettings,
  } from "#lib/app/tools/tool.js";
  import { m } from "#lib/paraglide/messages.js";

  let { field, settings }: { field: ToolField; settings: ToolSettings } = $props();

  const value = $derived(settings[field.key]);
</script>

{#if field.kind === "size" && typeof value === "number"}
  <Slider
    label={field.label}
    min={0}
    max={1}
    step={0.001}
    value={sliderFromSize(value)}
    display={m.toolbar_size_px({ size: value })}
    oninput={(v) => (settings[field.key] = sizeFromSlider(v))}
  />
{:else if field.kind === "integer" && typeof value === "number"}
  <Slider
    label={field.label}
    min={field.min}
    max={field.max}
    step={1}
    {value}
    display={field.unit ? m.toolbar_value_unit({ value, unit: field.unit }) : `${value}`}
    oninput={(v) => (settings[field.key] = v)}
  />
{:else if field.kind === "percent" && typeof value === "number"}
  <Slider
    label={field.label}
    {value}
    display={m.toolbar_percent({ percent: Math.round(value * 100) })}
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

<style>
  .check {
    display: flex;
    flex: none;
    align-items: center;
    gap: calc(var(--space) / 2);
    white-space: nowrap;
  }
</style>
