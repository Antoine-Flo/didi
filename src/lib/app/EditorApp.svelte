<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { capabilities } from "#lib/platform/capabilities.js";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import "#lib/app/shell/ui.css";
  import CanvasView, { type Insets } from "#lib/app/canvas/CanvasView.svelte";
  import ColorPicker from "#lib/app/panels/ColorPicker.svelte";
  import CommandPalette from "#lib/app/dialogs/CommandPalette.svelte";
  import LayersPanel from "#lib/app/panels/LayersPanel.svelte";
  import PalettePanel from "#lib/app/panels/PalettePanel.svelte";
  import StatusBar from "#lib/app/panels/StatusBar.svelte";
  import ToolBar from "#lib/app/panels/ToolBar.svelte";
  import ToolColumn from "#lib/app/panels/ToolColumn.svelte";
  import Splitter from "#lib/app/widgets/Splitter.svelte";
  import { LayoutPrefs } from "#lib/app/shell/layout-prefs.svelte.js";
  import LayoutMenu from "#lib/app/shell/LayoutMenu.svelte";
  import StartScreen from "#lib/app/dialogs/StartScreen.svelte";
  import UnsavedDialog from "#lib/app/dialogs/UnsavedDialog.svelte";
  import { registerAppCommands } from "#lib/app/commands/app-commands.js";
  import { runCommand } from "#lib/app/commands/run-command.js";
  import { BROWSER_BINDINGS, DEFAULT_KEYMAP } from "#lib/app/commands/default-keymap.js";
  import { decodeImage, importImage } from "#lib/app/files/import-image.js";
  import { isTyping } from "#lib/app/commands/keyboard.js";
  import { formatChord, KeymapIndex } from "#lib/app/commands/keymap.js";
  import { Painter } from "#lib/app/canvas/painter.js";
  import { held, heldModifiers } from "#lib/app/canvas/modifiers.svelte.js";
  import { flushPalettes, loadPalettes } from "#lib/app/files/palette-storage.js";
  import { Session, type UnsavedChoice } from "#lib/app/files/session.svelte.js";
  import { windowTitle } from "#lib/app/shell/window-title.svelte.js";
  import MenuBar from "#lib/app/shell/MenuBar.svelte";
  import { availableMenus, defaultMenus } from "#lib/app/commands/default-menus.js";
  import { createModeRegistry } from "#lib/app/modes/builtin.js";
  import { DEFAULT_MODE, START_MODE, type Mode } from "#lib/app/modes/mode.js";
  import { newEditor } from "#lib/app/files/new-drawing.js";
  import { createToolRegistry } from "#lib/app/tools/builtin.js";
  import { pickerTool } from "#lib/app/tools/picker-tool.js";
  import { isSelectTool } from "#lib/app/tools/select-tool.js";
  import { ToolState } from "#lib/app/tools/tool-state.svelte.js";
  import type { Editor } from "#lib/core/editor/editor.js";
  import { parseHexPalette, type PaletteLibrary } from "#lib/core/color/palette.js";
  import { loadMyPaint } from "#lib/mypaint/engine.js";
  import type { Camera, Point } from "#lib/render/camera.js";

  /** A document to start with (e.g. the stress test); a new one by default. */
  let { initial }: { initial?: Editor } = $props();

  // The open document, and what to do with unsaved changes (see UnsavedDialog).
  let unsavedRequest = $state<{ name: string; answer: (choice: UnsavedChoice) => void } | null>(
    null,
  );
  const modes = createModeRegistry();

  /** A new empty document in a mode, with its default size and background. */
  function blankEditor(mode: Mode): Editor {
    const { size, background } = mode.newDocument;
    return newEditor(size.width, size.height, background);
  }

  // svelte-ignore state_referenced_locally
  const session = new Session(
    {
      notify,
      askUnsaved: (name) =>
        new Promise((resolve) => {
          unsavedRequest = {
            name,
            answer: (choice) => {
              unsavedRequest = null;
              resolve(choice);
            },
          };
        }),
    },
    initial ?? blankEditor(modes.get(START_MODE)),
    initial ? DEFAULT_MODE : START_MODE,
  );

  /**
   * A mode chosen in the start screen. While the document behind is untouched, it becomes
   * an empty one in that mode, so that what is behind matches the choice (also when
   * clicking outside). A document with any change or a file is never replaced.
   */
  function chooseMode(next: Mode) {
    if (!session.untouched || session.mode === next.id) return;
    const { size, background } = next.newDocument;
    void session.newDocument(size.width, size.height, background, next.id);
  }
  const editor = $derived(session.editor);
  // Shown at start, like Blender's splash screen. In a browser, only once it is known that
  // no document comes back (see `session.start`).
  // svelte-ignore state_referenced_locally
  let startOpen = $state(!initial && capabilities.userFiles);

  /** The document's mode: which tools and panels are shown. */
  const mode = $derived(modes.resolve(session.mode));
  // svelte-ignore state_referenced_locally
  const tools = new ToolState(createToolRegistry(), mode);
  const options = tools.options;
  $effect.pre(() => {
    const next = mode;
    untrack(() => tools.setMode(next));
  });
  const activeTool = $derived(tools.active);
  /** The tool the panels show: Alt turns any tool into the picker while it is held. */
  const shownTool = $derived(held.alt ? pickerTool : activeTool);

  // One painter for the whole session: it keeps the brushes it has loaded.
  const painter = new Painter(session.editor, {
    tool: (eraser) => tools.forPen(eraser),
    options: () => $state.snapshot(options),
    onPick: (picked) => tools.pick(picked),
    onMessage: notify,
    modifiers: heldModifiers,
  });
  $effect.pre(() => painter.setEditor(editor));

  /** Shows a message in the status bar for a few seconds. */
  function notify(message: string) {
    error = message;
    setTimeout(() => {
      if (error === message) error = null;
    }, 6000);
  }

  // The common shortcuts, and the mode's own, which win.
  const keymap = $derived(
    new KeymapIndex({
      version: 1,
      bindings: [
        ...DEFAULT_KEYMAP.bindings,
        ...(capabilities.userFiles ? [] : BROWSER_BINDINGS),
        ...mode.bindings,
      ],
    }),
  );
  let paletteOpen = $state(false);

  // Bumped on every change, so the UI re-reads the editor.
  let version = $state(0);
  let camera = $state<Camera>({ x: 0, y: 0, zoom: 1, rotation: 0 });
  let cursor = $state<Point | null>(null);
  /** The tool bar's swatch: what the tool would make of the color drawn with, at the cursor. */
  const toolPreview = $derived.by(() => {
    if (!shownTool.preview) return null;
    void version;
    const opacity = options.tools[tools.drawingTool]?.opacity;
    const current = { color: options.color, opacity: typeof opacity === "number" ? opacity : 1 };
    if (!cursor) return current;
    return shownTool.preview(editor, options.tools[shownTool.id], cursor, current);
  });
  let error = $state<string | null>(null);
  let canvasView = $state<CanvasView | null>(null);
  let fileInput: HTMLInputElement;
  let paletteInput: HTMLInputElement;
  let palettes = $state.raw<PaletteLibrary | null>(null);
  let paletteVersion = $state(0);
  let app: HTMLDivElement;
  let panelColumn: HTMLElement;
  let toolColumn = $state<HTMLElement>();
  let toolTrackHeight = $state(0);
  let top: HTMLElement;
  let bottom: HTMLElement;

  // The layout (the side of the panels, the sizes of resizable panels), kept from one
  // session to the next.
  const layout = new LayoutPrefs();
  /** The interface size as a factor. Saved panel sizes are at 100%: they follow it. */
  const uiScale = $derived(layout.uiScale / 100);
  $effect(() => document.documentElement.style.setProperty("--ui-scale", String(uiScale)));
  let colorPanel: HTMLElement;
  let palettePanel: HTMLElement;
  let layersPanel: HTMLElement;
  const MIN_COLOR_HEIGHT = 140;
  const MIN_PALETTE_HEIGHT = 60;
  /** Set by the user, else undefined: the panel is as tall as its content. */
  const colorHeight = $derived(layout.size("color"));
  const paletteHeight = $derived(layout.size("palette"));

  /**
   * A resizable panel's height, and how far it can go: it may take the layers' height down
   * to their minimum.
   */
  function measure(panel: HTMLElement, min: number) {
    const size = panel.getBoundingClientRect().height;
    const layers = layersPanel.getBoundingClientRect().height;
    const layersMin = parseFloat(getComputedStyle(layersPanel).minHeight) || 0;
    return { size, min, max: Math.max(min, size + layers - layersMin) };
  }
  const measureColor = () => measure(colorPanel, MIN_COLOR_HEIGHT * uiScale);
  const measurePalette = () => measure(palettePanel, MIN_PALETTE_HEIGHT * uiScale);

  /** The panels' column: on the left for right-handed users, out of the drawing hand's way. */
  const panelsOnLeft = $derived(layout.hand === "right");
  /** Popups of the tool column open towards the canvas. */
  const popupSide = $derived(panelsOnLeft ? "right" : "left");
  const MIN_PANEL_WIDTH = 180;
  const MAX_PANEL_WIDTH = 480;
  /** Set by the user, else undefined: the default width. */
  const panelWidth = $derived(layout.size("panels"));
  function measurePanelWidth() {
    const size = panelColumn.getBoundingClientRect().width;
    // At most half the window, so the canvas keeps room.
    const min = MIN_PANEL_WIDTH * uiScale;
    const max = Math.min(MAX_PANEL_WIDTH * uiScale, app.getBoundingClientRect().width / 2);
    return { size, min, max: Math.max(min, max) };
  }

  /** A saved panel size, as CSS. */
  const scaledSize = (size: number | undefined) =>
    size !== undefined ? `calc(${size}px * var(--ui-scale))` : undefined;

  /** Swatch size in the palette, in pixels, changed with Ctrl + wheel. */
  const DEFAULT_SWATCH_SIZE = 18;
  const MIN_SWATCH_SIZE = 12;
  const MAX_SWATCH_SIZE = 64;
  const swatchSize = $derived(layout.size("swatch") ?? DEFAULT_SWATCH_SIZE);

  /** Space taken by the floating panels over the canvas, margins included. */
  function insets(): Insets {
    const box = app.getBoundingClientRect();
    // The tool column is beside the panels' column, on the canvas side.
    const tools = toolColumn!.getBoundingClientRect();
    const left = panelsOnLeft;
    return {
      left: left ? tools.right - box.left : 0,
      right: left ? 0 : box.right - tools.left,
      top: top.getBoundingClientRect().bottom - box.top,
      bottom: box.bottom - bottom.getBoundingClientRect().top,
    };
  }

  // Registered before the first render, which shows the commands' titles.
  $effect.pre(() =>
    registerAppCommands(editor.commands, {
      get mode() {
        return session.mode;
      },
      set mode(id) {
        session.setMode(id);
      },
      modes,
      get hand() {
        return layout.hand;
      },
      set hand(hand) {
        layout.hand = hand;
      },
      get tool() {
        return tools.id;
      },
      set tool(id) {
        tools.id = id;
      },
      tools: tools.registry,
      options,
      get view() {
        return canvasView;
      },
      get palettes() {
        return palettes;
      },
      importImage: () => fileInput.click(),
      newDocument: () => (startOpen = true),
      openDocument: (path) => session.open(path),
      saveDocument: () => session.save(),
      saveDocumentAs: () => session.saveAs(),
      exportPng: () => session.exportPng(),
      importPalette: () => paletteInput.click(),
      openCommandPalette: () => (paletteOpen = true),
      canUseFiles: capabilities.userFiles,
      quit: capabilities.ownWindow ? () => void getCurrentWindow().close() : null,
    }),
  );

  /** Runs a command from the interface. */
  function run(id: string, params?: unknown) {
    runCommand(editor, painter, id, params);
  }

  /** Tooltip with the command's title and shortcut, e.g. "Undo (Ctrl+Z)". */
  function tip(id: string): string {
    const title = editor.commands.get(id)?.title ?? id;
    const keys = keymap.chordsFor(id).slice(0, 1).map(formatChord);
    return keys.length ? `${title} (${keys[0]})` : title;
  }

  /** A dialog is open: the menus do nothing, and the title bar is dimmed. */
  const dialogOpen = $derived(startOpen || paletteOpen || unsavedRequest !== null);

  /** Whether a command can run now, for menus. */
  function enabled(id: string, params?: unknown): boolean {
    void version;
    return editor.commands.has(id) && editor.commands.isEnabled(id, params);
  }

  // The title bar's menus. Undo and redo name their step, e.g. "Undo Brush".
  const menus = $derived.by(() => {
    void version;
    const all = defaultMenus({
      recent: session.recent,
      undoLabel: editor.history.undoLabel,
      redoLabel: editor.history.redoLabel,
    });
    return availableMenus(all, (id) => editor.commands.has(id));
  });

  onMount(() => {
    // Follows Shift and Ctrl from now on, for the shape tools.
    heldModifiers();
    loadMyPaint()
      .then((engine) => painter.setEngine(engine))
      .catch((e) => (error = `Brush engine unavailable: ${e instanceof Error ? e.message : e}`));

    void layout.load(notify);
    loadPalettes(notify).then((library) => {
      palettes = library;
      library.subscribe(() => paletteVersion++);
    });
    void session.start().then((restored) => {
      if (!initial && !capabilities.userFiles && !restored) startOpen = true;
    });
    if (!capabilities.ownWindow) return;
    // Closing the window: offer to save unsaved changes first.
    const window = getCurrentWindow();
    const unlisten = window.onCloseRequested(async (event) => {
      event.preventDefault();
      if (!(await session.confirmDiscard())) return;
      await Promise.all([session.closing(), flushPalettes(), layout.flush()]);
      await window.destroy();
    });
    return () => void unlisten.then((fn) => fn());
  });

  // Follows the open document's changes.
  $effect(() => {
    const bump = () => version++;
    // Untracked: this effect must not depend on `version`, which it changes.
    untrack(bump);
    const unsubscribe = [
      editor.drawing.subscribe(bump),
      editor.history.subscribe(bump),
      editor.selection.subscribe(bump),
      editor.onActiveLayerChange(bump),
    ];
    return () => unsubscribe.forEach((fn) => fn());
  });

  // "● name — Didi" while there are unsaved changes (taskbar), and the same in our title bar.
  $effect(() => {
    windowTitle.name = session.name;
    windowTitle.dirty = session.unsaved;
    const title = `${session.unsaved ? "● " : ""}${session.name} — Didi`;
    if (capabilities.ownWindow) getCurrentWindow().setTitle(title);
    else document.title = title;
  });
  $effect(() => {
    windowTitle.dimmed = dialogOpen;
  });
  $effect(() => {
    windowTitle.menu = menuBar;
    windowTitle.end = layoutMenu;
    return () => {
      windowTitle.dimmed = false;
      windowTitle.name = "Didi";
      windowTitle.dirty = false;
      windowTitle.menu = null;
      windowTitle.end = null;
    };
  });

  /** Imports images as layers and .hex files as palettes. */
  async function importFiles(files: FileList | null | undefined) {
    for (const file of files ?? []) {
      if (/\.hex$/i.test(file.name)) {
        await importPalette(file);
        continue;
      }
      if (!file.type.startsWith("image/")) continue;
      try {
        importImage(editor, await decodeImage(file), file.name.replace(/\.[^.]+$/, ""));
      } catch (e) {
        error = `Cannot import ${file.name}: ${e instanceof Error ? e.message : e}`;
      }
    }
  }

  async function importPalette(file: File) {
    if (!palettes) return;
    try {
      palettes.add(parseHexPalette(await file.text(), file.name.replace(/\.[^.]+$/, "")));
    } catch (e) {
      notify(`Cannot import ${file.name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** In a browser, closing the tab would lose the latest changes: the browser asks first. */
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!capabilities.ownWindow && session.unsaved) e.preventDefault();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isTyping(e) || paletteOpen || startOpen || unsavedRequest) return;
    // Esc is for the stroke in progress (see CanvasView), whichever hears it first.
    if (e.defaultPrevented || (e.key === "Escape" && painter.active)) return;
    const binding = keymap.match({
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      altGraph: e.getModifierState("AltGraph"),
    });
    if (!binding) return;
    // Its shortcut still means nothing else here: Ctrl+S must not open the browser's dialog.
    if (!editor.commands.has(binding.command)) return e.preventDefault();
    // Not disabled commands: Enter still has to press a focused button.
    if (!editor.commands.isEnabled(binding.command, binding.params)) return;
    e.preventDefault();
    run(binding.command, binding.params);
  }
</script>

<svelte:window onkeydown={onKeyDown} onbeforeunload={onBeforeUnload} />

<div
  class="app"
  class:panels-left={panelsOnLeft}
  style:--panel-width={scaledSize(panelWidth)}
  role="application"
  bind:this={app}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => {
    e.preventDefault();
    importFiles(e.dataTransfer?.files);
  }}
>
  <div class="canvas">
    <!-- A new view for each document, fitted to the window. -->
    {#key editor}
      <CanvasView
        bind:this={canvasView}
        {editor}
        {painter}
        brushCursor={(eraser) => tools.cursor(eraser)}
        hoverCursor={(p, zoom) => activeTool.hover?.(editor, p, zoom) ?? null}
        selectionHandles={isSelectTool(activeTool)}
        {insets}
        oncamera={(c) => (camera = c)}
        oncursor={(p) => (cursor = p)}
      />
    {/key}
  </div>

  <!-- Separate panels, with a small gap between them (like Blender): the color, the palette
       and the layers, the first two resizable. -->
  <aside class="panel-column" bind:this={panelColumn}>
    <div class="panel color-panel" style:height={scaledSize(colorHeight)} bind:this={colorPanel}>
      <section class="section">
        <ColorPicker
          color={options.color}
          fill={colorHeight !== undefined}
          onchange={(c) => (options.color = c)}
        />
      </section>
    </div>

    <Splitter
      orientation="horizontal"
      measure={measureColor}
      onresize={(size) => layout.setSize("color", size / uiScale)}
      onreset={() => layout.resetSize("color")}
    />

    <div
      class="panel palette-panel"
      style:height={scaledSize(paletteHeight)}
      bind:this={palettePanel}
    >
      <PalettePanel
        library={palettes}
        version={paletteVersion}
        color={options.color}
        fill={paletteHeight !== undefined}
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

    <Splitter
      orientation="horizontal"
      measure={measurePalette}
      onresize={(size) => layout.setSize("palette", size / uiScale)}
      onreset={() => layout.resetSize("palette")}
    />

    <div class="panel grow layers-panel" bind:this={layersPanel}>
      <LayersPanel {editor} {version} {tip} {run} />
    </div>
  </aside>

  <!-- The column's inner edge: drag it to change the column's width. -->
  <div class="column-edge">
    <Splitter
      orientation="vertical"
      after={!panelsOnLeft}
      measure={measurePanelWidth}
      onresize={(size) => layout.setSize("panels", size / uiScale)}
      onreset={() => layout.resetSize("panels")}
    />
  </div>

  <!-- The tools, in a thin column beside the panels' column, on the canvas side, movable
       along it. -->
  <div class="tool-track" bind:clientHeight={toolTrackHeight}>
    <ToolColumn
      tools={tools.inBar}
      active={shownTool.id}
      settings={options.tools}
      side={popupSide}
      trackHeight={toolTrackHeight}
      position={layout.toolsPosition}
      bind:element={toolColumn}
      onmove={(p) => (layout.toolsPosition = p)}
      onreset={() => layout.resetToolsPosition()}
      {tip}
      {run}
    />
  </div>

  <!-- The active tool's options, centered above the canvas. -->
  <div class="bar top" bind:this={top}>
    <ToolBar tool={shownTool} settings={options.tools[shownTool.id]} preview={toolPreview}>
      {#snippet actions()}
        {#if enabled("selection.deselect")}
          <button title={tip("selection.deselect")} onclick={() => run("selection.deselect")}>
            Deselect
          </button>
        {/if}
      {/snippet}
    </ToolBar>
  </div>

  <div class="bar bottom" bind:this={bottom}>
    <StatusBar
      {editor}
      modes={modes.list()}
      mode={mode.id}
      {cursor}
      busy={session.busy}
      {error}
      {camera}
      {tip}
      {run}
    />
  </div>

  <input
    bind:this={paletteInput}
    type="file"
    accept=".hex"
    hidden
    onchange={(e) => {
      const file = e.currentTarget.files?.[0];
      if (file) importPalette(file);
      e.currentTarget.value = "";
    }}
  />
  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    multiple
    hidden
    onchange={(e) => {
      importFiles(e.currentTarget.files);
      e.currentTarget.value = "";
    }}
  />
</div>

{#snippet layoutMenu()}
  <LayoutMenu
    hand={layout.hand}
    uiScale={layout.uiScale}
    disabled={dialogOpen}
    {tip}
    {run}
    onUiScale={(scale) => (layout.uiScale = scale)}
  />
{/snippet}

{#snippet menuBar()}
  <MenuBar
    {menus}
    disabled={dialogOpen}
    title={(id) => editor.commands.get(id)?.title ?? id}
    shortcut={(id) => keymap.chordsFor(id).map(formatChord)[0]}
    {enabled}
    {run}
  />
{/snippet}

<CommandPalette {editor} {keymap} {run} bind:open={paletteOpen} />

<StartScreen
  bind:open={startOpen}
  modes={modes.list()}
  mode={mode.id}
  recent={session.recent}
  recovery={session.recovery}
  oncreate={(width, height, background, mode) =>
    session.newDocument(width, height, background, mode)}
  onchoose={chooseMode}
  onopen={(path) => session.open(path)}
  onrecover={() => session.recover()}
  ondiscardrecovery={() => session.discardRecovery()}
/>
<UnsavedDialog request={unsavedRequest} />

<style>
  /* The canvas fills the window, under the title bar too; the panels float over it, inset
     from the edges: a column of panels on one side, the whole height (on the left for
     right-handed users, on the right for left-handed ones, resizable), the tools in a thin
     column beside it, the active tool's options centered at the top, and the status bar at
     the bottom, beside the panels. */
  .app {
    position: relative;
    height: calc(100% + var(--titlebar-height));
    margin-top: calc(-1 * var(--titlebar-height));
    overflow: hidden;
    --panel-width: calc(200px * var(--ui-scale));
    /* One button, with its padding and border. */
    --tool-column-width: calc(var(--control-height) + var(--space) + 2px);
    /* Below the title bar. */
    --top-inset: calc(var(--titlebar-height) + var(--space));
    /* Like the title bar. */
    --bar-height: calc(var(--control-height) + var(--space));
  }

  .canvas {
    position: absolute;
    inset: 0;
  }

  .bar {
    position: absolute;
    height: var(--bar-height);
  }

  /* Centered by the layout (a transform could blur the text), as wide as its content,
     between the side panels' widths (the same on both sides). */
  .top {
    top: var(--top-inset);
    left: 0;
    right: 0;
    width: max-content;
    max-width: calc(100% - 2 * (var(--panel-width) + var(--tool-column-width) + 3 * var(--space)));
    margin: 0 auto;
  }

  /* From the panels' column to the window's other edge (later the animation timeline,
     which will open upwards). */
  .bottom {
    bottom: var(--space);
    left: var(--space);
    right: calc(var(--panel-width) + 2 * var(--space));
  }

  .panels-left .bottom {
    left: calc(var(--panel-width) + 2 * var(--space));
    right: var(--space);
  }

  /* The whole height, beside the status bar. */
  .panel-column {
    position: absolute;
    top: var(--top-inset);
    right: var(--space);
    bottom: var(--space);
    display: flex;
    flex-direction: column;
    gap: calc(var(--space) / 2);
    width: var(--panel-width);
  }

  .panels-left .panel-column {
    right: auto;
    left: var(--space);
  }

  /* In the gap between the column and the canvas, against the column. */
  .column-edge {
    position: absolute;
    top: var(--top-inset);
    bottom: var(--space);
    right: calc(var(--panel-width) + var(--space));
    display: flex;
    width: calc(var(--space) / 2);
  }

  .panels-left .column-edge {
    right: auto;
    left: calc(var(--panel-width) + var(--space));
  }

  /* Where the tool column can go: beside the panels' column, past the width handle, the
     whole height. Clicks go through it to the canvas, except on the column. */
  .tool-track {
    position: absolute;
    top: var(--top-inset);
    bottom: var(--space);
    right: calc(var(--panel-width) + 2 * var(--space));
    width: var(--tool-column-width);
    pointer-events: none;
  }

  .panels-left .tool-track {
    right: auto;
    left: calc(var(--panel-width) + 2 * var(--space));
  }

  /* Fills the edge: no negative margins as between stacked panels. */
  .app .column-edge :global(.splitter) {
    flex: 1;
    margin: 0;
  }

  .panel-column .panel {
    display: flex;
    flex-direction: column;
    flex: none;
    min-height: 0;
    overflow: hidden;
  }

  .panel-column .grow {
    flex: 1;
  }

  .color-panel .section {
    flex: 1;
    min-height: 0;
  }

  /* Give way first when the window is too short for their set heights. */
  .panel-column .color-panel,
  .panel-column .palette-panel {
    flex: 0 1 auto;
  }

  .layers-panel {
    min-height: calc(120px * var(--ui-scale));
  }

  .panel-column :global(.layers) {
    flex: 1;
    min-height: 0;
  }
</style>
