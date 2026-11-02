<script lang="ts">
  // A handle between two panels, to resize one of them by dragging (mouse or pen) or with
  // the arrow keys. A double-click goes back to the default size. It fills the gap between
  // the panels, without adding space. Sizes are usually kept in LayoutPrefs.

  let {
    orientation,
    measure,
    after = false,
    onresize,
    onreset,
  }: {
    /** "horizontal": a line between stacked panels, which changes heights. */
    orientation: "horizontal" | "vertical";
    /** The panel's size now, and the limits for this drag, in pixels. */
    measure: () => { size: number; min: number; max: number };
    /** The resized panel comes after the handle (below or right), not before. */
    after?: boolean;
    onresize: (size: number) => void;
    onreset: () => void;
  } = $props();

  const KEY_STEP = 16;

  let drag = $state<{ pointer: number; from: number; size: number; min: number; max: number }>();

  const position = (e: PointerEvent) => (orientation === "horizontal" ? e.clientY : e.clientX);

  function resize(start: ReturnType<typeof measure>, delta: number) {
    const size = start.size + (after ? -delta : delta);
    onresize(Math.min(start.max, Math.max(start.min, size)));
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { pointer: e.pointerId, from: position(e), ...measure() };
  }

  function onpointermove(e: PointerEvent) {
    if (drag?.pointer !== e.pointerId) return;
    resize(drag, position(e) - drag.from);
  }

  function end(e: PointerEvent) {
    if (drag?.pointer === e.pointerId) drag = undefined;
  }

  function onkeydown(e: KeyboardEvent) {
    const [less, more] =
      orientation === "horizontal" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    if (e.key !== less && e.key !== more) return;
    e.preventDefault();
    resize(measure(), e.key === more ? KEY_STEP : -KEY_STEP);
  }
</script>

<!-- A focusable separator is interactive (WAI-ARIA "window splitter"), Svelte does not know
     it. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="splitter {orientation}"
  class:dragging={drag !== undefined}
  role="separator"
  aria-orientation={orientation}
  tabindex="0"
  title="Drag to resize, double-click to reset"
  {onpointerdown}
  {onpointermove}
  onpointerup={end}
  onpointercancel={end}
  ondblclick={onreset}
  {onkeydown}
></div>

<style>
  /* As thick as the gap around it, with negative margins: it takes no room of its own. */
  .splitter {
    flex: none;
    position: relative;
    touch-action: none;
    --thickness: calc(var(--space) / 2);
  }

  .horizontal {
    height: var(--thickness);
    margin: calc(-1 * var(--thickness)) 0;
    cursor: row-resize;
  }

  .vertical {
    width: var(--thickness);
    margin: 0 calc(-1 * var(--thickness));
    cursor: col-resize;
  }

  /* A thin line while hovered or dragged. */
  .splitter::after {
    content: "";
    position: absolute;
    border-radius: 1px;
  }

  .horizontal::after {
    inset: calc(50% - 1px) var(--radius);
  }

  .vertical::after {
    inset: var(--radius) calc(50% - 1px);
  }

  .splitter:hover::after,
  .splitter:focus-visible::after,
  .dragging::after {
    background: var(--field-border);
  }

  .splitter:focus-visible {
    outline: none;
  }
</style>
