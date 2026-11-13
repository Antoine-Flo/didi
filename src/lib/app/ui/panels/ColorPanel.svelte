<script lang="ts">
  // The color panel, organized like the palette and layers ones: a header (the two colors,
  // the hex code of the current one, the ⋮ menu choosing the selector), then the picker.

  import { Check } from "@lucide/svelte";
  import { DropdownMenu } from "bits-ui";
  import { fromHex, toHex, type RGB } from "#lib/core/color/color.js";
  import { COLOR_SELECTORS, type ColorSelector } from "#lib/app/prefs/layout-prefs.js";
  import PanelMenu from "#lib/app/ui/widgets/PanelMenu.svelte";
  import ColorPicker from "#lib/app/ui/panels/ColorPicker.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let {
    selector,
    onselector,
    color,
    secondary,
    fill = false,
    onchange,
    ondragstart,
    ondragend,
    tip,
    run,
  }: {
    selector: ColorSelector;
    onselector: (selector: ColorSelector) => void;
    /** The current color, straight RGB. Null: none. */
    color: RGB | null;
    /** The second color, swapped with the current one. Null: none. */
    secondary: RGB | null;
    /** Fills the height given by the parent (a resized panel). */
    fill?: boolean;
    onchange: (color: RGB) => void;
    ondragstart?: () => void;
    ondragend?: () => void;
    tip: (command: string) => string;
    run: (command: string, params?: unknown) => void;
  } = $props();

  const hex = $derived(color ? toHex(color) : "");

  const SELECTOR_LABELS: Record<ColorSelector, () => string> = {
    square: m.color_selector_square,
    wheel: m.color_selector_wheel,
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
      {#each COLOR_SELECTORS as choice (choice)}
        <DropdownMenu.CheckboxItem
          class="menu-item"
          checked={selector === choice}
          onCheckedChange={() => onselector(choice)}
        >
          {@render check(selector === choice)}
          {SELECTOR_LABELS[choice]()}
        </DropdownMenu.CheckboxItem>
      {/each}
    </PanelMenu>
  </div>

  <ColorPicker {color} {fill} {selector} hexRow={false} {onchange} {ondragstart} {ondragend} />
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
</style>
