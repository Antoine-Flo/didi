<script lang="ts">
  // Shown at start (like Blender's splash screen) and by "New document": create a document
  // in one click, or open a recent one. Clicking outside keeps the current document.

  import { Dialog } from "bits-ui";
  import { FolderOpen } from "@lucide/svelte";
  import { popupClosed, popupOpened } from "$lib/app/dismissal";
  import { DEFAULT_SIZE, type Background } from "$lib/app/new-drawing";
  import type { RecentFile } from "$lib/app/recent";
  import type { RecoveryInfo } from "$lib/app/session.svelte";

  let {
    open = $bindable(false),
    recent,
    recovery,
    oncreate,
    onopen,
    onrecover,
    ondiscardrecovery,
  }: {
    open?: boolean;
    recent: readonly RecentFile[];
    recovery: RecoveryInfo | null;
    oncreate: (width: number, height: number, background: Background) => void;
    /** Opens a recent file, or asks for one without a path. */
    onopen: (path?: string) => void;
    onrecover: () => void;
    ondiscardrecovery: () => void;
  } = $props();

  const PRESETS: { group: string; sizes: [number, number][] }[] = [
    { group: "Pixel art", sizes: [16, 32, 64, 128, 256].map((s) => [s, s]) },
    { group: "Textures", sizes: [512, 1024, 2048, 4096].map((s) => [s, s]) },
    {
      group: "Screen",
      sizes: [
        [320, 180],
        [640, 360],
        [1280, 720],
        [1920, 1080],
      ],
    },
  ];
  const MAX_SIZE = 8192;

  let background = $state<Background>("white");
  let width = $state(DEFAULT_SIZE.width);
  let height = $state(DEFAULT_SIZE.height);
  const validSize = (v: number) => Number.isInteger(v) && v >= 1 && v <= MAX_SIZE;

  function create(w: number, h: number) {
    open = false;
    oncreate(w, h, background);
  }

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
    <Dialog.Content class="start panel" interactOutsideBehavior="ignore">
      <Dialog.Title class="sr-only">New document</Dialog.Title>

      <section class="new">
        <span class="section-title">New document</span>
        {#each PRESETS as { group, sizes } (group)}
          <div class="group">
            <span class="label">{group}</span>
            <div class="sizes">
              {#each sizes as [w, h] (`${w}x${h}`)}
                <button
                  class="size"
                  class:default={w === DEFAULT_SIZE.width && h === DEFAULT_SIZE.height}
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
            <button
              class="primary"
              disabled={!validSize(width) || !validSize(height)}
              onclick={() => create(width, height)}>Create</button
            >
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
        <div class="header">
          <span class="section-title">Recent</span>
          <button
            title="Open a file"
            onclick={() => {
              open = false;
              onopen();
            }}
          >
            <FolderOpen size={16} /> Open…
          </button>
        </div>

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
              <li>
                <button
                  title={file.path}
                  onclick={() => {
                    open = false;
                    onopen(file.path);
                  }}
                >
                  <img src={file.thumbnail} alt="" draggable="false" />
                  <span class="name">{file.name}</span>
                  <span class="path">{folder(file.path)}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <span class="hint">No recent files.</span>
        {/if}
      </section>

      <p class="hint footer">
        Click outside to start drawing on an empty {DEFAULT_SIZE.width} × {DEFAULT_SIZE.height}
        canvas.
      </p>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.start) {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 51;
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: min(760px, 92vw);
    max-height: 90vh;
    overflow: hidden;
    background: var(--popup);
    transform: translate(-50%, -50%);
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

  .size.default {
    border-color: var(--text-faint);
  }

  .custom,
  .toggle,
  .header,
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

  .custom button {
    margin-left: auto;
  }

  .toggle button {
    flex: 1;
    background: var(--field);
    border: 1px solid var(--field-border);
  }

  .toggle button.active {
    background: var(--selected);
  }

  .header {
    justify-content: space-between;
  }

  .header button {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
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

  .footer {
    grid-column: 1 / -1;
    margin: 0;
    padding: var(--space) calc(var(--space) * 2);
    border-top: 1px solid var(--border);
  }
</style>
