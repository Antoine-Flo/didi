<script lang="ts">
  // A button of the tool column. For a tool with a brush set, a click also opens its brushes
  // in a popup beside it, towards the canvas (Bits UI); choosing one closes it.

  import { Popover } from "bits-ui";
  import { onDestroy } from "svelte";
  import BrushBrowser from "#lib/app/panels/BrushBrowser.svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import type { Tool } from "#lib/app/tools/tool.js";
  import { brushSet } from "#lib/mypaint/brush-sets.js";

  let {
    tool,
    active,
    preset,
    side = "right",
    tip,
    run,
  }: {
    tool: Tool;
    active: boolean;
    /** The tool's current brush, for tools with a brush set. */
    preset?: string;
    /** Where the brushes open: towards the canvas. */
    side?: "left" | "right";
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
  } = $props();

  let open = $state(false);

  // While open, a click on the canvas only closes it.
  let shown = false;
  $effect(() => {
    if (open === shown) return;
    shown = open;
    if (open) popupOpened();
    else popupClosed();
  });
  // Removed while open (e.g. the mode changes): the canvas must not stay blocked.
  onDestroy(() => {
    if (shown) popupClosed();
  });
</script>

{#if tool.brushSet}
  <Popover.Root bind:open>
    <Popover.Trigger
      class={["icon", active && "active"]}
      title={tip(`tool.${tool.id}`)}
      onclick={() => run(`tool.${tool.id}`)}
    >
      <tool.icon size={16} />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content class="brush-popup" {side} sideOffset={8} collisionPadding={8}>
        <BrushBrowser
          set={brushSet(tool.brushSet)}
          selected={preset ?? ""}
          onselect={(id) => {
            run("brush.select", { id });
            open = false;
          }}
        />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
{:else}
  <button
    class="icon"
    class:active
    title={tip(`tool.${tool.id}`)}
    onclick={() => run(`tool.${tool.id}`)}
  >
    <tool.icon size={16} />
  </button>
{/if}

<style>
  :global(.brush-popup) {
    z-index: 60;
    box-sizing: border-box;
    width: 220px;
    max-height: min(560px, var(--bits-floating-available-height));
    padding: calc(var(--space) / 2);
    overflow-y: auto;
    background: var(--popup);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
</style>
