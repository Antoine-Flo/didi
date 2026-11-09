<script lang="ts">
  // The Interface tab of the preferences: the theme (dark or light, in color or grayscale, the
  // canvas's background, picked in a popup and reset to the theme's), the side of the panels, the compact layout and the interface size. Applied
  // at once and kept (see theme-prefs and layout-prefs).

  import { RotateCcw, ZoomIn, ZoomOut } from "@lucide/svelte";
  import { Popover } from "bits-ui";
  import ColorPicker from "#lib/app/ui/panels/ColorPicker.svelte";
  import Segmented from "#lib/app/ui/widgets/Segmented.svelte";
  import { fromHex, toHex } from "#lib/core/color/color.js";
  import { buildTheme, type ThemeMode } from "#lib/app/prefs/theme.js";
  import { themePrefs } from "#lib/app/prefs/theme-prefs.svelte.js";
  import {
    type CompactMode,
    type Hand,
    UI_SCALE_MAX,
    UI_SCALE_MIN,
    UI_SCALE_STEP,
  } from "#lib/app/prefs/layout-prefs.js";
  import type { LayoutPrefs } from "#lib/app/prefs/layout-prefs.svelte.js";
  import { m } from "#lib/paraglide/messages.js";

  let { layout }: { layout: LayoutPrefs } = $props();

  /** The canvas's background: the chosen color, or the theme's. */
  const canvasColor = $derived(themePrefs.theme.tokens["canvas-bg"]);
  const themeCanvasColor = $derived(
    buildTheme({ ...themePrefs.choice, canvas: null }).tokens["canvas-bg"],
  );
</script>

<div class="settings">
  <div class="row">
    <span>{m.theme_mode()}</span>
    <Segmented
      label={m.theme_mode()}
      value={themePrefs.choice.mode}
      choices={[
        { value: "dark", label: m.theme_dark() },
        { value: "light", label: m.theme_light() },
      ]}
      onselect={(mode) => themePrefs.set("mode", mode as ThemeMode)}
    />
  </div>
  <div class="row">
    <span>{m.theme_tint()}</span>
    <Segmented
      label={m.theme_tint()}
      value={themePrefs.choice.tint ? "on" : "off"}
      choices={[
        { value: "on", label: m.theme_color(), title: m.theme_tint_on_title() },
        { value: "off", label: m.theme_grayscale(), title: m.theme_tint_off_title() },
      ]}
      onselect={(tint) => themePrefs.set("tint", tint === "on")}
    />
  </div>
  <div class="row">
    <span>{m.theme_canvas()}</span>
    <div class="canvas">
      <button
        class="icon"
        title={m.theme_canvas_reset()}
        aria-label={m.theme_canvas_reset()}
        disabled={themePrefs.choice.canvas === null}
        onclick={() => themePrefs.set("canvas", null)}
      >
        <RotateCcw />
      </button>
      <Popover.Root>
        <Popover.Trigger class="canvas-swatch" title={m.theme_canvas_pick()}>
          <span style:background={canvasColor}></span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content class="canvas-picker" side="bottom" align="end" sideOffset={4}>
            <ColorPicker
              color={fromHex(canvasColor)}
              onchange={(rgb) => {
                const hex = toHex(rgb);
                themePrefs.set("canvas", hex === themeCanvasColor ? null : hex);
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  </div>
  <div class="row">
    <span>{m.layout_interface_side()}</span>
    <Segmented
      label={m.layout_interface_side()}
      value={layout.hand}
      choices={[
        { value: "right", label: m.layout_right_handed(), title: m.cmd_view_right_handed() },
        { value: "left", label: m.layout_left_handed(), title: m.cmd_view_left_handed() },
      ]}
      onselect={(hand) => (layout.hand = hand as Hand)}
    />
  </div>
  <div class="row">
    <span>{m.layout_compact()}</span>
    <Segmented
      label={m.layout_compact()}
      value={layout.compact}
      choices={[
        { value: "auto", label: m.layout_compact_auto(), title: m.layout_compact_auto_title() },
        { value: "on", label: m.layout_on(), title: m.layout_compact_on_title() },
        { value: "off", label: m.layout_off(), title: m.layout_compact_off_title() },
      ]}
      onselect={(mode) => (layout.compact = mode as CompactMode)}
    />
  </div>
  <div class="row">
    <span>{m.layout_interface_size()}</span>
    <div class="size">
      <button
        class="icon"
        title={m.layout_smaller()}
        aria-label={m.layout_smaller()}
        disabled={layout.uiScale <= UI_SCALE_MIN}
        onclick={() => (layout.uiScale -= UI_SCALE_STEP)}
      >
        <ZoomOut />
      </button>
      <span class="value">{layout.uiScale}%</span>
      <button
        class="icon"
        title={m.layout_larger()}
        aria-label={m.layout_larger()}
        disabled={layout.uiScale >= UI_SCALE_MAX}
        onclick={() => (layout.uiScale += UI_SCALE_STEP)}
      >
        <ZoomIn />
      </button>
    </div>
  </div>
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: var(--space);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space);
  }

  .size {
    display: flex;
    align-items: center;
  }

  .canvas {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  /* The color, like a field: as tall as the controls beside it. */
  :global(.canvas-swatch) {
    width: calc(var(--control-height) * 2);
    padding: 3px;
    background: var(--field);
    border: 1px solid var(--field-border);
  }

  :global(.canvas-swatch > span) {
    display: block;
    height: 100%;
    border-radius: 2px;
  }

  :global(.canvas-picker) {
    z-index: 60;
    box-sizing: border-box;
    width: calc(200px * var(--ui-scale));
    padding: var(--space);
    background: var(--popup);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .value {
    width: var(--percent-width);
    text-align: center;
  }
</style>
