<script lang="ts">
  // The layout menu of the title bar, next to the window buttons (like VS Code's): options
  // on one line each, a label on the left and its controls on the right. Using one leaves
  // the menu open, to see the result and try another: the document's mode, the side of the
  // panels (a small sketch for each, the active one highlighted), the compact layout, the
  // interface size, finger drawing (on touch screens only), the preview window and full screen.

  import { PanelsTopLeft, ZoomIn, ZoomOut } from "@lucide/svelte";
  import { DropdownMenu } from "bits-ui";
  import { onDestroy } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import type { Mode } from "#lib/app/modes/mode.js";
  import { m } from "#lib/paraglide/messages.js";
  import {
    type CompactMode,
    type FingerDrawing,
    type Hand,
    UI_SCALE_MAX,
    UI_SCALE_MIN,
    UI_SCALE_STEP,
  } from "#lib/app/shell/layout-prefs.svelte.js";

  let {
    modes,
    mode,
    hand,
    compact,
    uiScale,
    disabled = false,
    tip,
    run,
    onUiScale,
    onCompact,
    fingerDrawing = null,
    penSeen = false,
    onFingerDrawing,
    preview,
    onPreview,
    fullScreen,
    onFullScreen,
  }: {
    modes: Mode[];
    /** Id of the document's mode. */
    mode: string;
    hand: Hand;
    compact: CompactMode;
    /** In percent. */
    uiScale: number;
    /** Does not open, e.g. while a dialog is open. */
    disabled?: boolean;
    tip: (command: string) => string;
    run: (command: string) => void;
    onUiScale: (scale: number) => void;
    onCompact: (mode: CompactMode) => void;
    /** Null hides the option: not a touch screen. */
    fingerDrawing?: FingerDrawing | null;
    /** A pen was used: "Auto" then means the fingers move the view. */
    penSeen?: boolean;
    onFingerDrawing?: (mode: FingerDrawing) => void;
    /** The preview window is open. */
    preview: boolean;
    onPreview: (open: boolean) => void;
    fullScreen: boolean;
    onFullScreen: (on: boolean) => void;
  } = $props();

  const COMPACT: { mode: CompactMode; label: () => string; title: () => string }[] = [
    { mode: "auto", label: m.layout_compact_auto, title: m.layout_compact_auto_title },
    { mode: "on", label: m.layout_on, title: m.layout_compact_on_title },
    { mode: "off", label: m.layout_off, title: m.layout_compact_off_title },
  ];

  const FINGER: { mode: FingerDrawing; label: () => string; title: () => string }[] = [
    {
      mode: "auto",
      label: m.layout_compact_auto,
      title: () => (penSeen ? m.layout_finger_auto_pen_title() : m.layout_finger_auto_title()),
    },
    { mode: "on", label: m.layout_on, title: m.layout_finger_on_title },
    { mode: "off", label: m.layout_off, title: m.layout_finger_off_title },
  ];

  const PREVIEW: { open: boolean; label: () => string; title: () => string }[] = [
    { open: true, label: m.layout_on, title: m.layout_preview_on_title },
    { open: false, label: m.layout_off, title: m.layout_preview_off_title },
  ];

  const FULL_SCREEN: { on: boolean; label: () => string }[] = [
    { on: true, label: m.layout_on },
    { on: false, label: m.layout_off },
  ];

  const LAYOUTS: { hand: Hand; label: () => string; command: string }[] = [
    { hand: "right", label: m.layout_right_handed, command: "view.rightHanded" },
    { hand: "left", label: m.layout_left_handed, command: "view.leftHanded" },
  ];

  // Changing the interface size moves the trigger: the menu stays where it opened, so that
  // the plus button stays under the pointer from one click to the next.
  let trigger = $state<HTMLElement | null>(null);
  let openedAt: DOMRect;
  const anchor = { getBoundingClientRect: () => openedAt };

  let open = false;
  function setOpen(next: boolean) {
    if (next === open) return;
    open = next;
    if (next && trigger) openedAt = trigger.getBoundingClientRect();
    if (next) popupOpened();
    else popupClosed();
  }
  // Removed while open: the canvas must not stay blocked.
  onDestroy(() => setOpen(false));
</script>

<DropdownMenu.Root onOpenChange={setOpen}>
  <DropdownMenu.Trigger bind:ref={trigger} class="title-button" title={m.layout_title()} {disabled}>
    <PanelsTopLeft />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="menu-content layout-menu"
      customAnchor={anchor}
      align="end"
      sideOffset={4}
      collisionPadding={8}
    >
      <DropdownMenu.Group class="layout-option">
        <DropdownMenu.GroupHeading class="layout-option-label"
          >{m.start_mode()}</DropdownMenu.GroupHeading
        >
        <div class="controls side">
          {#each modes as m (m.id)}
            <DropdownMenu.Item
              class="menu-item layout-text-item"
              data-active={m.id === mode ? "" : undefined}
              title={tip(`mode.${m.id}`)}
              closeOnSelect={false}
              onSelect={() => run(`mode.${m.id}`)}
            >
              {m.title}
            </DropdownMenu.Item>
          {/each}
        </div>
      </DropdownMenu.Group>
      <DropdownMenu.Group class="layout-option">
        <DropdownMenu.GroupHeading class="layout-option-label">
          {m.layout_interface_side()}
        </DropdownMenu.GroupHeading>
        <div class="controls side">
          {#each LAYOUTS as layout (layout.hand)}
            <DropdownMenu.Item
              class="menu-item layout-icon-item"
              data-active={layout.hand === hand ? "" : undefined}
              title={tip(layout.command)}
              aria-label={layout.label()}
              closeOnSelect={false}
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
            </DropdownMenu.Item>
          {/each}
        </div>
      </DropdownMenu.Group>
      <DropdownMenu.Group class="layout-option">
        <DropdownMenu.GroupHeading class="layout-option-label"
          >{m.layout_compact()}</DropdownMenu.GroupHeading
        >
        <div class="controls side">
          {#each COMPACT as option (option.mode)}
            <DropdownMenu.Item
              class="menu-item layout-text-item"
              data-active={option.mode === compact ? "" : undefined}
              title={option.title()}
              closeOnSelect={false}
              onSelect={() => onCompact(option.mode)}
            >
              {option.label()}
            </DropdownMenu.Item>
          {/each}
        </div>
      </DropdownMenu.Group>
      <DropdownMenu.Group class="layout-option">
        <DropdownMenu.GroupHeading class="layout-option-label">
          {m.layout_interface_size()}
        </DropdownMenu.GroupHeading>
        <div class="controls">
          <DropdownMenu.Item
            class="menu-item layout-icon-item"
            title={m.layout_smaller()}
            aria-label={m.layout_smaller()}
            disabled={uiScale <= UI_SCALE_MIN}
            closeOnSelect={false}
            onSelect={() => onUiScale(uiScale - UI_SCALE_STEP)}
          >
            <ZoomOut />
          </DropdownMenu.Item>
          <span class="value">{uiScale}%</span>
          <DropdownMenu.Item
            class="menu-item layout-icon-item"
            title={m.layout_larger()}
            aria-label={m.layout_larger()}
            disabled={uiScale >= UI_SCALE_MAX}
            closeOnSelect={false}
            onSelect={() => onUiScale(uiScale + UI_SCALE_STEP)}
          >
            <ZoomIn />
          </DropdownMenu.Item>
        </div>
      </DropdownMenu.Group>
      {#if fingerDrawing}
        <DropdownMenu.Group class="layout-option">
          <DropdownMenu.GroupHeading class="layout-option-label"
            >{m.layout_finger_drawing()}</DropdownMenu.GroupHeading
          >
          <div class="controls side">
            {#each FINGER as option (option.mode)}
              <DropdownMenu.Item
                class="menu-item layout-text-item"
                data-active={option.mode === fingerDrawing ? "" : undefined}
                title={option.title()}
                closeOnSelect={false}
                onSelect={() => onFingerDrawing?.(option.mode)}
              >
                {option.label()}
              </DropdownMenu.Item>
            {/each}
          </div>
        </DropdownMenu.Group>
      {/if}
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

  /* At least as wide as the size's controls, which look like the zoom's in the status bar:
     two square buttons around the percentage. */
  .controls {
    display: flex;
    align-items: center;
    min-width: calc(2 * var(--control-height) + var(--percent-width));
  }

  .side {
    gap: 2px;
  }

  :global(.menu-item.layout-icon-item) {
    flex: 1 1 0;
    justify-content: center;
    min-width: 0;
    padding: 0;
  }

  :global(.menu-item.layout-text-item) {
    flex: 1 1 0;
    justify-content: center;
  }

  .value {
    flex: none;
    width: var(--percent-width);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* Rounded, like the menus and window buttons next to it; also the title bar's undo and
     redo when compact (see EditorApp). */
  :global(.title-button) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(36px * var(--ui-scale));
    height: var(--control-height);
    padding: 0;
    color: var(--text-muted);
    background: none;
    border: none;
    border-radius: var(--radius-small);
    cursor: default;
  }

  :global(.title-button:hover:not(:disabled)),
  :global(.title-button[data-state="open"]) {
    color: var(--text);
    background: var(--hover);
  }

  .sketch {
    flex: none;
    width: calc(24px * var(--ui-scale));
    height: calc(16px * var(--ui-scale));
    fill: none;
    stroke: currentColor;
  }

  .sketch .fill {
    fill: currentColor;
    stroke: none;
  }
</style>
