<script lang="ts">
  // A button of the tool column. For a tool with a menu (e.g. the tip of the pixel brush), a
  // click also opens it in a popup beside it, towards the canvas (Bits
  // UI); choosing one closes it. The button of a group (see tool-groups.ts) shows one of its
  // tools; its popup lists the group's tools instead, or their choices (a filled rectangle).
  // When compact, the popup also holds the tool's options other than its sliders (e.g.
  // Pixel-perfect), and it only opens when the button is touched again, its tool already
  // active (like Procreate): changing tools doesn't cover the canvas.

  import { Popover } from "bits-ui";
  import { onDestroy } from "svelte";
  import { popupPadding } from "#lib/app/shared/popup-padding.js";
  import { popupClosed, popupOpened } from "#lib/app/shared/dismissal.js";
  import ToolField from "#lib/app/ui/panels/ToolField.svelte";
  import { isSliderField, type Tool, type ToolSettings } from "#lib/app/tools/tool.js";
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
    compact = false,
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
    /** The compact layout: the tool's options other than its sliders in the popup, which
     *  opens on a second touch. */
    compact?: boolean;
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
  } = $props();

  let open = $state(false);

  /** The options in the popup, and whether they are all it holds. */
  const fields = $derived(
    compact ? (tool.fields ?? []).filter((field) => !isSliderField(field)) : [],
  );
  const settingsOnly = $derived(fields.length > 0 && !tool.menu && !group);
  // When compact, the first touch only takes the tool: the popup opens on the next one.
  let wasActive = false;
  const noteActive = () => (wasActive = active);
  function setOpen(next: boolean) {
    if (next && compact && !wasActive) {
      return;
    }
    open = next;
  }

  const Icon = $derived(
    (tool.menu?.iconFollowsChoice &&
      tool.menu.items.find((item) => item.value === settings[tool.menu!.key])?.icon) ||
      tool.icon,
  );

  // While open, a click on the canvas only closes it.
  let shown = false;
  $effect(() => {
    if (open === shown) {
      return;
    }
    shown = open;
    if (open) {
      popupOpened();
    } else {
      popupClosed();
    }
  });
  // Removed while open (e.g. the mode changes): the canvas must not stay blocked.
  onDestroy(() => {
    if (shown) {
      popupClosed();
    }
  });
</script>

<!-- One line per tool of the group, or per choice of its menu (e.g. a filled rectangle). -->
{#snippet groupList(group: ToolGroupButton)}
  {#each group.tools as t (t.id)}
    {#if t.menu}
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
          open = false;
        }}
      >
        <t.icon />
        {t.title}
      </button>
    {/if}
  {/each}
{/snippet}

{#if tool.menu || group || fields.length}
  <Popover.Root bind:open={() => open, setOpen}>
    <Popover.Trigger
      class={["icon", active && "active", "has-popup"]}
      onpointerdowncapture={noteActive}
      onclickcapture={noteActive}
      title={group
        ? m.tool_button_group_tip({ group: group.title, tip: tip(`tool.${tool.id}`) })
        : tip(`tool.${tool.id}`)}
      onclick={() => run(`tool.${tool.id}`)}
    >
      <Icon />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        class={["tool-popup", settingsOnly && "settings-only"]}
        {side}
        align="start"
        sideOffset={8}
        collisionPadding={popupPadding()}
      >
        {#if group}
          {@render groupList(group)}
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
        {#if fields.length}
          <div class="settings" class:separated={!settingsOnly}>
            {#each fields as field (field.key)}
              <ToolField {field} {settings} />
            {/each}
          </div>
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

  /* A small corner: the button opens a popup (more tools or choices). */
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

  /* The tool's options, one per line, below its choices. */
  .settings {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: stretch;
    gap: calc(var(--space) / 2);
    padding: calc(var(--space) / 2);
  }

  /* A checkbox as tall as a line of choices. */
  .settings > :global(label) {
    min-height: var(--control-height);
  }

  /* The choices as wide as the popup, each button from its own width: their edges line up,
     and no label is squeezed. */
  .settings :global(.segmented > button) {
    flex: 1 1 auto;
  }

  .settings.separated {
    margin-top: calc(var(--space) / 2);
    border-top: 1px solid var(--border);
    padding-top: var(--space);
  }
</style>
