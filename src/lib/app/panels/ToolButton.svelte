<script lang="ts">
  // A button of the tool column. For a tool with a brush set or a menu (e.g. the tip of a
  // pixel brush), a click also opens them in a popup beside it, towards the canvas (Bits
  // UI); choosing one closes it.

  import { Popover } from "bits-ui";
  import { onDestroy } from "svelte";
  import { popupPadding } from "#lib/app/widgets/popup-padding.js";
  import BrushBrowser from "#lib/app/panels/BrushBrowser.svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import type { Tool, ToolSettings } from "#lib/app/tools/tool.js";
  import { brushSet } from "#lib/mypaint/brush-sets.js";

  let {
    tool,
    active,
    settings,
    side = "right",
    tip,
    run,
  }: {
    tool: Tool;
    active: boolean;
    /** The tool's settings: its menu changes them in place. */
    settings: ToolSettings;
    /** Where the popup opens: towards the canvas. */
    side?: "left" | "right";
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
  } = $props();

  let open = $state(false);

  const Icon = $derived(
    (tool.menu?.iconFollowsChoice &&
      tool.menu.items.find((item) => item.value === settings[tool.menu!.key])?.icon) ||
      tool.icon,
  );

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

{#if tool.brushSet || tool.menu}
  <Popover.Root bind:open>
    <Popover.Trigger
      class={["icon", active && "active"]}
      title={tip(`tool.${tool.id}`)}
      onclick={() => run(`tool.${tool.id}`)}
    >
      <Icon size={16} />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        class={["tool-popup", tool.brushSet && "brushes"]}
        {side}
        align="start"
        sideOffset={8}
        collisionPadding={popupPadding()}
      >
        {#if tool.brushSet}
          <BrushBrowser
            set={brushSet(tool.brushSet)}
            selected={String(settings.preset)}
            onselect={(id) => {
              run("brush.select", { id });
              open = false;
            }}
          />
        {:else if tool.menu}
          {@const menu = tool.menu}
          {#each menu.items as item (item.value)}
            <button
              class="menu-item choice"
              class:active={settings[menu.key] === item.value}
              onclick={() => {
                settings[menu.key] = item.value;
                open = false;
              }}
            >
              <item.icon size={16} fill={item.filledIcon ? "currentColor" : "none"} />
              {item.label}
            </button>
          {/each}
        {/if}
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
  :global(.tool-popup) {
    z-index: 60;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    min-width: 140px;
    max-height: min(560px, var(--bits-floating-available-height));
    padding: calc(var(--space) / 2);
    overflow-y: auto;
    background: var(--popup);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  :global(.tool-popup.brushes) {
    width: 220px;
  }
</style>
