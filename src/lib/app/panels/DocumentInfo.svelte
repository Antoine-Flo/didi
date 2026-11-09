<script lang="ts">
  // In the canvas's bottom corner, away from the panels: the cursor's position on the document
  // (in pixel art), its name after a round (red while changes are unsaved, an empty gray ring
  // once saved) and its size, between thin lines.
  // The size, which does not change, is in the corner; the position, whose width changes with
  // its digits, at the other end, where it moves nothing else. The dot has a place of its own: saving moves nothing either. Only
  // information: clicks go through to the canvas.

  import type { Point } from "#lib/render/camera.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    name,
    unsaved,
    width,
    height,
    cursor,
    corner,
  }: {
    name: string;
    unsaved: boolean;
    width: number;
    height: number;
    /** Position on the drawing, in pixels: "0, 0" when the pointer is elsewhere. Not shown if
     *  undefined. */
    cursor?: Point | null;
    /** The corner it is in: the size is on that side. */
    corner: "left" | "right";
  } = $props();
</script>

<div class="panel document-info" class:left={corner === "left"}>
  {#if cursor !== undefined}
    <span>{m.info_cursor({ x: cursor?.x ?? 0, y: cursor?.y ?? 0 })}</span>
    <span class="line"></span>
  {/if}
  <span class="document">
    <span
      class="dirty"
      class:unsaved
      role="img"
      aria-label={unsaved ? m.titlebar_unsaved() : m.info_saved()}
    ></span>
    <span class="name">{name}</span>
  </span>
  <span class="line"></span>
  <span>{m.info_document_size({ width, height })}</span>
</div>

<style>
  .document-info {
    display: flex;
    gap: var(--space);
    align-items: center;
    max-width: 100%;
    height: var(--control-height);
    padding: 0 var(--space);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
  }

  /* In the left corner: the size on the left, the position on the right. */
  .left {
    flex-direction: row-reverse;
  }

  /* Between two items, like the separators of the menus. */
  .line {
    flex: none;
    align-self: stretch;
    width: 1px;
    margin: calc(var(--space) / 2) 0;
    background: var(--border);
  }

  /* A long name is cut, not the numbers. */
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The dot, then the name, in this order on either side. The name is cut first. */
  .document {
    display: flex;
    gap: calc(var(--space) * 0.75);
    align-items: center;
    min-width: 0;
  }

  /* A round drawn rather than "●", whose place in the line depends on the font: centered on
     the text. Saved, an empty gray ring; with unsaved changes, filled in red, to be seen. The
     same size either way: nothing moves. */
  .dirty {
    flex: none;
    box-sizing: border-box;
    width: calc(8px * var(--ui-scale));
    height: calc(8px * var(--ui-scale));
    border: 1px solid var(--text-faint);
    border-radius: 50%;
  }

  .dirty.unsaved {
    background: var(--danger);
    border-color: var(--danger);
  }
</style>
