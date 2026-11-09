<script lang="ts">
  // The color panel, organized like the palette and layers ones: a header (the two colors,
  // the hex code of the current one, the ⋮ menu choosing what the panel shows), then the
  // picker, the shade bars and the recent colors.

  import { Check } from "@lucide/svelte";
  import { DropdownMenu } from "bits-ui";
  import { devicePixelRatio } from "svelte/reactivity/window";
  import { fromHex, toHex, type RGB } from "#lib/core/color/color.js";
  import {
    COLOR_SELECTORS,
    type ColorPanelPrefs,
    type Hand,
    type ColorSelector,
  } from "#lib/app/prefs/layout-prefs.js";
  import PanelMenu from "#lib/app/ui/widgets/PanelMenu.svelte";
  import ColorPicker from "#lib/app/ui/panels/ColorPicker.svelte";
  import ShadeBars from "#lib/app/ui/panels/ShadeBars.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let {
    prefs,
    onprefs,
    color,
    secondary,
    recent,
    uiScale,
    hand,
    fill = false,
    onchange,
    ondragstart,
    ondragend,
    tip,
    run,
  }: {
    /** What the panel shows (the selector, the shades, the recent colors). */
    prefs: ColorPanelPrefs;
    onprefs: (change: Partial<ColorPanelPrefs>) => void;
    /** The current color, straight RGB. Null: none. */
    color: RGB | null;
    /** The second color, swapped with the current one. Null: none. */
    secondary: RGB | null;
    /** The colors drawn with lately, the latest first. */
    recent: readonly RGB[];
    /** The interface size as a factor (1 at 100%). */
    uiScale: number;
    /** The drawing hand: the latest recent color is on its side, against the canvas. */
    hand: Hand;
    /** Fills the height given by the parent (a resized panel). */
    fill?: boolean;
    onchange: (color: RGB) => void;
    ondragstart?: () => void;
    ondragend?: () => void;
    tip: (command: string) => string;
    run: (command: string, params?: unknown) => void;
  } = $props();

  const hex = $derived(color ? toHex(color) : "");

  // The recent colors' squares, in whole pixels of the screen: with a fractional
  // size (interface size, screen scaling), the edges would round each their own way and the
  // small squares would look uneven.
  const RECENT_SIZE = 12;
  const pixel = $derived(1 / (devicePixelRatio.current ?? 1));
  const recentSize = $derived(Math.max(1, Math.round((RECENT_SIZE * uiScale) / pixel)) * pixel);

  const SELECTOR_LABELS: Record<ColorSelector, () => string> = {
    square: m.color_selector_square,
    wheel: m.color_selector_wheel,
    triangle: m.color_selector_triangle,
  };
</script>

{#snippet check(on: boolean)}
  <span class="menu-lead"
    >{#if on}<Check class="icon-small" />{/if}</span
  >
{/snippet}

<section class="section color">
  <div class="panel-header">
    <!-- The current color in front, the second one behind: a press swaps them. -->
    <button class="colors" title={tip("color.swap")} onclick={() => run("color.swap")}>
      <span
        class="back"
        class:none={!secondary}
        style:background-color={secondary ? toHex(secondary) : undefined}
      ></span>
      <span class="front" class:none={!color} style:background-color={hex || undefined}></span>
    </button>
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
    <PanelMenu title={m.color_menu()}>
      {#each COLOR_SELECTORS as selector (selector)}
        <DropdownMenu.CheckboxItem
          class="menu-item"
          checked={prefs.selector === selector}
          onCheckedChange={() => onprefs({ selector })}
        >
          {@render check(prefs.selector === selector)}
          {SELECTOR_LABELS[selector]()}
        </DropdownMenu.CheckboxItem>
      {/each}
      <DropdownMenu.Separator class="menu-separator" />
      <DropdownMenu.CheckboxItem
        class="menu-item"
        checked={prefs.shades}
        onCheckedChange={(shades) => onprefs({ shades })}
      >
        {@render check(prefs.shades)}
        {m.color_shades()}
      </DropdownMenu.CheckboxItem>
      <DropdownMenu.Separator class="menu-separator" />
      <DropdownMenu.CheckboxItem
        class="menu-item"
        checked={prefs.recent}
        onCheckedChange={(recent) => onprefs({ recent })}
      >
        {@render check(prefs.recent)}
        {m.color_recent()}
      </DropdownMenu.CheckboxItem>
      <DropdownMenu.Item
        class="menu-item"
        disabled={recent.length === 0}
        onSelect={() => run("color.clearRecent")}
      >
        {@render check(false)}
        {m.cmd_color_clear_recent()}
      </DropdownMenu.Item>
    </PanelMenu>
  </div>

  <ColorPicker
    {color}
    {fill}
    selector={prefs.selector}
    hexRow={false}
    {onchange}
    {ondragstart}
    {ondragend}
  >
    {#if prefs.shades}
      <ShadeBars {color} {onchange} {ondragstart} {ondragend} />
    {/if}
    {#if prefs.recent && recent.length > 0}
      <div
        class="recent"
        class:from-right={hand === "right"}
        style:--size="{recentSize}px"
        style:--line="{pixel}px"
        aria-label={m.color_recent()}
      >
        {#each recent as c, i (i)}
          <button
            class="swatch"
            style:background={toHex(c)}
            title={toHex(c)}
            aria-label={toHex(c)}
            onclick={() => run("color.set", { color: toHex(c) })}
          ></button>
        {/each}
      </div>
    {/if}
  </ColorPicker>
</section>

<style>
  .color {
    flex: 1;
    min-height: 0;
  }

  /* The hex code takes the width, not the colors in front of it. */
  .panel-header > .colors {
    flex: none;
  }

  .panel-header > input {
    flex: 1;
    min-width: 0;
    font-variant-numeric: tabular-nums;
  }

  /* Two overlapping squares, like most drawing apps: the current color in front, at the top
     left. */
  .colors {
    position: relative;
    width: calc(var(--control-height) * 1.25);
    padding: 0;
  }

  .front,
  .back {
    position: absolute;
    width: 68%;
    height: 68%;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px #ffffff1a;
  }

  .front {
    top: 6%;
    left: 6%;
    /* A ring of the panel's color, so it stands out from the color behind. */
    outline: 1px solid var(--panel);
  }

  .back {
    right: 6%;
    bottom: 6%;
  }

  .none {
    background: repeating-conic-gradient(var(--field-border) 0 25%, var(--field) 0 50%) 0 0 / 6px
      6px;
  }

  /* One band of small squares at the bottom (like Krita's), side by side with no gap, the
     latest nearest the drawing hand: against the canvas. Between two rails, a line of one
     screen pixel above and below across the panel, touching the squares: a straight edge for
     the eye. Nothing while there are none. Plain squares: no outline, no mark on the current
     color. */
  .recent {
    display: flex;
    flex: none;
    border-block: var(--line) solid var(--border);
  }

  .recent.from-right {
    flex-direction: row-reverse;
  }

  .swatch {
    flex: none;
    min-width: 0;
    width: var(--size);
    height: var(--size);
    padding: 0;
    border-radius: 0;
  }
</style>
