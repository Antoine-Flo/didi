<script lang="ts">
  // The active tool's options, in the title bar, and after them actions on the document. When
  // compact, only the sliders: the other options are in the tool's popup (see ToolButton), the
  // actions at the bottom (see EditorApp). It tells how much room it lacks, for the menus to
  // make room (see EditorApp).

  import type { Snippet } from "svelte";
  import ToolField from "#lib/app/ui/panels/ToolField.svelte";
  import {
    isSliderField,
    type ColorPreview,
    type Tool,
    type ToolSettings,
  } from "#lib/app/tools/tool.js";

  let {
    tool,
    settings,
    preview,
    actions,
    compact = false,
    onlacking,
  }: {
    tool: Tool;
    /** The tool's settings, changed in place by the controls. */
    settings: ToolSettings;
    /** The color of the swatch, for tools that have one (see Tool.preview). */
    preview?: ColorPreview | null;
    /** On the right, whatever the tool. Coming and going, they don't move the options. */
    actions?: Snippet;
    /** Only the sliders. */
    compact?: boolean;
    /** How many pixels the options lack to show whole, the sliders at their smallest. */
    onlacking?: (pixels: number) => void;
  } = $props();

  // Measured again when the bar changes size, or what is in it (another tool, an action).
  let options: HTMLElement;
  $effect(() => {
    const measure = () => onlacking?.(Math.max(0, options.scrollWidth - options.clientWidth));
    const resizes = new ResizeObserver(measure);
    resizes.observe(options);
    const changes = new MutationObserver(measure);
    changes.observe(options, { childList: true, subtree: true });
    return () => {
      resizes.disconnect();
      changes.disconnect();
    };
  });

  const sliders = $derived((tool.fields ?? []).filter(isSliderField));
  const rest = $derived((tool.fields ?? []).filter((field) => !isSliderField(field)));
</script>

<div class="toolbar" class:compact>
  <div class="options" bind:this={options}>
    <!-- Not when compact: the panels' tab shows the color. -->
    {#if preview && !compact}
      <span class="swatch" aria-hidden="true">
        {#if preview.color}
          {@const [r, g, b] = preview.color}
          <span style:background="rgb({r} {g} {b} / {preview.opacity})"></span>
        {/if}
      </span>
    {/if}
    {#each sliders as field (field.key)}
      <ToolField {field} {settings} />
    {/each}
    {#if !compact}
      {#each rest as field (field.key)}
        <ToolField {field} {settings} />
      {/each}
      <div class="actions">{@render actions?.()}</div>
    {/if}
    {#if !tool.fields?.length && tool.hint}
      <span class="hint">{tool.hint}</span>
    {/if}
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
    overflow: hidden;
  }

  .actions {
    display: flex;
    gap: var(--space);
  }

  .actions:empty {
    display: none;
  }

  .actions :global(*) {
    white-space: nowrap;
  }

  .hint {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* A fixed width: the bar does not change size while a value changes. Short of room, the
     sliders shrink, not below what keeps their label and value readable. */
  .options :global(.slider) {
    flex: 0 1 auto;
    width: calc(180px * var(--ui-scale));
    min-width: calc(120px * var(--ui-scale));
  }

  /* Compact (down to a phone): narrower still. */
  .compact :global(.slider) {
    min-width: calc(90px * var(--ui-scale));
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
</style>
