<script lang="ts">
  // HSV color picker. The selector is a square (saturation and value) with a hue bar under
  // it, or a wheel: a hue ring around that square or around a triangle (like Krita's). Then
  // what the parent adds (e.g. the shades), and the hex code unless the parent shows it
  // elsewhere.

  import type { Snippet } from "svelte";
  import {
    fromHex,
    hsvToRgb,
    rgbToHsv,
    sameColor,
    toHex,
    type HSV,
    type RGB,
  } from "#lib/core/color/color.js";
  import type { ColorSelector } from "#lib/app/shell/layout-prefs.svelte.js";
  import { pointerDrag } from "#lib/app/panels/pointer-drag.js";
  import { paintTriangle, triangleColor, trianglePoint } from "#lib/app/panels/color-triangle.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    color,
    fill = false,
    selector = "square",
    hexRow = true,
    children,
    onchange,
    ondragstart,
    ondragend,
  }: {
    /** Null: no color is selected. The hue and the area stay, without their markers. */
    color: RGB | null;
    /**
     * Fills the height given by the parent (a resized panel): the selector takes the height
     * left. Otherwise it is square.
     */
    fill?: boolean;
    selector?: ColorSelector;
    /** The hex code and a swatch at the bottom. */
    hexRow?: boolean;
    /** Shown after the selector (e.g. the shades and the recent colors). */
    children?: Snippet;
    onchange: (color: RGB) => void;
    /** A drag in the selector starts: the changes until its end go together. */
    ondragstart?: () => void;
    ondragend?: () => void;
  } = $props();

  // Kept here rather than derived from `color`: gray and black have no hue or saturation,
  // which must not jump back to red while dragging through them.
  let hsv = $state<HSV>({ h: 0, s: 0, v: 0 });
  $effect.pre(() => {
    if (color && !sameColor(hsvToRgb(hsv), color)) {
      hsv = rgbToHsv(color);
    }
  });

  function set(next: HSV) {
    hsv = next;
    const rgb = hsvToRgb(next);
    if (!color || !sameColor(rgb, color)) {
      onchange(rgb);
    }
  }

  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const MAX_HUE = 359.99;

  /** A drag in a part of the selector. */
  const drag = (update: (x: number, y: number, down: boolean) => void, clamped = true) =>
    pointerDrag({ update, clamped, onstart: () => ondragstart?.(), onend: () => ondragend?.() });

  const square = drag((x, y) => set({ h: hsv.h, s: x, v: 1 - y }));
  const hue = drag((x) => set({ ...hsv, h: Math.min(x * 360, MAX_HUE) }));

  // The wheel, in fractions of its width: the ring from RING_INNER to the edge (0.5 from the
  // center), the square or the triangle inside it, their corners against the ring.
  const RING_INNER = 0.43;
  const SQUARE_HALF = RING_INNER / Math.SQRT2;
  const RING_MIDDLE = (0.5 + RING_INNER) / 2;
  /** What the drag in the wheel moves, chosen where it starts. */
  let wheelPart: "ring" | "inner" = "inner";
  const wheel = drag((x, y, down) => {
    const dx = x - 0.5;
    const dy = y - 0.5;
    if (down) {
      wheelPart = Math.hypot(dx, dy) >= RING_INNER ? "ring" : "inner";
    }
    if (wheelPart === "ring") {
      // 0° at the top, clockwise, like the ring's gradient.
      const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
      set({ ...hsv, h: Math.min((degrees + 360) % 360, MAX_HUE) });
    } else if (selector === "triangle") {
      set({ h: hsv.h, ...triangleColor(RING_INNER, { x, y }, hsv.s) });
    } else {
      const s = clamp((dx + SQUARE_HALF) / (2 * SQUARE_HALF));
      const v = 1 - clamp((dy + SQUARE_HALF) / (2 * SQUARE_HALF));
      set({ h: hsv.h, s, v });
    }
  }, false);
  const hueAngle = $derived((hsv.h * Math.PI) / 180);
  const trianglePosition = $derived(trianglePoint(RING_INNER, hsv.s, hsv.v));

  // The triangle is painted pixel by pixel (CSS gradients cannot mix three corners), at the
  // wheel's size on screen, again when the hue changes.
  let wheelElement = $state<HTMLElement>();
  let triangleCanvas = $state<HTMLCanvasElement>();
  let wheelSize = $state(0);
  /** Only the hue changes the triangle: moving in it does not paint it again. */
  const triangleHue = $derived(hsv.h);
  $effect(() => {
    if (!wheelElement) {
      return;
    }
    const observer = new ResizeObserver(() => (wheelSize = wheelElement?.clientWidth ?? 0));
    observer.observe(wheelElement);
    return () => observer.disconnect();
  });
  $effect(() => {
    const canvas = triangleCanvas;
    const size = Math.round(wheelSize * Math.min(2, window.devicePixelRatio || 1));
    const context = canvas?.getContext("2d");
    if (!canvas || !context || size === 0) {
      return;
    }
    canvas.width = canvas.height = size;
    const image = context.createImageData(size, size);
    paintTriangle(image.data, size, RING_INNER, triangleHue);
    context.putImageData(image, 0, 0);
  });

  const hex = $derived(color ? toHex(color) : "");
</script>

<div class="picker" class:fill>
  {#if selector !== "square"}
    <div class="area">
      <div
        class="wheel"
        style:--hue="hsl({hsv.h} 100% 50%)"
        style:--square-inset="{(0.5 - SQUARE_HALF) * 100}%"
        style:--ring-inner="{RING_INNER * 200}%"
        role="slider"
        aria-label={m.color_wheel()}
        aria-valuenow={Math.round(hsv.h)}
        tabindex="-1"
        bind:this={wheelElement}
        {...wheel}
      >
        <span class="ring"></span>
        {#if selector === "triangle"}
          <canvas class="triangle" bind:this={triangleCanvas}></canvas>
          {#if color}
            <span
              class="marker"
              style:left="{trianglePosition.x * 100}%"
              style:top="{trianglePosition.y * 100}%"
              style:background={hex}
            ></span>
          {/if}
        {:else}
          <span class="inner sv">
            {#if color}
              <span
                class="marker"
                style:left="{hsv.s * 100}%"
                style:top="{(1 - hsv.v) * 100}%"
                style:background={hex}
              ></span>
            {/if}
          </span>
        {/if}
        {#if color}
          <span
            class="marker"
            style:left="{50 + Math.sin(hueAngle) * RING_MIDDLE * 100}%"
            style:top="{50 - Math.cos(hueAngle) * RING_MIDDLE * 100}%"
            style:background="hsl({hsv.h} 100% 50%)"
          ></span>
        {/if}
      </div>
    </div>
  {:else}
    <div
      class="square sv"
      style:--hue="hsl({hsv.h} 100% 50%)"
      role="slider"
      aria-label={m.color_saturation_value()}
      aria-valuenow={Math.round(hsv.s * 100)}
      tabindex="-1"
      {...square}
    >
      {#if color}
        <span
          class="marker"
          style:left="{hsv.s * 100}%"
          style:top="{(1 - hsv.v) * 100}%"
          style:background={hex}
        ></span>
      {/if}
    </div>

    <div
      class="hue"
      role="slider"
      aria-label={m.color_hue()}
      aria-valuenow={Math.round(hsv.h)}
      tabindex="-1"
      {...hue}
    >
      {#if color}
        <span
          class="marker"
          style:left="{(hsv.h / 360) * 100}%"
          style:background="hsl({hsv.h} 100% 50%)"
        ></span>
      {/if}
    </div>
  {/if}

  {@render children?.()}

  {#if hexRow}
    <div class="row">
      <span class="swatch" class:none={!color} style:background-color={hex}></span>
      <input
        type="text"
        value={hex}
        spellcheck="false"
        aria-label={m.color_hex()}
        onchange={(e) => {
          const rgb = fromHex(e.currentTarget.value);
          if (rgb) {
            onchange(rgb);
          } else {
            e.currentTarget.value = hex;
          }
        }}
      />
    </div>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--space);
  }

  .square,
  .hue,
  .wheel {
    position: relative;
    cursor: crosshair;
    touch-action: none;
  }

  /* Saturation from left to right, value from bottom to top, on the hue. */
  .sv {
    background:
      linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent),
      var(--hue);
  }

  .square {
    flex: none;
    aspect-ratio: 1;
  }

  .fill {
    flex: 1;
    min-height: 0;
  }

  .fill .square {
    flex: 1;
    min-height: calc(40px * var(--ui-scale));
    aspect-ratio: auto;
  }

  /* The wheel's room: as wide as the panel, or, filling a resized panel, the height left. The
     wheel stays round, as large as fits. */
  .area {
    flex: none;
  }

  /* Centered in the room it has. */
  .fill .area {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: calc(60px * var(--ui-scale));
    container-type: size;
  }

  .wheel {
    width: 100%;
    aspect-ratio: 1;
  }

  .fill .wheel {
    flex: none;
    width: min(100cqw, 100cqh);
  }

  .ring,
  .inner,
  .triangle {
    position: absolute;
  }

  .triangle {
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* The hue from red at the top, clockwise: a conic gradient with its middle cut out. */
  .ring {
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
    --ring-mask: radial-gradient(
      closest-side,
      transparent calc(var(--ring-inner) - 0.5%),
      #000 var(--ring-inner)
    );
    -webkit-mask: var(--ring-mask);
    mask: var(--ring-mask);
  }

  .inner {
    inset: var(--square-inset);
  }

  .hue,
  .row {
    flex: none;
  }

  .hue {
    height: calc(10px * var(--ui-scale));
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
    width: calc(12px * var(--ui-scale));
    height: calc(12px * var(--ui-scale));
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #0006;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  /* On the hue bar, a smaller and thinner ring. */
  .hue .marker {
    top: 50%;
    width: calc(10px * var(--ui-scale));
    height: calc(10px * var(--ui-scale));
    border-width: 1.5px;
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

  .swatch.none {
    background: repeating-conic-gradient(var(--field-border) 0 25%, var(--field) 0 50%) 0 0 / 8px
      8px;
  }

  .row input {
    flex: 1;
    font-variant-numeric: tabular-nums;
  }
</style>
