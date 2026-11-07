<script lang="ts">
  // A labeled slider, the same everywhere: a bar filled up to the value, with the label and
  // the value written on it (like Krita's or Blender's). Pressed or dragged anywhere on the
  // bar: easy to catch with a finger. A native range input, invisible, does the work
  // (pointer, touch, keyboard, accessibility).

  let {
    label,
    value,
    min = 0,
    max = 1,
    step = 0.01,
    display,
    oninput,
    onstart,
    onend,
    title,
  }: {
    label: string;
    /** Position of the slider, between `min` and `max`. */
    value: number;
    min?: number;
    max?: number;
    step?: number;
    /** The value shown to the user, e.g. "40 px". */
    display: string;
    oninput: (value: number) => void;
    /** Start and end of a drag, e.g. to group the changes into one undo step. */
    onstart?: () => void;
    onend?: () => void;
    title?: string;
  } = $props();

  const fill = $derived(max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0);
</script>

<label class="slider" {title}>
  <span class="fill" style:width="{fill * 100}%"></span>
  <span class="label">{label}</span>
  <span class="value">{display}</span>
  <input
    type="range"
    {min}
    {max}
    {step}
    {value}
    aria-label={label}
    aria-valuetext={display}
    oninput={(e) => oninput(Number(e.currentTarget.value))}
    onpointerdown={onstart}
    onpointerup={onend}
    onpointercancel={onend}
  />
</label>

<style>
  .slider {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space);
    box-sizing: border-box;
    min-width: 0;
    height: var(--control-height);
    padding: 0 var(--space);
    overflow: hidden;
    white-space: nowrap;
    background: var(--field);
    border: 1px solid var(--field-border);
    border-radius: var(--radius-small);
    cursor: ew-resize;
  }

  .slider:hover {
    border-color: var(--text-faint);
  }

  .slider:has(input:focus-visible) {
    outline: 1px solid var(--accent);
  }

  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--field-border);
    pointer-events: none;
  }

  .label,
  .value {
    position: relative;
    pointer-events: none;
  }

  .label {
    min-width: 0;
    overflow: hidden;
    color: var(--text-muted);
    text-overflow: ellipsis;
  }

  .value {
    flex: none;
    font-variant-numeric: tabular-nums;
  }

  /* Over the whole bar, invisible. A thin thumb: the value follows the pointer across the
     whole width, matching the fill. */
  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }

  input:focus-visible {
    outline: none;
  }

  input::-webkit-slider-runnable-track {
    height: 100%;
    background: none;
  }

  input::-webkit-slider-thumb {
    width: 1px;
    height: 100%;
    margin: 0;
  }

  input::-moz-range-thumb {
    width: 1px;
    height: 100%;
    border: none;
  }
</style>
