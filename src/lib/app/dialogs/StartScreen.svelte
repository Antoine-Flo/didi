<script lang="ts">
  // Shown at start (like Blender's splash screen) and by "New document": create a document
  // in one click, or open a recent one. Clicking outside keeps the current document.
  //
  // A new document is created in a mode (pixel art, painting…), chosen first: each mode
  // offers its own sizes and background.

  import { Dialog } from "bits-ui";
  import { untrack } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import type { Background } from "#lib/app/files/new-drawing.js";
  import type { Mode } from "#lib/app/modes/mode.js";
  import type { RecentFile } from "#lib/app/files/recent.js";
  import type { RecoveryInfo } from "#lib/app/files/session.svelte.js";

  let {
    open = $bindable(false),
    modes,
    mode,
    recent,
    recovery,
    oncreate,
    onchoose,
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
    /** A mode card was chosen. */
    onchoose?: (mode: Mode) => void;
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
    if (next.id === chosen.id) return;
    chosenId = next.id;
    ({ width, height } = next.newDocument.size);
    background = next.newDocument.background;
    onchoose?.(next);
  }

  function create(w: number, h: number) {
    open = false;
    oncreate(w, h, background, chosen.id);
  }

  let content = $state<HTMLElement | null>(null);

  const modeOf = (id: string | undefined) => modes.find((m) => m.id === id);

  // While it is open, a contact on the canvas only closes it.
  $effect(() => {
    if (!open) return;
    popupOpened();
    return () => popupClosed();
  });

  const folder = (path: string) => path.replace(/[\\/][^\\/]*$/, "");
  const when = (time: number) =>
    new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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
      class="start panel"
      tabindex={-1}
      interactOutsideBehavior="ignore"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        content?.focus({ preventScroll: true });
      }}
    >
      <Dialog.Title class="sr-only">New document</Dialog.Title>

      <section class="new">
        <span class="section-title">New document</span>
        <div class="modes" role="radiogroup" aria-label="Mode">
          {#each modes as m (m.id)}
            {@const Icon = m.icon}
            <button
              class="mode"
              class:active={m.id === chosen.id}
              role="radio"
              aria-checked={m.id === chosen.id}
              onclick={() => choose(m)}
            >
              <span class="mode-title"><Icon size={20} /> {m.title}</span>
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
                  class:default={w === defaults.size.width && h === defaults.size.height}
                  onclick={() => create(w, h)}>{w} × {h}</button
                >
              {/each}
            </div>
          </div>
        {/each}

        <div class="group">
          <span class="label">Custom</span>
          <div class="custom">
            <input type="number" min="1" max={MAX_SIZE} bind:value={width} aria-label="Width" />
            <span>×</span>
            <input type="number" min="1" max={MAX_SIZE} bind:value={height} aria-label="Height" />
          </div>
        </div>

        <div class="group">
          <span class="label">Background</span>
          <div class="toggle">
            <button class:active={background === "white"} onclick={() => (background = "white")}>
              White
            </button>
            <button
              class:active={background === "transparent"}
              onclick={() => (background = "transparent")}
            >
              Transparent
            </button>
          </div>
        </div>
      </section>

      <section class="recent">
        <span class="section-title">Recent</span>

        {#if recovery}
          <div class="recovery">
            <span>
              Unsaved work from {when(recovery.time)}: <strong>{recovery.name}</strong>
            </span>
            <div class="actions">
              <button
                class="primary"
                onclick={() => {
                  open = false;
                  onrecover();
                }}>Recover</button
              >
              <button onclick={ondiscardrecovery}>Discard</button>
            </div>
          </div>
        {/if}

        {#if recent.length > 0}
          <ul>
            {#each recent as file (file.path)}
              {@const fileMode = modeOf(file.mode)}
              <li>
                <button
                  title={file.path}
                  onclick={() => {
                    open = false;
                    onopen(file.path);
                  }}
                >
                  <img src={file.thumbnail} alt="" draggable="false" />
                  <span class="name">
                    {#if fileMode}
                      {@const Icon = fileMode.icon}
                      <span class="file-mode" title={fileMode.title}><Icon size={14} /></span>
                    {/if}
                    {file.name}
                  </span>
                  <span class="path">{folder(file.path)}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <span class="hint">No recent files.</span>
        {/if}
      </section>

      <div class="footer">
        <button
          class="primary"
          disabled={!validSize(width) || !validSize(height)}
          onclick={() => create(width, height)}>New image</button
        >
        <button
          onclick={() => {
            open = false;
            onopen();
          }}>Open image</button
        >
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Centered below the title bar by the layout, not by a transform: a translation of half
     a pixel blurs the text. */
  :global(.start) {
    position: fixed;
    inset: var(--titlebar-height) 0 0;
    z-index: 51;
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: min(760px, 92vw);
    height: fit-content;
    max-height: 90vh;
    margin: auto;
    overflow: hidden;
    background: var(--popup);
  }

  :global(.start:focus-visible) {
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

  /* The chosen mode: the same highlighted border as the default size. */
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

  .file-mode {
    display: inline-flex;
    vertical-align: -2px;
    color: var(--text-muted);
  }

  .sizes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
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

  .size.default {
    border-color: var(--text-faint);
  }

  .custom,
  .toggle,
  .footer,
  .actions {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
  }

  .custom input {
    box-sizing: border-box;
    width: 72px;
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

  .recovery {
    display: flex;
    flex-direction: column;
    gap: var(--space);
    padding: var(--space);
    background: var(--field);
    border: 1px solid var(--field-border);
    border-radius: var(--radius-small);
  }

  ul {
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  li button {
    display: grid;
    grid-template-columns: 48px 1fr;
    grid-template-rows: auto auto;
    column-gap: var(--space);
    align-items: center;
    width: 100%;
    height: auto;
    padding: calc(var(--space) / 2);
    text-align: left;
  }

  img {
    grid-row: span 2;
    width: 48px;
    height: 48px;
    object-fit: contain;
    border-radius: var(--radius-small);
    /* Checkerboard behind transparent drawings. */
    background: repeating-conic-gradient(var(--field-border) 0 25%, var(--field) 0 50%) 0 0 / 12px
      12px;
  }

  .name,
  .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .path {
    color: var(--text-faint);
  }

  /* Actions at the bottom left: create, open. */
  .footer {
    grid-column: 1 / -1;
    padding: var(--space) calc(var(--space) * 2);
    border-top: 1px solid var(--border);
  }
</style>
