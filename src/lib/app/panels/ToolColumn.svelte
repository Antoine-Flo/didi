<script lang="ts">
  // The tools of the mode, in a thin column beside the panels. A grip at the bottom moves it
  // up or down along them (drag it, or the arrow keys); a double-click centers it again.
  // Its place is a fraction of the free height (0 at the top, 1 at the bottom), so it stays
  // in proportion when the window changes size; it is rounded to whole pixels, as a
  // fractional position would blur the icons.

  import { GripHorizontal } from "@lucide/svelte";
  import ToolButton from "#lib/app/panels/ToolButton.svelte";
  import type { Tool, ToolSettings } from "#lib/app/tools/tool.js";

  let {
    tools,
    active,
    settings,
    side,
    trackHeight,
    position,
    element = $bindable(),
    onmove,
    onreset,
    tip,
    run,
  }: {
    tools: Tool[];
    /** Id of the active tool. */
    active: string;
    /** Every tool's settings, by id. */
    settings: Record<string, ToolSettings>;
    /** Where the tools' popups open: towards the canvas. */
    side: "left" | "right";
    /** The height the column can move in, in pixels. */
    trackHeight: number;
    /** 0 at the top, 1 at the bottom. */
    position: number;
    element?: HTMLElement;
    onmove: (position: number) => void;
    onreset: () => void;
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
  } = $props();

  const KEY_STEP = 16;

  let height = $state(0);
  /** How far down the column can go. */
  const free = $derived(Math.max(0, trackHeight - height));
  const top = $derived(Math.round(position * free));

  let drag: { pointer: number; from: number; top: number } | null = null;

  function moveTo(nextTop: number) {
    if (free > 0) onmove(Math.min(free, Math.max(0, nextTop)) / free);
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { pointer: e.pointerId, from: e.clientY, top };
  }

  function onpointermove(e: PointerEvent) {
    if (drag?.pointer === e.pointerId) moveTo(drag.top + e.clientY - drag.from);
  }

  function end(e: PointerEvent) {
    if (drag?.pointer === e.pointerId) drag = null;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    moveTo(top + (e.key === "ArrowDown" ? KEY_STEP : -KEY_STEP));
  }
</script>

<aside class="panel tool-column" style:top="{top}px" bind:this={element} bind:clientHeight={height}>
  {#each tools as t, i (t.id)}
    {#if i > 0 && (tools[i - 1].section ?? "draw") !== (t.section ?? "draw")}
      <hr />
    {/if}
    <ToolButton tool={t} active={active === t.id} settings={settings[t.id]} {side} {tip} {run} />
  {/each}

  <button
    class="grip"
    title="Drag to move, double-click to center"
    aria-label="Move the tools"
    {onpointerdown}
    {onpointermove}
    onpointerup={end}
    onpointercancel={end}
    ondblclick={onreset}
    {onkeydown}
  >
    <GripHorizontal class="icon-small" />
  </button>
</aside>

<style>
  .tool-column {
    position: absolute;
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: calc(var(--space) / 2);
    pointer-events: auto;
  }

  hr {
    flex: none;
    width: 100%;
    height: 1px;
    margin: calc(var(--space) / 2) 0;
    background: var(--border);
    border: none;
  }

  /* Smaller than a tool, and quieter. */
  .grip {
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(var(--control-height) / 2 + 2px);
    padding: 0;
    color: var(--text-faint);
    touch-action: none;
    cursor: grab;
  }

  .grip:hover {
    color: var(--text-muted);
  }

  .grip:active {
    cursor: grabbing;
  }
</style>
