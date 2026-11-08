<script lang="ts" module>
  export type PanelTab = "color" | "layers";
</script>

<script lang="ts">
  // The column of panels beside the canvas: separate panels, with a small gap between them
  // (like Blender): the color, the palette and the layers, the first two resizable. Their
  // sizes are kept in LayoutPrefs. Short of height, one tab at a time: the color with the
  // palette, or the layers, each with the whole height.

  import type { RGB } from "#lib/core/color/color.js";
  import type { PaletteLibrary } from "#lib/core/color/palette.js";
  import type { Editor } from "#lib/core/editor/editor.js";
  import type { LayoutPrefs } from "#lib/app/shell/layout-prefs.svelte.js";
  import Segmented from "#lib/app/widgets/Segmented.svelte";
  import Splitter from "#lib/app/widgets/Splitter.svelte";
  import ColorPicker from "./ColorPicker.svelte";
  import LayersPanel from "./LayersPanel.svelte";
  import PalettePanel from "./PalettePanel.svelte";
  import { PaletteColorSync } from "./palette-sync.js";

  let {
    layout,
    editor,
    version,
    color,
    oncolor,
    palettes,
    paletteVersion,
    tip,
    shortcut,
    run,
    tab = null,
    tabBar = false,
    ontab = () => {},
  }: {
    layout: LayoutPrefs;
    editor: Editor;
    /** Changes whenever the editor changes, to refresh the panels. */
    version: number;
    /** The current color, straight RGB. Null: none. */
    color: RGB | null;
    oncolor: (color: RGB) => void;
    /** The user's palettes, once loaded. */
    palettes: PaletteLibrary | null;
    /** Changes whenever the palettes change. */
    paletteVersion: number;
    /** Tooltip of a command, with its shortcut. */
    tip: (command: string) => string;
    /** A command's first shortcut, e.g. "Ctrl+J", if it has one. */
    shortcut: (command: string) => string | undefined;
    /** Runs a command (unless a stroke is in progress). */
    run: (command: string, params?: unknown) => void;
    /** The tab shown, or null: every panel. */
    tab?: PanelTab | null;
    /** With tabs, a bar to switch between them (else switched from outside). */
    tabBar?: boolean;
    ontab?: (tab: PanelTab) => void;
  } = $props();

  // The picker also changes the palette color in use, if the palettes are unlocked.
  const sync = new PaletteColorSync(
    () => palettes,
    () => editor.history,
  );

  /** The interface size as a factor. Saved panel sizes are at 100%: they follow it. */
  const uiScale = $derived(layout.uiScale / 100);
  const MIN_COLOR_HEIGHT = 140;
  const MIN_PALETTE_HEIGHT = 60;
  /** Set by the user, else undefined: the panel is as tall as its content. */
  const colorHeight = $derived(layout.size("color"));
  const paletteHeight = $derived(layout.size("palette"));

  /** Swatch size in the palette, in pixels, changed with Ctrl + wheel. */
  const DEFAULT_SWATCH_SIZE = 18;
  const MIN_SWATCH_SIZE = 12;
  const MAX_SWATCH_SIZE = 64;
  const swatchSize = $derived(layout.size("swatch") ?? DEFAULT_SWATCH_SIZE);

  let colorPanel: HTMLElement;
  let palettePanel: HTMLElement;
  let layersPanel: HTMLElement;

  /**
   * A resizable panel's height, and how far it can go: it may take the layers' height down
   * to their minimum.
   */
  function measure(panel: HTMLElement, min: number) {
    // In the color tab, the palette gives way instead.
    const below = tab ? palettePanel : layersPanel;
    const size = panel.getBoundingClientRect().height;
    const rest = below.getBoundingClientRect().height;
    const restMin = parseFloat(getComputedStyle(below).minHeight) || 0;
    return { size, min, max: Math.max(min, size + rest - restMin) };
  }

  const TABS = [
    { value: "color", label: "Color" },
    { value: "layers", label: "Layers" },
  ] as const;

  /** A saved panel size, as CSS. */
  const scaledSize = (size: number | undefined) =>
    size !== undefined ? `calc(${size}px * var(--ui-scale))` : undefined;
</script>

<aside class="column" class:tabbed={tab !== null} data-tab={tab}>
  {#if tab && tabBar}
    <div class="panel tab-bar">
      <Segmented label="Panels" value={tab} choices={TABS} onselect={(t) => ontab(t as PanelTab)} />
    </div>
  {/if}

  <div class="panel color-panel" style:height={scaledSize(colorHeight)} bind:this={colorPanel}>
    <section class="section">
      <ColorPicker
        {color}
        fill={colorHeight !== undefined}
        onchange={(c) => {
          sync.change(color, c);
          oncolor(c);
        }}
        ondragstart={() => sync.start(color)}
        ondragend={() => sync.end()}
      />
    </section>
  </div>

  <Splitter
    orientation="horizontal"
    measure={() => measure(colorPanel, MIN_COLOR_HEIGHT * uiScale)}
    onresize={(size) => layout.setSize("color", size / uiScale)}
    onreset={() => layout.resetSize("color")}
  />

  <div
    class="panel palette-panel"
    style:height={tab ? undefined : scaledSize(paletteHeight)}
    bind:this={palettePanel}
  >
    <PalettePanel
      library={palettes}
      version={paletteVersion}
      {color}
      fill={tab !== null || paletteHeight !== undefined}
      {swatchSize}
      onzoom={(factor) =>
        layout.setSize(
          "swatch",
          Math.min(MAX_SWATCH_SIZE, Math.max(MIN_SWATCH_SIZE, swatchSize * factor)),
        )}
      {tip}
      {run}
    />
  </div>

  {#if !tab}
    <Splitter
      orientation="horizontal"
      measure={() => measure(palettePanel, MIN_PALETTE_HEIGHT * uiScale)}
      onresize={(size) => layout.setSize("palette", size / uiScale)}
      onreset={() => layout.resetSize("palette")}
    />
  {/if}

  <div class="panel grow layers-panel" bind:this={layersPanel}>
    <LayersPanel {editor} {version} {tip} {shortcut} {run} />
  </div>
</aside>

<style>
  .column {
    display: flex;
    flex-direction: column;
    /* The same gutter everywhere: between panels, and around the tool column. */
    gap: var(--space);
    height: 100%;
  }

  .panel {
    display: flex;
    flex-direction: column;
    flex: none;
    min-height: 0;
    overflow: hidden;
  }

  .grow {
    flex: 1;
  }

  .color-panel .section {
    flex: 1;
    min-height: 0;
  }

  /* Give way first when the window is too short for their set heights. */
  .color-panel,
  .palette-panel {
    flex: 0 1 auto;
  }

  .layers-panel {
    min-height: calc(120px * var(--ui-scale));
  }

  .column :global(.layers) {
    flex: 1;
    min-height: 0;
  }

  /* One tab at a time: the others stay (with their state), hidden. */
  .tab-bar {
    flex: none;
    padding: 2px;
  }

  /* Its padding inside its width: the same space on both sides. */
  .tab-bar :global(.segmented) {
    box-sizing: border-box;
    width: 100%;
  }

  .tab-bar :global(.segmented > *) {
    flex: 1;
  }

  .tabbed .palette-panel {
    flex: 1 1 0;
    min-height: calc(60px * var(--ui-scale));
  }

  [data-tab="layers"] .color-panel,
  [data-tab="layers"] .palette-panel,
  [data-tab="layers"] :global(.splitter),
  [data-tab="color"] .layers-panel {
    display: none;
  }
</style>
