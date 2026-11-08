<script lang="ts" module>
  /** Which size it changes: the canvas (cut or extend) or the image (scale). */
  export type SizeKind = "canvas" | "image";
</script>

<script lang="ts">
  // Changes the size of the document. The canvas: a new size, and where the pixels stay (the
  // anchor, a 3 × 3 grid: the middle by default). The image: a new size, its proportions kept
  // unless unlinked, and how pixels are scaled (whole for pixel art, mixed for painting).

  import { Dialog } from "bits-ui";
  import { Link, Unlink } from "@lucide/svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import Segmented from "#lib/app/widgets/Segmented.svelte";
  import { MAX_CANVAS_SIZE } from "#lib/core/editor/image-edits.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    kind = $bindable(),
    width: currentWidth,
    height: currentHeight,
    smoothByDefault,
    side,
    run,
    onpreview,
  }: {
    /** Open on that size, or closed (null). */
    kind: SizeKind | null;
    /** The canvas size now. */
    width: number;
    height: number;
    /** Scaling mixes pixels unless asked otherwise: painting, not pixel art. */
    smoothByDefault: boolean;
    /** Where it opens: the canvas's side, away from the panels. */
    side: "left" | "right";
    run: (command: string, params?: unknown) => void;
    /**
     * Shows on the canvas what the settings would give, as they change (the canvas, in its
     * pixels now, and how the image is stretched), without changing the drawing. Null: stop.
     */
    onpreview: (
      preview: {
        rect: { x: number; y: number; width: number; height: number };
        scaleX: number;
        scaleY: number;
      } | null,
    ) => void;
  } = $props();

  let width = $state(0);
  let height = $state(0);
  let linked = $state(true);
  /** 0 to 8, row by row: which side or corner the pixels keep. */
  let anchor = $state(4);
  let method = $state("smooth");

  // Every opening starts from the document as it is.
  let wasOpen = false;
  $effect(() => {
    const open = kind !== null;
    if (open === wasOpen) return;
    wasOpen = open;
    if (!open) return popupClosed();
    popupOpened();
    width = currentWidth;
    height = currentHeight;
    linked = true;
    anchor = 4;
    method = smoothByDefault ? "smooth" : "pixels";
  });

  const valid = (v: number) => Number.isInteger(v) && v >= 1 && v <= MAX_CANVAS_SIZE;
  const canApply = $derived(
    valid(width) && valid(height) && (width !== currentWidth || height !== currentHeight),
  );

  /** Where the pixels move to, for a new canvas size. */
  const offset = $derived({
    dx: Math.floor(((width - currentWidth) * (anchor % 3)) / 2),
    dy: Math.floor(((height - currentHeight) * Math.floor(anchor / 3)) / 2),
  });

  // The preview follows the settings while open; it stops when it closes.
  $effect(() => {
    if (kind === null || !valid(width) || !valid(height)) return onpreview(null);
    if (kind === "canvas") {
      onpreview({
        rect: { x: -offset.dx, y: -offset.dy, width, height },
        scaleX: 1,
        scaleY: 1,
      });
    } else {
      onpreview({
        rect: { x: 0, y: 0, width, height },
        scaleX: width / currentWidth,
        scaleY: height / currentHeight,
      });
    }
  });

  /** One side changed, the other follows when linked (scaling only). */
  function changed(side: "width" | "height") {
    if (kind !== "image" || !linked) return;
    if (side === "width" && valid(width)) {
      height = Math.max(1, Math.round((width * currentHeight) / currentWidth));
    } else if (side === "height" && valid(height)) {
      width = Math.max(1, Math.round((height * currentWidth) / currentHeight));
    }
  }

  function apply() {
    if (!canApply) return;
    if (kind === "canvas") {
      run("image.resizeCanvas", { width, height, ...offset });
    } else {
      run("image.scale", { width, height, smooth: method === "smooth" });
    }
    kind = null;
  }
</script>

<Dialog.Root open={kind !== null} onOpenChange={(open) => !open && (kind = null)}>
  <Dialog.Portal>
    <!-- No dimming: the canvas shows the result. On the canvas's side, away from the panels. -->
    <Dialog.Content class={["dialog panel size-dialog", side === "left" && "on-left"]}>
      <Dialog.Title class="dialog-title">
        {kind === "canvas" ? m.image_size_canvas_title() : m.image_size_image_title()}
      </Dialog.Title>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div class="row">
          <span class="label">{m.image_size_size()}</span>
          <div class="fields">
            <input
              type="number"
              min="1"
              max={MAX_CANVAS_SIZE}
              bind:value={width}
              oninput={() => changed("width")}
              aria-label={m.image_size_width()}
            />
            {#if kind === "image"}
              <button
                type="button"
                class="icon"
                class:active={linked}
                title={linked ? m.image_size_unlink() : m.image_size_keep_proportions()}
                onclick={() => {
                  linked = !linked;
                  changed("width");
                }}
              >
                {#if linked}<Link />{:else}<Unlink />{/if}
              </button>
            {:else}
              <span>×</span>
            {/if}
            <input
              type="number"
              min="1"
              max={MAX_CANVAS_SIZE}
              bind:value={height}
              oninput={() => changed("height")}
              aria-label={m.image_size_height()}
            />
            <span class="unit">{m.image_size_unit()}</span>
          </div>
        </div>
        <p class="hint">{m.image_size_now({ width: currentWidth, height: currentHeight })}</p>

        {#if kind === "canvas"}
          <div class="row">
            <span class="label">{m.image_size_anchor()}</span>
            <div class="anchor" role="radiogroup" aria-label={m.image_size_anchor()}>
              {#each { length: 9 }, i (i)}
                <button
                  type="button"
                  role="radio"
                  aria-checked={anchor === i}
                  class:active={anchor === i}
                  title={m.image_size_anchor_here()}
                  aria-label={m.image_size_anchor_cell({ number: i + 1 })}
                  onclick={() => (anchor = i)}
                ></button>
              {/each}
            </div>
          </div>
        {:else}
          <div class="row">
            <span class="label">{m.image_size_pixels()}</span>
            <Segmented
              label={m.image_size_scaling()}
              value={method}
              choices={[
                {
                  value: "pixels",
                  label: m.image_size_whole(),
                  title: m.image_size_whole_title(),
                },
                {
                  value: "smooth",
                  label: m.image_size_smooth(),
                  title: m.image_size_smooth_title(),
                },
              ]}
              onselect={(v) => (method = v)}
            />
          </div>
        {/if}

        <div class="actions">
          <span class="spacer"></span>
          <button type="button" onclick={() => (kind = null)}>{m.common_cancel()}</button>
          <button type="submit" class="primary" disabled={!canApply}>{m.common_apply()}</button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.dialog.size-dialog) {
    inset: calc(var(--titlebar-height) + var(--space)) var(--space) auto auto;
    width: fit-content;
    margin: 0;
  }

  :global(.dialog.size-dialog.on-left) {
    inset: calc(var(--titlebar-height) + var(--space)) auto auto var(--space);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space);
  }

  .row {
    display: grid;
    grid-template-columns: calc(64px * var(--ui-scale)) auto;
    align-items: center;
  }

  .label,
  .hint,
  .unit {
    color: var(--text-muted);
  }

  .hint {
    margin: 0;
    padding-left: calc(64px * var(--ui-scale));
  }

  .fields {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
  }

  input {
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

  /* Nine small squares, the chosen one filled. */
  .anchor {
    display: grid;
    grid-template-columns: repeat(3, var(--control-height));
    gap: 2px;
  }

  .anchor button {
    height: var(--control-height);
    padding: 0;
    background: var(--field);
    border: 1px solid var(--field-border);
  }

  .anchor button.active {
    background: var(--text-muted);
  }

  .actions {
    display: flex;
    gap: var(--space);
    margin-top: var(--space);
  }

  .spacer {
    flex: 1;
  }
</style>
