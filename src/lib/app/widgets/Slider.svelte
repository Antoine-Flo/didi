<script lang="ts">
  // A labeled slider, the same everywhere: label, track, value.

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
</script>

<label class="slider" {title}>
  <span class="label">{label}</span>
  <input
    type="range"
    {min}
    {max}
    {step}
    {value}
    oninput={(e) => oninput(Number(e.currentTarget.value))}
    onpointerdown={onstart}
    onpointerup={onend}
    onpointercancel={onend}
  />
  <span class="value">{display}</span>
</label>

<style>
  .slider {
    display: flex;
    align-items: center;
    gap: var(--space);
    min-width: 0;
  }

  .label {
    flex: none;
    /* Set by a parent to align the sliders of a column. */
    width: var(--slider-label-width, auto);
    color: var(--text-muted);
  }

  input {
    flex: 1;
    min-width: calc(60px * var(--ui-scale));
  }

  .value {
    flex: none;
    font-variant-numeric: tabular-nums;
  }
</style>
