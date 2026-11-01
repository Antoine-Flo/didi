<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { resolve } from "$app/paths";
  import {
    Brush,
    Compass,
    Eraser,
    Grid2x2,
    ImagePlus,
    Pipette,
    Maximize,
    Redo2,
    RotateCcw,
    RotateCw,
    Undo2,
    ZoomIn,
    ZoomOut,
  } from "@lucide/svelte";
  import "#lib/app/shell/ui.css";
  import BrushBrowser from "#lib/app/panels/BrushBrowser.svelte";
  import CanvasView, {
    type BrushCursor,
    type Insets,
    type ViewStats,
  } from "#lib/app/canvas/CanvasView.svelte";
  import ColorPicker from "#lib/app/panels/ColorPicker.svelte";
  import CommandPalette from "#lib/app/dialogs/CommandPalette.svelte";
  import LayersPanel from "#lib/app/panels/LayersPanel.svelte";
  import PalettePanel from "#lib/app/panels/PalettePanel.svelte";
  import Slider from "#lib/app/widgets/Slider.svelte";
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
  import {
    sizeFromSlider,
    sliderFromSize,
    defaultToolOptions,
    TOOLS,
    MAX_PIXEL_SIZE,
    type ToolId,
  } from "#lib/app/canvas/tools.js";
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
    initial,
  );
  const editor = $derived(session.editor);
  // Shown at start, like Blender's splash screen.
  // svelte-ignore state_referenced_locally
  let startOpen = $state(!initial);

  let tool = $state<ToolId>("brush");
  let options = $state(defaultToolOptions());
  // One painter for the whole session: it keeps the brushes it has loaded.
  const painter = new Painter(session.editor, {
    tool: () => tool,
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

  const keymap = new KeymapIndex(DEFAULT_KEYMAP);
  let paletteOpen = $state(false);

  const TOOL_ICONS = { brush: Brush, eraser: Eraser, pixel: Grid2x2, picker: Pipette };

  function brushCursor(eraser: boolean): BrushCursor {
    if (eraser || tool === "eraser") return { kind: "circle", size: options.eraser.size };
    if (tool === "brush") return { kind: "circle", size: options.brush.size };
    if (tool === "pixel") return { kind: "square", size: options.pixel.size };
    return { kind: "none" };
  }

  // Bumped on every change, so the UI re-reads the editor.
  let version = $state(0);
  let camera = $state<Camera>({ x: 0, y: 0, zoom: 1, rotation: 0 });
  let cursor = $state<Point | null>(null);
  let error = $state<string | null>(null);
  let stats = $state<ViewStats | null>(null);
  let canvasView = $state<CanvasView | null>(null);
  let fileInput: HTMLInputElement;
  let paletteInput: HTMLInputElement;
  let palettes = $state.raw<PaletteLibrary | null>(null);
  let paletteVersion = $state(0);
  let app: HTMLDivElement;
  let left: HTMLElement;
  let right: HTMLElement;
  let top: HTMLElement;
  let bottom: HTMLElement;

  /** Space taken by the floating panels over the canvas, margins included. */
  function insets(): Insets {
    const box = app.getBoundingClientRect();
    return {
      left: left.getBoundingClientRect().right - box.left,
      right: box.right - right.getBoundingClientRect().left,
      top: top.getBoundingClientRect().bottom - box.top,
      bottom: box.bottom - bottom.getBoundingClientRect().top,
    };
  }

  // Registered before the first render, which shows the commands' titles.
  $effect.pre(() =>
    registerAppCommands(editor.commands, {
      get tool() {
        return tool;
      },
      set tool(id) {
        tool = id;
      },
      options,
      get view() {
        return canvasView;
      },
      get palettes() {
        return palettes;
      },
      importImage: () => fileInput.click(),
      newDocument: () => (startOpen = true),
      openDocument: () => session.open(),
      saveDocument: () => session.save(),
      saveDocumentAs: () => session.saveAs(),
      exportPng: () => session.exportPng(),
      importPalette: () => paletteInput.click(),
      openCommandPalette: () => (paletteOpen = true),
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

  /** Whether a command can run now, for buttons. */
  function enabled(id: string): boolean {
    void version;
    return editor.commands.isEnabled(id);
  }

  /** Tooltip with the command's title and shortcut, e.g. "Undo (Ctrl+Z)". */
  function tip(id: string): string {
    const title = editor.commands.get(id)?.title ?? id;
    const keys = keymap.chordsFor(id).slice(0, 1).map(formatChord);
    return keys.length ? `${title} (${keys[0]})` : title;
  }

  /** CPU memory of layer pixels and of the history (estimate, tiles can be shared). */
  const memory = $derived.by(() => {
    void version;
    const pixels = editor.drawing.layers.reduce((sum, l) => sum + l.tiles.memoryBytes, 0);
    return { pixels, history: editor.history.bytes };
  });
  const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

  onMount(() => {
    loadMyPaint()
      .then((engine) => painter.setEngine(engine))
      .catch((e) => (error = `Brush engine unavailable: ${e instanceof Error ? e.message : e}`));

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
      await Promise.all([session.closing(), flushPalettes()]);
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
  $effect(() => () => {
    windowTitle.name = "Didi";
    windowTitle.dirty = false;
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

  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
</script>

<svelte:window onkeydown={onKeyDown} />

<div
  class="app"
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
        onstats={(s) => (stats = s)}
      />
    {/key}
  </div>

  <aside class="panel left" bind:this={left}>
    <section class="section">
      <div class="tools">
        {#each TOOLS as t (t.id)}
          {@const Icon = TOOL_ICONS[t.id]}
          <button
            class="icon"
            class:active={tool === t.id}
            title={tip(`tool.${t.id}`)}
            onclick={() => run(`tool.${t.id}`)}
          >
            <Icon size={16} />
          </button>
        {/each}
      </div>
    </section>
    <section class="section brushes">
      <span class="section-title">Brushes</span>
      <BrushBrowser
        eraser={tool === "eraser"}
        selected={tool === "eraser" ? options.eraser.preset : options.brush.preset}
        onselect={(id) => run("brush.select", { id })}
      />
    </section>
  </aside>

  <div class="panel bar top" bind:this={top}>
    <div class="group">
      <button class="icon" title={tip("file.importImage")} onclick={() => run("file.importImage")}
        ><ImagePlus size={16} /></button
      >

      <button
        class="icon"
        title={tip("history.undo")}
        disabled={!enabled("history.undo")}
        onclick={() => run("history.undo")}
      >
        <Undo2 size={16} />
      </button>
      <button
        class="icon"
        title={tip("history.redo")}
        disabled={!enabled("history.redo")}
        onclick={() => run("history.redo")}
      >
        <Redo2 size={16} />
      </button>
    </div>

    <div class="group options">
      {#if tool === "brush" || tool === "eraser"}
        {@const settings = tool === "brush" ? options.brush : options.eraser}
        <Slider
          label="Size"
          min={0}
          max={1}
          step={0.001}
          value={sliderFromSize(settings.size)}
          display="{settings.size} px"
          oninput={(v) => (settings.size = sizeFromSlider(v))}
        />
        <Slider
          label="Opacity"
          value={settings.opacity}
          display="{Math.round(settings.opacity * 100)}%"
          oninput={(v) => (settings.opacity = v)}
        />
      {:else if tool === "pixel"}
        <Slider
          label="Size"
          min={1}
          max={MAX_PIXEL_SIZE}
          step={1}
          value={options.pixel.size}
          display="{options.pixel.size} px"
          oninput={(v) => (options.pixel.size = v)}
        />
        <Slider
          label="Opacity"
          value={options.pixel.opacity}
          display="{Math.round(options.pixel.opacity * 100)}%"
          oninput={(v) => (options.pixel.opacity = v)}
        />
        <label class="check" title="Removes L-shaped corners (1 px brush)">
          <input type="checkbox" bind:checked={options.pixel.pixelPerfect} /> Pixel-perfect
        </label>
      {:else}
        <span class="hint">Click on the canvas to pick a color.</span>
      {/if}
    </div>

    <div class="group">
      <button class="icon" title={tip("view.zoomOut")} onclick={() => run("view.zoomOut")}
        ><ZoomOut size={16} /></button
      >

      <button class="zoom" title={tip("view.actualSize")} onclick={() => run("view.actualSize")}
        >{Math.round(camera.zoom * 100)}%</button
      >

      <button class="icon" title={tip("view.zoomIn")} onclick={() => run("view.zoomIn")}
        ><ZoomIn size={16} /></button
      >

      <button class="icon" title={tip("view.fit")} onclick={() => run("view.fit")}
        ><Maximize size={16} /></button
      >

      <button class="icon" title={tip("view.rotateLeft")} onclick={() => run("view.rotateLeft")}
        ><RotateCcw size={16} /></button
      >

      <button class="icon" title={tip("view.rotateRight")} onclick={() => run("view.rotateRight")}
        ><RotateCw size={16} /></button
      >

      <button
        class="icon"
        title="{tip('view.resetRotation')} · {degrees(camera.rotation)}°"
        onclick={() => run("view.resetRotation")}
      >
        <Compass size={16} />
      </button>
    </div>
  </div>

  <aside class="panel right" bind:this={right}>
    <section class="section">
      <span class="section-title">Color</span>

      <ColorPicker color={options.color} onchange={(c) => (options.color = c)} />
    </section>

    <PalettePanel library={palettes} version={paletteVersion} color={options.color} {tip} {run} />

    <LayersPanel {editor} {version} {tip} {run} />
  </aside>

  <footer class="panel bar bottom" bind:this={bottom}>
    <span>{editor.drawing.width} × {editor.drawing.height} px</span>
    <span>{cursor ? `${cursor.x}, ${cursor.y}` : ""}</span>
    {#if session.busy}<span>{session.busy}</span>{/if}
    {#if error}<span class="error">{error}</span>{/if}
    <span class="spacer"></span>
    {#if stats}
      <span title="Frames per second">{Math.round(stats.fps)} fps</span>
      <span title="Tiles on the GPU">{stats.tiles} tiles</span>
    {/if}
    <span title="Memory of the pixels / of the history (estimate)"
      >{mb(memory.pixels)} · history {mb(memory.history)}</span
    >
    <a href={resolve("lab")}>Lab</a>
  </footer>

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

<CommandPalette {editor} {keymap} bind:open={paletteOpen} />

<StartScreen
  bind:open={startOpen}
  recent={session.recent}
  recovery={session.recovery}
  oncreate={(width, height, background) => session.newDocument(width, height, background)}
  onopen={(path) => session.open(path)}
  onrecover={() => session.recover()}
  ondiscardrecovery={() => session.discardRecovery()}
/>
<UnsavedDialog request={unsavedRequest} />

<style>
  /* The canvas fills the window (below the title bar); the panels float over it, inset
     from the edges. */
  .app {
    position: relative;
    height: 100%;
    overflow: hidden;
    --left-width: 200px;
    --right-width: 200px;
  }

  .canvas {
    position: absolute;
    inset: 0;
  }

  .left,
  .right {
    position: absolute;
    top: var(--space);
    bottom: var(--space);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .left {
    left: var(--space);
    width: var(--left-width);
  }

  .right {
    right: var(--space);
    width: var(--right-width);
  }

  .tools {
    display: flex;
    gap: calc(var(--space) / 2);
  }

  .brushes,
  .right :global(.layers) {
    flex: 1;
    min-height: 0;
  }

  .bar {
    position: absolute;
    left: calc(var(--left-width) + 2 * var(--space));
    right: calc(var(--right-width) + 2 * var(--space));
    display: flex;
    align-items: center;
    gap: var(--space);
    padding: 0 calc(var(--space) / 2);
  }

  .top {
    top: var(--space);
    height: calc(var(--control-height) + var(--space));
  }

  .group {
    display: flex;
    align-items: center;
    flex: none;
  }

  .options {
    flex: 1;
    gap: calc(var(--space) * 2);
    min-width: 0;
    padding: 0 var(--space);
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }

  .options :global(.slider) {
    flex: 1;
    max-width: 240px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
    white-space: nowrap;
  }

  .zoom {
    width: 4.5em;
    padding: 0;
    font-variant-numeric: tabular-nums;
  }

  .bottom {
    bottom: var(--space);
    height: var(--control-height);
    padding: 0 var(--space);
    gap: calc(var(--space) * 2);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .spacer {
    flex: 1;
  }

  .bottom a {
    color: var(--text-muted);
  }

  .error {
    overflow: hidden;
    color: var(--danger);
    text-overflow: ellipsis;
  }
</style>
