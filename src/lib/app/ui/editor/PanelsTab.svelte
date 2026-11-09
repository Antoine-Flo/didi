<script lang="ts">
  // Opens or closes the panels' column: a tab above the tools, against the column or, closed,
  // against the window's edge. When compact, one button per tab: the current color (on a
  // checkerboard if none), and the layers.
  import {
    Layers,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
  } from "@lucide/svelte";
  import type { RGB } from "#lib/core/color/color.js";
  import type { PanelTab } from "#lib/app/ui/panels/PanelColumn.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let {
    compact,
    open,
    tab,
    left,
    sliding,
    hidden,
    color,
    tip,
    ontoggle,
    ontab,
    element = $bindable(),
  }: {
    compact: boolean;
    /** The column is open. */
    open: boolean;
    /** The tab it shows, when compact. */
    tab: PanelTab;
    /** The column is on the left. */
    left: boolean;
    /** The column is opening or closing: the tab follows it. */
    sliding: boolean;
    /** Only the canvas shows. */
    hidden: boolean;
    color: RGB | null;
    tip: (id: string) => string;
    ontoggle: () => void;
    ontab: (tab: PanelTab) => void;
    element?: HTMLElement;
  } = $props();

  /** The compact tab's swatch is outlined with the light or dark most unlike the color:
   *  seen on any canvas. */
  const swatchOutline = $derived.by(() => {
    if (!color) {
      return undefined;
    }
    const [r, g, b] = color;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128
      ? "rgb(0 0 0 / 0.7)"
      : "rgb(255 255 255 / 0.8)";
  });
</script>

{#if compact}
  <div class="panel panels-tab compact" class:left class:sliding class:hidden bind:this={element}>
    <button
      class="icon"
      class:active={open && tab === "color"}
      title={m.editor_color_tab()}
      onclick={() => ontab("color")}
    >
      <span
        class="swatch"
        style:border-color={swatchOutline}
        style:--swatch-color={color ? `rgb(${color[0]} ${color[1]} ${color[2]})` : undefined}
      ></span>
    </button>
    <button
      class="icon"
      class:active={open && tab === "layers"}
      title={m.layers_panel()}
      onclick={() => ontab("layers")}
    >
      <Layers />
    </button>
  </div>
{:else}
  <button
    class="panel panels-tab"
    class:left
    class:sliding
    class:hidden
    title={tip("view.togglePanels")}
    onclick={ontoggle}
    bind:this={element}
  >
    {#if left}
      {#if open}<PanelLeftClose />{:else}<PanelLeftOpen />{/if}
    {:else if open}<PanelRightClose />{:else}<PanelRightOpen />{/if}
  </button>
{/if}

<style>
  /* Above the tool column, in the options' line, as wide as the tools. Above the options'
     panels, which may reach it on a narrow screen (see ToolBar). */
  .panels-tab {
    position: absolute;
    z-index: 1;
    top: var(--content-top);
    right: calc(var(--column-space) + var(--space));
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
    justify-content: center;
    width: var(--tool-column-width);
    height: var(--tabs-height);
    padding: 0;
  }

  /* Two buttons, padded like the tools below. */
  .compact {
    padding: calc(var(--space) / 2);
  }

  /* On a checkerboard, to show that there is no color. */
  .swatch {
    box-sizing: border-box;
    width: calc(var(--control-height) - 6px);
    height: calc(var(--control-height) - 6px);
    /* The color and the checkerboard in the round itself, not in a child it clips: its
       edge stays smooth. */
    background:
      linear-gradient(var(--swatch-color, transparent), var(--swatch-color, transparent)),
      repeating-conic-gradient(var(--field-border) 0 25%, var(--field) 0 50%) 0 0 / 8px 8px;
    background-clip: padding-box;
    border: 1px solid var(--field-border);
    border-radius: 50%;
  }

  /* The hover color over the panel's, which may be see-through. */
  button.panels-tab:hover {
    background: linear-gradient(var(--hover), var(--hover)), var(--panel);
  }

  .left {
    right: auto;
    left: calc(var(--column-space) + var(--space));
  }

  /* Only the canvas (Tab). */
  .hidden {
    visibility: hidden;
  }

  /* Opening or closing: it follows the column. */
  .sliding {
    transition:
      transform 0.2s ease,
      visibility 0.2s,
      left 0.2s ease,
      right 0.2s ease;
  }
</style>
