<script lang="ts">
  // A button of the tool column. For a tool with a brush set or a menu (e.g. the tip of a
  // pixel brush), a click also opens them in a popup beside it, towards the canvas (Bits
  // UI); choosing one closes it. The button of a group (see tool-groups.ts) shows one of its
  // tools; its popup lists the group's tools instead, or their choices (a filled rectangle).

  import { Popover } from "bits-ui";
  import { onDestroy } from "svelte";
  import { popupPadding } from "#lib/app/widgets/popup-padding.js";
  import BrushBrowser from "#lib/app/panels/BrushBrowser.svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import type { Tool, ToolSettings } from "#lib/app/tools/tool.js";
  import { brushSet } from "#lib/mypaint/brush-sets.js";
  import { m } from "#lib/paraglide/messages.js";

  /** A group's button: its title, its tools and their settings (changed by its choices). */
  interface ToolGroupButton {
    title: string;
    tools: Tool[];
    settings: Record<string, ToolSettings>;
  }

  let {
    tool,
    group,
    active,
    settings,
    side = "right",
    tip,
    run,
  }: {
    tool: Tool;
    /** The tools of the button's group, `tool` among them, if it is a group's. */
    group?: ToolGroupButton;
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

{#snippet brushes(set: string)}
  <BrushBrowser
    set={brushSet(set)}
    selected={String(settings.preset)}
    onselect={(id) => {
      run("brush.select", { id });
      open = false;
    }}
  />
{/snippet}

<!-- One line per tool of the group, or per choice of its menu (e.g. a filled rectangle). -->
{#snippet groupList(group: ToolGroupButton)}
  {#each group.tools as t (t.id)}
    {#if t.menu && !t.brushSet}
      {@const menu = t.menu}
      {#each menu.items as item (item.value)}
        <button
          class="menu-item choice"
          class:active={t.id === tool.id && settings[menu.key] === item.value}
          onclick={() => {
            group.settings[t.id][menu.key] = item.value;
            run(`tool.${t.id}`);
            open = false;
          }}
        >
          <item.icon fill={item.filledIcon ? "currentColor" : "none"} />
          {item.toolTitle ?? t.title}
        </button>
      {/each}
    {:else}
      <button
        class="menu-item choice"
        class:active={t.id === tool.id}
        onclick={() => {
          run(`tool.${t.id}`);
          // A brush stays open: its brushes are beside.
          if (!t.brushSet) open = false;
        }}
      >
        <t.icon />
        {t.title}
      </button>
    {/if}
  {/each}
{/snippet}

{#if tool.brushSet || tool.menu || group}
  <Popover.Root bind:open>
    <Popover.Trigger
      class={["icon", active && "active", "has-popup"]}
      title={group
        ? m.tool_button_group_tip({ group: group.title, tip: tip(`tool.${tool.id}`) })
        : tip(`tool.${tool.id}`)}
      onclick={() => run(`tool.${tool.id}`)}
    >
      <Icon />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        class={["tool-popup", tool.brushSet && "brushes", group && tool.brushSet && "two-panes"]}
        {side}
        align="start"
        sideOffset={8}
        collisionPadding={popupPadding()}
      >
        {#if group && tool.brushSet}
          <!-- Two panes: the group's brushes like tabs, and the current one's brushes. -->
          <div class="panes">
            <div class="tabs" role="group" aria-label={group.title}>
              {@render groupList(group)}
            </div>
            <div class="pane">
              {@render brushes(tool.brushSet)}
            </div>
          </div>
        {:else if group}
          {@render groupList(group)}
        {:else if tool.brushSet}
          {@render brushes(tool.brushSet)}
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
              <item.icon fill={item.filledIcon ? "currentColor" : "none"} />
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
    <tool.icon />
  </button>
{/if}

<style>
  :global(.tool-popup) {
    z-index: 60;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    min-width: calc(140px * var(--ui-scale));
    max-height: min(560px * var(--ui-scale), var(--bits-floating-available-height));
    padding: calc(var(--space) / 2);
    overflow-y: auto;
    background: var(--popup);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  /* A small corner: the button opens a popup (more tools, brushes or choices). */
  :global(.icon.has-popup) {
    position: relative;
  }

  :global(.icon.has-popup::after) {
    content: "";
    position: absolute;
    right: 2px;
    bottom: 2px;
    border: 2px solid transparent;
    border-right-color: var(--text-faint);
    border-bottom-color: var(--text-faint);
  }

  :global(.tool-popup.brushes) {
    width: calc(220px * var(--ui-scale));
  }

  /* Taller, each pane scrolling on its own: comfortable with a finger. As wide as its
     names, within the room beside the button. */
  :global(.tool-popup.two-panes) {
    width: max-content;
    max-width: min(420px * var(--ui-scale), var(--bits-floating-available-width));
    padding-right: var(--space);
    height: min(480px * var(--ui-scale), var(--bits-floating-available-height));
    overflow: hidden;
  }

  .panes {
    display: grid;
    flex: 1;
    /* The brushes' names shorten (…) rather than overflow, when room is short. */
    grid-template-columns: auto minmax(0, 1fr);
    gap: calc(var(--space) / 2);
    min-height: 0;
  }

  .tabs,
  .pane {
    min-height: 0;
    overflow-y: auto;
  }

  /* As wide as the brushes' popup of a single tool, less if the room is short. */
  .pane {
    width: calc(220px * var(--ui-scale));
    max-width: 100%;
  }

  .tabs {
    display: flex;
    flex-direction: column;
    padding-right: calc(var(--space) / 2);
    border-right: 1px solid var(--border);
  }
</style>
