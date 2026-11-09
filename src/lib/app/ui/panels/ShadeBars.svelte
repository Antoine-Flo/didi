<script lang="ts">
  // Shade bars, like Krita's minimal shade selector: hue, saturation and lightness around the
  // current color, which stays in the middle (see shades.ts). Pressing a bar takes the shade
  // there; dragging along it tries the others, the bars still around the color the drag
  // started from. Released, they center on the new color.

  import { sameColor, toHex, type RGB } from "#lib/core/color/color.js";
  import { shade, SHADE_KINDS, type ShadeKind } from "#lib/core/color/shades.js";
  import { pointerDrag } from "#lib/app/shared/pointer-drag.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    color,
    onchange,
    ondragstart,
    ondragend,
  }: {
    /** The current color. Null: no bars. */
    color: RGB | null;
    onchange: (color: RGB) => void;
    /** A drag starts: the changes until its end go together. */
    ondragstart?: () => void;
    ondragend?: () => void;
  } = $props();

  /** While dragging: the color the bars stay around, and where the pointer is on its bar. */
  let drag = $state<{ base: RGB; kind: ShadeKind; t: number } | null>(null);
  const base = $derived(drag?.base ?? color);

  /** Colors along each bar, as CSS gradients. */
  const STOPS = 17;
  const gradients = $derived.by(() => {
    if (!base) {
      return null;
    }
    const center = base;
    const line = (kind: ShadeKind) =>
      Array.from({ length: STOPS }, (_, i) =>
        toHex(shade(center, kind, (i / (STOPS - 1)) * 2 - 1)),
      );
    return Object.fromEntries(
      SHADE_KINDS.map((kind) => [kind, `linear-gradient(to right, ${line(kind).join(", ")})`]),
    ) as Record<ShadeKind, string>;
  });

  const LABELS: Record<ShadeKind, () => string> = {
    hue: m.color_hue,
    chroma: m.color_saturation,
    lightness: m.color_lightness,
  };

  const handlers = Object.fromEntries(
    SHADE_KINDS.map((kind) => [
      kind,
      pointerDrag({
        update: (x, _, down) => {
          if (down) {
            if (!color) {
              return;
            }
            drag = { base: color, kind, t: 0 };
          }
          if (!drag) {
            return;
          }
          drag.t = x * 2 - 1;
          const next = shade(drag.base, kind, drag.t);
          if (!color || !sameColor(next, color)) {
            onchange(next);
          }
        },
        onstart: () => ondragstart?.(),
        onend: () => {
          drag = null;
          ondragend?.();
        },
      }),
    ]),
  ) as Record<ShadeKind, ReturnType<typeof pointerDrag>>;
</script>

{#if gradients && color}
  <div class="shades">
    {#each SHADE_KINDS as kind (kind)}
      {@const t = drag?.kind === kind ? drag.t : 0}
      <div
        class="bar"
        style:background={gradients[kind]}
        role="slider"
        aria-label={LABELS[kind]()}
        aria-valuenow={Math.round(t * 100)}
        tabindex="-1"
        {...handlers[kind]}
      >
        <span class="marker" style:left="{(t + 1) * 50}%" style:background={toHex(color)}></span>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Close together, as one block, like the hue bar. */
  .shades {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: calc(var(--space) / 2);
  }

  .bar {
    position: relative;
    height: calc(10px * var(--ui-scale));
    cursor: crosshair;
    touch-action: none;
  }

  .marker {
    position: absolute;
    top: 50%;
    box-sizing: border-box;
    width: calc(10px * var(--ui-scale));
    height: calc(10px * var(--ui-scale));
    border: 1.5px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #0006;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
</style>
