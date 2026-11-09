<script lang="ts">
  // Shown at start (like Blender's splash screen) and by "New document": create a document
  // (choose a mode, a size and a background, then "New document"), or open a recent one.
  // Clicking outside keeps the current document.
  //
  // A new document is created in a mode (pixel art, painting…), chosen first: each mode
  // offers its own sizes and background.

  import { Dialog } from "bits-ui";
  import { untrack } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/shared/dismissal.js";
  import { capabilities } from "#lib/platform/capabilities.js";
  import type { Background } from "#lib/app/files/new-drawing.js";
  import type { Mode } from "#lib/app/modes/mode.js";
  import type { RecentFile } from "#lib/app/files/recent.js";
  import type { RecoveryInfo } from "#lib/app/files/session.svelte.js";
  import RecentFiles from "#lib/app/ui/dialogs/RecentFiles.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let {
    open = $bindable(false),
    modes,
    mode,
    recent,
    recovery,
    oncreate,
    onchange,
    onopen,
    onrecover,
    ondiscardrecovery,
  }: {
    open?: boolean;
    modes: readonly Mode[];
    /** The mode chosen at first: the current document's. */
    mode: string;
    recent: readonly RecentFile[];
    recovery: RecoveryInfo | null;
    oncreate: (width: number, height: number, background: Background, mode: string) => void;
    /** The mode, the size or the background was changed by the user (a valid size only). */
    onchange?: (width: number, height: number, background: Background, mode: string) => void;
    /** Opens a recent file, or asks for one without a path. */
    onopen: (path?: string) => void;
    onrecover: () => void;
    ondiscardrecovery: () => void;
  } = $props();

  const MAX_SIZE = 8192;

  // The last choice is kept while the app runs.
  // svelte-ignore state_referenced_locally
  // An id, not the mode itself: $state would wrap the mode in a proxy, and comparing it
  // with the modes would then always fail.
  let chosenId = $state(mode);
  const chosen = $derived(modes.find((m) => m.id === chosenId) ?? modes[0]);
  const defaults = $derived(chosen.newDocument);
  let background = $state<Background>(untrack(() => defaults.background));
  let width = $state(untrack(() => defaults.size.width));
  let height = $state(untrack(() => defaults.size.height));
  const validSize = (v: number) => Number.isInteger(v) && v >= 1 && v <= MAX_SIZE;

  function choose(next: Mode) {
    if (next.id === chosen.id) {
      return;
    }
    chosenId = next.id;
    ({ width, height } = next.newDocument.size);
    background = next.newDocument.background;
    changed();
  }

  function changed() {
    if (validSize(width) && validSize(height)) {
      onchange?.(width, height, background, chosen.id);
    }
  }

  function setSize(w: number, h: number) {
    if (w === width && h === height) {
      return;
    }
    ({ width, height } = { width: w, height: h });
    changed();
  }

  function setBackground(next: Background) {
    if (next === background) {
      return;
    }
    background = next;
    changed();
  }

  function create(w: number, h: number) {
    open = false;
    oncreate(w, h, background, chosen.id);
  }

  let content = $state<HTMLElement | null>(null);

  // While it is open, a contact on the canvas only closes it.
  $effect(() => {
    if (!open) {
      return;
    }
    popupOpened();
    return () => popupClosed();
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <!-- Closes on click (after the release), not on press: see CommandPalette. -->
    <Dialog.Overlay class="dialog-overlay" onclick={() => (open = false)} />
    <!-- The dialog itself takes the focus, not its first card: the card would show a focus
         ring as if it were the chosen mode. The focus trap then brings the focus back to the
         dialog, not to the card, when the window takes it at start. -->
    <Dialog.Content
      bind:ref={content}
      class={["start-screen panel", !capabilities.userFiles && "no-files"]}
      tabindex={-1}
      interactOutsideBehavior="ignore"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        content?.focus({ preventScroll: true });
      }}
    >
      <Dialog.Title class="sr-only">{m.start_new_document()}</Dialog.Title>

      <section class="new">
        <span class="section-title">{m.start_new_document()}</span>
        <div class="modes" role="radiogroup" aria-label={m.start_mode()}>
          {#each modes as m (m.id)}
            {@const Icon = m.icon}
            <button
              class="mode"
              class:active={m.id === chosen.id}
              role="radio"
              aria-checked={m.id === chosen.id}
              onclick={() => choose(m)}
            >
              <span class="mode-title"><Icon class="icon-large" /> {m.title}</span>
              <span class="mode-description">{m.description}</span>
            </button>
          {/each}
        </div>

        {#each defaults.presets as { group, sizes } (group)}
          <div class="group">
            <span class="label">{group}</span>
            <div class="sizes">
              {#each sizes as [w, h] (`${w}x${h}`)}
                <button
                  class="size"
                  class:active={w === width && h === height}
                  onclick={() => setSize(w, h)}>{w} × {h}</button
                >
              {/each}
            </div>
          </div>
        {/each}

        <div class="group">
          <span class="label">{m.start_custom()}</span>
          <div class="custom">
            <input
              type="number"
              min="1"
              max={MAX_SIZE}
              bind:value={width}
              oninput={changed}
              aria-label={m.image_size_width()}
            />
            <span>×</span>
            <input
              type="number"
              min="1"
              max={MAX_SIZE}
              bind:value={height}
              oninput={changed}
              aria-label={m.image_size_height()}
            />
          </div>
        </div>

        <div class="group">
          <span class="label">{m.start_background()}</span>
          <div class="toggle">
            <button class:active={background === "white"} onclick={() => setBackground("white")}>
              {m.start_white()}
            </button>
            <button
              class:active={background === "transparent"}
              onclick={() => setBackground("transparent")}
            >
              {m.start_transparent()}
            </button>
          </div>
        </div>
      </section>

      {#if capabilities.userFiles}
        <section class="recent">
          <span class="section-title">{m.start_recent()}</span>

          <RecentFiles
            {modes}
            {recent}
            {recovery}
            onopen={(path) => {
              open = false;
              onopen(path);
            }}
            onrecover={() => {
              open = false;
              onrecover();
            }}
            {ondiscardrecovery}
          />
        </section>
      {/if}

      <div class="footer">
        <button
          class="primary"
          disabled={!validSize(width) || !validSize(height)}
          onclick={() => create(width, height)}>{m.start_new_document_action()}</button
        >
        {#if capabilities.userFiles}
          <button
            onclick={() => {
              open = false;
              onopen();
            }}>{m.start_open_image()}</button
          >
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Centered below the title bar by the layout, not by a transform: a translation of half
     a pixel blurs the text. */
  :global(.start-screen) {
    position: fixed;
    inset: var(--titlebar-height) 0 0;
    z-index: 51;
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: min(760px * var(--ui-scale), 92vw);
    height: fit-content;
    max-height: 90vh;
    margin: auto;
    overflow: hidden;
    background: var(--popup);
  }

  /* Without the recent files. */
  :global(.start-screen.no-files) {
    grid-template-columns: 1fr;
    width: min(380px * var(--ui-scale), 92vw);
  }

  :global(.start-screen:focus-visible) {
    outline: none;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--space);
    min-height: 0;
    padding: calc(var(--space) * 2);
  }

  .recent {
    border-left: 1px solid var(--border);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space) / 2);
  }

  .label {
    color: var(--text-muted);
  }

  /* The mode comes first and must be obvious: two large cards. */
  .modes {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    gap: var(--space);
  }

  .mode {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--space) / 2);
    height: auto;
    padding: var(--space);
    text-align: left;
    white-space: normal;
    background: var(--field);
    border: 1px solid var(--field-border);
    border-radius: var(--radius);
  }

  .mode:hover {
    background: var(--hover);
  }

  /* The chosen mode: the same highlighted border as the chosen size. */
  .mode.active {
    border-color: var(--text-faint);
  }

  .mode-title {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
    font-weight: 600;
  }

  .mode-description {
    color: var(--text-muted);
  }

  .sizes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(calc(88px * var(--ui-scale)), 1fr));
    gap: calc(var(--space) / 2);
  }

  .size {
    background: var(--field);
    border: 1px solid var(--field-border);
    font-variant-numeric: tabular-nums;
  }

  .size:hover {
    background: var(--hover);
    border-color: var(--text-faint);
  }

  /* The size that will be created: the same highlighted border as the chosen mode. */
  .size.active {
    border-color: var(--text-faint);
  }

  .custom,
  .toggle,
  .footer {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
  }

  .custom input {
    box-sizing: border-box;
    width: calc(72px * var(--ui-scale));
    height: var(--control-height);
    padding: 0 var(--space);
    color: inherit;
    font: inherit;
    font-variant-numeric: tabular-nums;
    background: var(--field);
    border: 1px solid var(--field-border);
    border-radius: var(--radius-small);
  }

  .toggle button {
    flex: 1;
    background: var(--field);
    border: 1px solid var(--field-border);
  }

  .toggle button.active {
    background: var(--selected);
  }

  /* Actions at the bottom left: create, open. */
  .footer {
    grid-column: 1 / -1;
    padding: var(--space) calc(var(--space) * 2);
    border-top: 1px solid var(--border);
  }
</style>
