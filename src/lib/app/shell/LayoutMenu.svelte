<script lang="ts">
  // The layout menu of the title bar, next to the window buttons (like VS Code's): the
  // layouts, each with a small sketch, the active one highlighted. Each item runs a command.

  import { PanelsTopLeft } from "@lucide/svelte";
  import { DropdownMenu } from "bits-ui";
  import { onDestroy } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import type { Hand } from "#lib/app/shell/layout-prefs.svelte.js";

  let {
    hand,
    disabled = false,
    tip,
    run,
  }: {
    hand: Hand;
    /** Does not open, e.g. while a dialog is open. */
    disabled?: boolean;
    tip: (command: string) => string;
    run: (command: string) => void;
  } = $props();

  const LAYOUTS: { hand: Hand; label: string; command: string }[] = [
    { hand: "right", label: "Right-handed", command: "view.rightHanded" },
    { hand: "left", label: "Left-handed", command: "view.leftHanded" },
  ];

  let open = false;
  function setOpen(next: boolean) {
    if (next === open) return;
    open = next;
    if (next) popupOpened();
    else popupClosed();
  }
  // Removed while open: the canvas must not stay blocked.
  onDestroy(() => setOpen(false));
</script>

<DropdownMenu.Root onOpenChange={setOpen}>
  <DropdownMenu.Trigger class="layout-trigger" title="Layout" {disabled}>
    <PanelsTopLeft size={16} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="menu-content" align="end" sideOffset={4} collisionPadding={8}>
      {#each LAYOUTS as layout (layout.hand)}
        <DropdownMenu.Item
          class="menu-item"
          data-active={layout.hand === hand ? "" : undefined}
          title={tip(layout.command)}
          onSelect={() => run(layout.command)}
        >
          <!-- The window: the tool bar at the top, the panels' column on one side. -->
          <svg class="sketch" viewBox="0 0 24 16" aria-hidden="true">
            <rect x="0.5" y="0.5" width="23" height="15" rx="2" />
            <rect class="fill" x="7" y="2" width="10" height="2" />
            {#if layout.hand === "right"}
              <rect class="fill" x="2" y="5" width="5" height="9" />
            {:else}
              <rect class="fill" x="17" y="5" width="5" height="9" />
            {/if}
          </svg>
          {layout.label}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  /* Rounded, like the menus and window buttons next to it. */
  :global(.layout-trigger) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: var(--control-height);
    padding: 0;
    color: var(--text-muted);
    background: none;
    border: none;
    border-radius: var(--radius-small);
    cursor: default;
  }

  :global(.layout-trigger:hover:not(:disabled)),
  :global(.layout-trigger[data-state="open"]) {
    color: var(--text);
    background: var(--hover);
  }

  .sketch {
    flex: none;
    width: 24px;
    height: 16px;
    fill: none;
    stroke: currentColor;
  }

  .sketch .fill {
    fill: currentColor;
    stroke: none;
  }
</style>
