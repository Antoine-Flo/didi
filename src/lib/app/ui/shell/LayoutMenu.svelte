<script lang="ts">
  // The layout menu, at the end of the view's column (see NavColumn): options
  // on one line each, a label on the left and its controls on the right. Using one leaves
  // the menu open, to see the result and try another: the preview window and full screen. What is set once (side of the panels, compact layout, interface
  // size, finger drawing) is in the preferences.

  import { PanelsTopLeft } from "@lucide/svelte";
  import { DropdownMenu } from "bits-ui";
  import { onDestroy } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/shared/dismissal.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    side,
    disabled = false,
    tip,
    preview,
    onPreview,
    fullScreen,
    onFullScreen,
  }: {
    /** Where it opens: towards the canvas. */
    side: "left" | "right";
    /** Does not open, e.g. while a dialog is open. */
    disabled?: boolean;
    tip: (command: string) => string;
    /** The preview window is open. */
    preview: boolean;
    onPreview: (open: boolean) => void;
    fullScreen: boolean;
    onFullScreen: (on: boolean) => void;
  } = $props();

  const PREVIEW: { open: boolean; label: () => string; title: () => string }[] = [
    { open: true, label: m.layout_on, title: m.layout_preview_on_title },
    { open: false, label: m.layout_off, title: m.layout_preview_off_title },
  ];

  const FULL_SCREEN: { on: boolean; label: () => string }[] = [
    { on: true, label: m.layout_on },
    { on: false, label: m.layout_off },
  ];

  let open = false;
  function setOpen(next: boolean) {
    if (next === open) {
      return;
    }
    open = next;
    if (next) {
      popupOpened();
    } else {
      popupClosed();
    }
  }
  // Removed while open: the canvas must not stay blocked.
  onDestroy(() => setOpen(false));
</script>

<DropdownMenu.Root onOpenChange={setOpen}>
  <DropdownMenu.Trigger class="icon" title={m.layout_title()} {disabled}>
    <PanelsTopLeft />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="menu-content layout-menu"
      {side}
      align="end"
      sideOffset={8}
      collisionPadding={8}
    >
      <DropdownMenu.Group class="layout-option">
        <DropdownMenu.GroupHeading class="layout-option-label"
          >{m.preview_title()}</DropdownMenu.GroupHeading
        >
        <div class="controls side">
          {#each PREVIEW as option (option.open)}
            <DropdownMenu.Item
              class="menu-item layout-text-item"
              data-active={option.open === preview ? "" : undefined}
              title={option.title()}
              closeOnSelect={false}
              onSelect={() => onPreview(option.open)}
            >
              {option.label()}
            </DropdownMenu.Item>
          {/each}
        </div>
      </DropdownMenu.Group>
      <DropdownMenu.Group class="layout-option">
        <DropdownMenu.GroupHeading class="layout-option-label"
          >{m.layout_full_screen()}</DropdownMenu.GroupHeading
        >
        <div class="controls side">
          {#each FULL_SCREEN as option (option.on)}
            <DropdownMenu.Item
              class="menu-item layout-text-item"
              data-active={option.on === fullScreen ? "" : undefined}
              title={tip("view.fullScreen")}
              closeOnSelect={false}
              onSelect={() => onFullScreen(option.on)}
            >
              {option.label()}
            </DropdownMenu.Item>
          {/each}
        </div>
      </DropdownMenu.Group>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  /* Two columns shared by every line: the labels, and the controls, as wide as the widest. */
  :global(.layout-menu) {
    display: grid;
    grid-template-columns: auto auto;
    column-gap: calc(var(--space) * 2);
  }

  :global(.layout-option) {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    padding-left: var(--space);
  }

  :global(.layout-option + .layout-option) {
    margin-top: 2px;
  }

  :global(.layout-option-label) {
    color: var(--text-muted);
    white-space: nowrap;
  }

  /* Not narrower than before the settings moved to the preferences: the choices keep their
     width. */
  .controls {
    display: flex;
    align-items: center;
    min-width: calc(2 * var(--control-height) + var(--percent-width));
  }

  .side {
    gap: 2px;
  }

  :global(.menu-item.layout-text-item) {
    flex: 1 1 0;
    justify-content: center;
  }
</style>
