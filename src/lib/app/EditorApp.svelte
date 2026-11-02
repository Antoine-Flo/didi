<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Ellipsis } from "@lucide/svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import "#lib/app/shell/ui.css";
  import CanvasView, { type Insets } from "#lib/app/canvas/CanvasView.svelte";
  import ColorPicker from "#lib/app/panels/ColorPicker.svelte";
  import CommandPalette from "#lib/app/dialogs/CommandPalette.svelte";
  import LayersPanel from "#lib/app/panels/LayersPanel.svelte";
  import PalettePanel from "#lib/app/panels/PalettePanel.svelte";
  import StatusBar from "#lib/app/panels/StatusBar.svelte";
  import ToolBar from "#lib/app/panels/ToolBar.svelte";
  import ToolButton from "#lib/app/panels/ToolButton.svelte";
  import Splitter from "#lib/app/widgets/Splitter.svelte";
  import { LayoutPrefs } from "#lib/app/shell/layout-prefs.svelte.js";
  import LayoutMenu from "#lib/app/shell/LayoutMenu.svelte";
  import Menu from "#lib/app/widgets/Menu.svelte";
  import StartScreen from "#lib/app/dialogs/StartScreen.svelte";
  import UnsavedDialog from "#lib/app/dialogs/UnsavedDialog.svelte";
  import { registerAppCommands } from "#lib/app/commands/app-commands.js";
  import { DEFAULT_KEYMAP } from "#lib/app/commands/default-keymap.js";
  import { decodeImage, importImage } from "#lib/app/files/import-image.js";
  import { isTyping } from "#lib/app/commands/keyboard.js";
  import { formatChord, KeymapIndex } from "#lib/app/commands/keymap.js";
  import { Painter } from "#lib/app/canvas/painter.js";
  import { flushPalettes, loadPalettes } from "#lib/app/files/palette-storage.js";
  import { Session, type UnsavedChoice } from "#lib/app/files/session.svelte.js";
  import { windowTitle } from "#lib/app/shell/window-title.svelte.js";
  import MenuBar from "#lib/app/shell/MenuBar.svelte";
  import { defaultMenus } from "#lib/app/commands/default-menus.js";
  import { createModeRegistry } from "#lib/app/modes/builtin.js";
  import { DEFAULT_MODE, START_MODE, type Mode } from "#lib/app/modes/mode.js";
  import { newEditor } from "#lib/app/files/new-drawing.js";
  import { createToolRegistry } from "#lib/app/tools/builtin.js";
  import type { BrushCursor, Tool } from "#lib/app/tools/tool.js";
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
  // Shown at start, like Blender's splash screen.
  // svelte-ignore state_referenced_locally
  let startOpen = $state(!initial);

  const tools = createToolRegistry();
  /** The document's mode: which tools and panels are shown. */
  const mode = $derived(modes.resolve(session.mode));
  /** Id of the active tool. */
  // svelte-ignore state_referenced_locally
  let tool = $state(mode.tools[0]);
  let options = $state(tools.defaultOptions());
  const activeTool = $derived(tools.get(tool));

  /** The tool used now. The pen's eraser end uses the mode's eraser. */
  function toolFor(eraser: boolean): Tool {
    return eraser ? tools.get(mode.eraserTool) : activeTool;
  }

  // Each mode remembers its last tool: switching back finds it again.
  const lastTool: Record<string, string> = {};
  // svelte-ignore state_referenced_locally
  let shownMode = mode.id;
  $effect.pre(() => {
    const next = mode;
    untrack(() => {
      if (next.id === shownMode) return;
      lastTool[shownMode] = tool;
      shownMode = next.id;
      tool = lastTool[next.id] ?? next.tools[0];
    });
  });

  /** The mode's tools, and the active one if it comes from elsewhere (e.g. Ctrl+K). */
  const shownTools = $derived(
    [...mode.tools, ...(mode.tools.includes(tool) ? [] : [tool])]
      .filter((id) => tools.has(id))
      .map((id) => tools.get(id)),
  );
  /** The tools of the other modes, in the "more tools" menu. */
  const otherTools = $derived(tools.list().filter((t) => !mode.tools.includes(t.id)));

  // One painter for the whole session: it keeps the brushes it has loaded.
  const painter = new Painter(session.editor, {
    tool: toolFor,
    options: () => $state.snapshot(options),
    onPick: (color) => (options.color = color),
    onMessage: notify,
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
    new KeymapIndex({ version: 1, bindings: [...DEFAULT_KEYMAP.bindings, ...mode.bindings] }),
  );
  let paletteOpen = $state(false);

  function brushCursor(eraser: boolean): BrushCursor {
    const t = toolFor(eraser);
    return t.cursor(options.tools[t.id] ?? t.defaults);
  }

  // Bumped on every change, so the UI re-reads the editor.
  let version = $state(0);
  let camera = $state<Camera>({ x: 0, y: 0, zoom: 1, rotation: 0 });
  let cursor = $state<Point | null>(null);
  let error = $state<string | null>(null);
  let canvasView = $state<CanvasView | null>(null);
  let fileInput: HTMLInputElement;
  let paletteInput: HTMLInputElement;
  let palettes = $state.raw<PaletteLibrary | null>(null);
  let paletteVersion = $state(0);
  let app: HTMLDivElement;
  let toolColumn: HTMLElement;
  let panelColumn: HTMLElement;
  let top: HTMLElement;
  let bottom: HTMLElement;

  // The layout (the side of the tools, the sizes of resizable panels), kept from one session
  // to the next.
  const layout = new LayoutPrefs();
  /** Popups of the tool column open towards the canvas. */
  const popupSide = $derived(layout.hand === "left" ? "left" : "right");
  let palettePanel: HTMLElement;
  let layersPanel: HTMLElement;
  const MIN_PALETTE_HEIGHT = 60;
  /** Set by the user, else undefined: the palette is as tall as its content. */
  const paletteHeight = $derived(layout.size("palette"));

  /** The palette's height, and how far it can go: the layers keep their minimum height. */
  function measurePalette() {
    const size = palettePanel.getBoundingClientRect().height;
    const layers = layersPanel.getBoundingClientRect().height;
    const layersMin = parseFloat(getComputedStyle(layersPanel).minHeight) || 0;
    return { size, min: MIN_PALETTE_HEIGHT, max: size + Math.max(0, layers - layersMin) };
  }

  const leftColumn = () => (layout.hand === "left" ? panelColumn : toolColumn);
  const rightColumn = () => (layout.hand === "left" ? toolColumn : panelColumn);

  /** Space taken by the floating panels over the canvas, margins included. */
  function insets(): Insets {
    const box = app.getBoundingClientRect();
    return {
      left: leftColumn().getBoundingClientRect().right - box.left,
      right: box.right - rightColumn().getBoundingClientRect().left,
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
        return tool;
      },
      set tool(id) {
        tool = id;
      },
      tools,
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
      quit: isTauri() ? () => void getCurrentWindow().close() : null,
    }),
  );

  /** Runs a command from a button or a shortcut. Nothing may run while the pen is down. */
  function run(id: string, params?: unknown) {
    if (painter.active) {
      if (!painter.finishing) return;
      // The pen is up but the stroke is still being painted: finish it first, so that
      // undo, for instance, applies to it.
      painter.drain();
    }
    editor.commands.execute(id, params);
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
    return defaultMenus({
      recent: session.recent,
      undoLabel: editor.history.undoLabel,
      redoLabel: editor.history.redoLabel,
    });
  });

  onMount(() => {
    loadMyPaint()
      .then((engine) => painter.setEngine(engine))
      .catch((e) => (error = `Brush engine unavailable: ${e instanceof Error ? e.message : e}`));

    void layout.load(notify);
    loadPalettes(notify).then((library) => {
      palettes = library;
      library.subscribe(() => paletteVersion++);
    });
    session.start();
    if (!isTauri()) return;
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
      editor.onActiveLayerChange(bump),
    ];
    return () => unsubscribe.forEach((fn) => fn());
  });

  // "● name — Didi" while there are unsaved changes (taskbar), and the same in our title bar.
  $effect(() => {
    windowTitle.name = session.name;
    windowTitle.dirty = session.dirty;
    const title = `${session.dirty ? "● " : ""}${session.name} — Didi`;
    if (isTauri()) getCurrentWindow().setTitle(title);
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

  function onKeyDown(e: KeyboardEvent) {
    if (isTyping(e) || paletteOpen || startOpen || unsavedRequest) return;
    const binding = keymap.match({
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      altGraph: e.getModifierState("AltGraph"),
    });
    if (!binding || !editor.commands.has(binding.command)) return;
    e.preventDefault();
    run(binding.command, binding.params);
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div
  class="app"
  class:left-handed={layout.hand === "left"}
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
        {brushCursor}
        {insets}
        oncamera={(c) => (camera = c)}
        oncursor={(p) => (cursor = p)}
      />
    {/key}
  </div>

  <aside class="panel tool-column" bind:this={toolColumn}>
    {#each shownTools as t (t.id)}
      <ToolButton
        tool={t}
        active={tool === t.id}
        preset={t.brushSet ? String(options.tools[t.id].preset) : undefined}
        side={popupSide}
        {tip}
        {run}
      />
    {/each}
    {#if otherTools.length > 0}
      <Menu
        title="More tools"
        side={popupSide}
        items={otherTools.map((t) => ({
          id: t.id,
          label: tip(`tool.${t.id}`),
          icon: t.icon,
          active: t.id === tool,
        }))}
        onselect={(id) => run(`tool.${id}`)}
      >
        <Ellipsis size={16} />
      </Menu>
    {/if}
  </aside>

  <!-- Separate panels, with a small gap between them (like Blender). -->
  <aside class="panel-column" bind:this={panelColumn}>
    <div class="panel">
      <section class="section">
        <ColorPicker color={options.color} onchange={(c) => (options.color = c)} />
      </section>
    </div>

    <div
      class="panel palette-panel"
      style:height={paletteHeight !== undefined ? `${paletteHeight}px` : undefined}
      bind:this={palettePanel}
    >
      <PalettePanel
        library={palettes}
        version={paletteVersion}
        color={options.color}
        fill={paletteHeight !== undefined}
        {tip}
        {run}
      />
    </div>

    <Splitter
      orientation="horizontal"
      measure={measurePalette}
      onresize={(size) => layout.setSize("palette", size)}
      onreset={() => layout.resetSize("palette")}
    />

    <div class="panel grow layers-panel" bind:this={layersPanel}>
      <LayersPanel {editor} {version} {tip} {run} />
    </div>
  </aside>

  <!-- The tool's options above the canvas, centered; the status bar below, the whole
       width, like the title bar. -->
  <div class="bar top" bind:this={top}>
    <ToolBar tool={activeTool} settings={options.tools[tool]} />
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
  <LayoutMenu hand={layout.hand} disabled={dialogOpen} {tip} {run} />
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

<CommandPalette {editor} {keymap} bind:open={paletteOpen} />

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
     from the edges: the tool's options centered at the top, the status bar the whole width
     at the bottom, the tools on one side and the other panels on the other: the tools on the
     left for right-handed users, on the right for left-handed ones (the whole layout is
     mirrored). */
  .app {
    position: relative;
    height: calc(100% + var(--titlebar-height));
    margin-top: calc(-1 * var(--titlebar-height));
    overflow: hidden;
    --panel-width: 200px;
    /* Below the title bar. */
    --top-inset: calc(var(--titlebar-height) + var(--space));
    /* Like the title bar. */
    --bar-height: calc(var(--control-height) + var(--space));
    /* Above the status bar. */
    --bottom-inset: calc(var(--bar-height) + 2 * var(--space));
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
    max-width: calc(100% - 2 * (var(--panel-width) + 2 * var(--space)));
    margin: 0 auto;
  }

  .bottom {
    bottom: var(--space);
    left: var(--space);
    right: var(--space);
  }

  /* The tools, in a thin column, centered vertically by the layout, not by a transform: a
     translation of half a pixel blurs the text. */
  .tool-column {
    position: absolute;
    top: var(--top-inset);
    bottom: var(--bottom-inset);
    left: var(--space);
    height: max-content;
    margin: auto 0;
    display: flex;
    flex-direction: column;
    gap: calc(var(--space) / 2);
    padding: calc(var(--space) / 2);
  }

  .panel-column {
    position: absolute;
    top: var(--top-inset);
    right: var(--space);
    bottom: var(--bottom-inset);
    display: flex;
    flex-direction: column;
    gap: calc(var(--space) / 2);
    width: var(--panel-width);
  }

  .left-handed .tool-column {
    right: var(--space);
    left: auto;
  }

  .left-handed .panel-column {
    right: auto;
    left: var(--space);
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

  /* Gives way first when the window is too short for a resized palette. */
  .panel-column .palette-panel {
    flex: 0 1 auto;
  }

  .layers-panel {
    min-height: 120px;
  }

  .panel-column :global(.layers) {
    flex: 1;
    min-height: 0;
  }
</style>
