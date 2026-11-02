<script lang="ts">
  // HSV color picker: saturation and value in the square, hue in the bar, and the hex code.

  import {
    fromHex,
    hsvToRgb,
    rgbToHsv,
    sameColor,
    toHex,
    type HSV,
    type RGB,
  } from "#lib/core/color/color.js";

  let {
    color,
    fill = false,
    onchange,
  }: {
    color: RGB;
    /**
     * Fills the height given by the parent (a resized panel): the saturation and value area
     * takes the height left. Otherwise that area is square.
     */
    fill?: boolean;
    onchange: (color: RGB) => void;
  } = $props();

  // Kept here rather than derived from `color`: gray and black have no hue or saturation,
  // which must not jump back to red while dragging through them.
  let hsv = $state<HSV>({ h: 0, s: 0, v: 0 });
  $effect.pre(() => {
    if (!sameColor(hsvToRgb(hsv), color)) hsv = rgbToHsv(color);
  });

  function set(next: HSV) {
    hsv = next;
    const rgb = hsvToRgb(next);
    if (!sameColor(rgb, color)) onchange(rgb);
  }

  const clamp = (x: number) => Math.min(1, Math.max(0, x));

  /** Pointer drag on an element: `update` receives the position, 0 to 1 on each axis. */
  function drag(update: (x: number, y: number) => void) {
    const at = (e: PointerEvent) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      update(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height));
    };
    return {
      onpointerdown(e: PointerEvent) {
        if (e.button !== 0) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        at(e);
      },
      onpointermove(e: PointerEvent) {
        if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) at(e);
      },
    };
  }

  const square = drag((x, y) => set({ h: hsv.h, s: x, v: 1 - y }));
  const hue = drag((x) => set({ ...hsv, h: Math.min(x * 360, 359.99) }));
  const hex = $derived(toHex(color));
</script>

<div class="picker" class:fill>
  <div
    class="square"
    style:--hue="hsl({hsv.h} 100% 50%)"
    role="slider"
    aria-label="Saturation and value"
    aria-valuenow={Math.round(hsv.s * 100)}
    tabindex="-1"
    {...square}
  >
    <span
      class="marker"
      style:left="{hsv.s * 100}%"
      style:top="{(1 - hsv.v) * 100}%"
      style:background={hex}
    ></span>
  </div>

  <div
    class="hue"
    role="slider"
    aria-label="Hue"
    aria-valuenow={Math.round(hsv.h)}
    tabindex="-1"
    {...hue}
  >
    <span
      class="marker"
      style:left="{(hsv.h / 360) * 100}%"
      style:background="hsl({hsv.h} 100% 50%)"
    ></span>
  </div>

  <div class="row">
    <span class="swatch" style:background={hex}></span>
    <input
      type="text"
      value={hex}
      spellcheck="false"
      aria-label="Hex color"
      onchange={(e) => {
        const rgb = fromHex(e.currentTarget.value);
        if (rgb) onchange(rgb);
        else e.currentTarget.value = hex;
      }}
    />
  </div>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--space);
  }

  .square,
  .hue {
    position: relative;
    border-radius: var(--radius-small);
    cursor: crosshair;
    touch-action: none;
  }

  .square {
    flex: none;
    aspect-ratio: 1;
    background:
      linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent),
      var(--hue);
  }

  .fill {
    flex: 1;
    min-height: 0;
  }

  .fill .square {
    flex: 1;
    min-height: 40px;
    aspect-ratio: auto;
  }

  .hue,
  .row {
    flex: none;
  }

  .hue {
    height: 10px;
    background: linear-gradient(
      to right,
      #f00 0%,
      #ff0 16.67%,
      #0f0 33.33%,
      #0ff 50%,
      #00f 66.67%,
      #f0f 83.33%,
      #f00 100%
    );
  }

  .marker {
    position: absolute;
    box-sizing: border-box;
    width: 12px;
    height: 12px;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #0006;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .hue .marker {
    top: 50%;
  }

  .row {
    display: flex;
    gap: var(--space);
  }

  .swatch {
    flex: none;
    width: var(--control-height);
    height: var(--control-height);
    border-radius: var(--radius-small);
    box-shadow: inset 0 0 0 1px #ffffff1a;
  }

  .row input {
    flex: 1;
    font-variant-numeric: tabular-nums;
  }
</style>
