<script lang="ts">
  import { onMount, untrack } from "svelte";
  import {
    Layers,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    Redo2,
    Undo2,
  } from "@lucide/svelte";
  import { capabilities } from "#lib/platform/capabilities.js";
  import {
    appWindow,
    setFullScreen,
    toggleFullScreen,
    watchFullScreen,
  } from "#lib/platform/window.js";
  import {
    closeStalePreview,
    openPreviewWindow,
    type OpenWindow,
  } from "#lib/platform/preview-window.js";
  import { sendToWindow } from "#lib/app/preview/preview-link.js";
  import PreviewPopin from "#lib/app/preview/PreviewPopin.svelte";
  import { errorMessage } from "#lib/app/error-message.js";
  import "#lib/app/shell/ui.css";
  import CanvasView, { type Insets } from "#lib/app/canvas/CanvasView.svelte";
  import CommandPalette from "#lib/app/dialogs/CommandPalette.svelte";
  import PanelColumn, { type PanelTab } from "#lib/app/panels/PanelColumn.svelte";
  import StatusBar from "#lib/app/panels/StatusBar.svelte";
  import ToolBar from "#lib/app/panels/ToolBar.svelte";
  import ToolColumn from "#lib/app/panels/ToolColumn.svelte";
  import Splitter from "#lib/app/widgets/Splitter.svelte";
  import { LayoutPrefs } from "#lib/app/shell/layout-prefs.svelte.js";
  import LayoutMenu from "#lib/app/shell/LayoutMenu.svelte";
  import StartScreen from "#lib/app/dialogs/StartScreen.svelte";
  import UnsavedDialog from "#lib/app/dialogs/UnsavedDialog.svelte";
  import ConfirmDialog from "#lib/app/dialogs/ConfirmDialog.svelte";
  import ImageSizeDialog, { type SizeKind } from "#lib/app/dialogs/ImageSizeDialog.svelte";
  import ShortcutsDialog from "#lib/app/dialogs/ShortcutsDialog.svelte";
  import AboutDialog from "#lib/app/dialogs/AboutDialog.svelte";
  import PreferencesDialog from "#lib/app/dialogs/PreferencesDialog.svelte";
  import { themePrefs } from "#lib/app/shell/theme-prefs.svelte.js";
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
  import { newEditor, type Background } from "#lib/app/files/new-drawing.js";
  import { createToolRegistry } from "#lib/app/tools/builtin.js";
  import { pickerTool } from "#lib/app/tools/picker-tool.js";
  import { isSelectTool } from "#lib/app/tools/select-tool.js";
  import { ToolState } from "#lib/app/tools/tool-state.svelte.js";
  import type { Editor } from "#lib/core/editor/editor.js";
  import { parseHexPalette, type PaletteLibrary } from "#lib/core/color/palette.js";
  import { loadMyPaint } from "#lib/mypaint/engine.js";
  import type { Camera, Point } from "#lib/render/camera.js";
  import { m } from "#lib/paraglide/messages.js";

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
   * A mode, a size or a background chosen in the start screen. While the document behind is
   * untouched, it becomes an empty one with that choice, so that what is behind matches it
   * (also when clicking outside). A document with any change or a file is never replaced.
   */
  function previewNew(width: number, height: number, background: Background, mode: string) {
    if (!session.untouched) return;
    void session.newDocument(width, height, background, mode);
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
  let shortcutsOpen = $state(false);
  let aboutOpen = $state(false);
  let preferencesOpen = $state(false);
  /** The window (or the browser's page) is full screen: followed, F11 and Esc change it too. */
  let fullScreen = $state(false);
  $effect(() => watchFullScreen((on) => (fullScreen = on)));
  /** Only the canvas shows: every panel and bar is hidden (Tab). */
  let interfaceHidden = $state(false);
  let sizeDialog = $state<SizeKind | null>(null);

  /** The pending confirmation (see ConfirmDialog), answered once. */
  let confirmRequest = $state<{
    title: string;
    text: string;
    action: string;
    onconfirm: () => void;
  } | null>(null);
  let answerConfirm: (confirmed: boolean) => void = () => {};
  function confirm(question: { title: string; text: string; action: string }) {
    answerConfirm(false);
    return new Promise<boolean>((resolve) => {
      answerConfirm = resolve;
      confirmRequest = { ...question, onconfirm: () => resolve(true) };
    });
  }

  // Bumped on every change but pixels, so the UI re-reads the editor. Pixels change on every
  // frame of a stroke: only what shows them follows `pixelVersion`.
  let version = $state(0);
  let pixelVersion = $state(0);
  let camera = $state<Camera>({ x: 0, y: 0, zoom: 1, rotation: 0 });
  let cursor = $state<Point | null>(null);
  /** The tool bar's swatch: what the tool would make of the color drawn with, at the cursor. */
  const toolPreview = $derived.by(() => {
    if (!shownTool.preview) return null;
    void version;
    void pixelVersion;
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
  /**
   * The screen takes fingers: the finger drawing option shows. Else (a PC, a graphics tablet)
   * it would only clutter the menu. Also once a finger touched it, if the browser did not say.
   */
  let touchScreen = $state(
    navigator.maxTouchPoints > 0 || matchMedia("(any-pointer: coarse)").matches,
  );
  $effect(() => {
    if (touchScreen) return;
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") touchScreen = true;
    };
    window.addEventListener("pointerdown", onPointer, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointer, { capture: true });
  });
  /** The interface size as a factor. Saved panel sizes are at 100%: they follow it. */
  const uiScale = $derived(layout.uiScale / 100);
  $effect(() => document.documentElement.style.setProperty("--ui-scale", String(uiScale)));
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

  // Compact: for a narrow or low window (a small tablet, a phone, landscape included), or
  // always or never, as chosen in the preferences. The tool's sliders go into the title
  // bar, instead of the document's name, and its other options into its popup (see
  // ToolButton); the menus are behind one button, and there is no status bar: undo and redo
  // float in its corner, below the tools, with the actions on the selection.
  //
  // The panels' column can be closed, to make room. When compact, it starts closed, and
  // opening it lasts until the layout is compact again; otherwise the user's choice is kept
  // from one session to the next.
  /** Below this width or height (at 100% interface size), the window is small. */
  const COMPACT_WIDTH = 900;
  const COMPACT_HEIGHT = 600;
  let appWidth = $state(0);
  let appHeight = $state(0);
  const smallWindow = $derived(
    appWidth > 0 && (appWidth < COMPACT_WIDTH * uiScale || appHeight < COMPACT_HEIGHT * uiScale),
  );
  const compact = $derived(layout.compact === "auto" ? smallWindow : layout.compact === "on");
  let openWhileCompact = $state(false);
  $effect(() => {
    if (compact) openWhileCompact = false;
  });
  const panelsOpen = $derived(compact ? openWhileCompact : layout.panelsOpen);

  /** Opening or closing, animated: not while the column is resized. */
  let sliding = $state(false);
  let slideTimer: ReturnType<typeof setTimeout> | undefined;
  function togglePanels() {
    if (compact) openWhileCompact = !openWhileCompact;
    else layout.panelsOpen = !layout.panelsOpen;
    sliding = true;
    clearTimeout(slideTimer);
    slideTimer = setTimeout(() => (sliding = false), 250);
  }

  // Short of height (or compact), the column shows one tab at a time: the color with the
  // palette, or the layers. When compact, two buttons open it on either tab, or close it.
  /** Below this height (at 100% interface size), the column has tabs. */
  const TABS_HEIGHT = 560;
  let columnHeight = $state(0);
  const tabbed = $derived(compact || (columnHeight > 0 && columnHeight < TABS_HEIGHT * uiScale));
  let panelTab = $state<PanelTab>("color");
  function openTab(tab: PanelTab) {
    if (panelsOpen && panelTab === tab) return togglePanels();
    panelTab = tab;
    if (!panelsOpen) togglePanels();
  }

  /** A saved panel size, as CSS. */
  const scaledSize = (size: number | undefined) =>
    size !== undefined ? `calc(${size}px * var(--ui-scale))` : undefined;

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
      togglePanels,
      togglePixelGrid: () => (layout.pixelGrid = !layout.pixelGrid),
      toggleInterface: () => (interfaceHidden = !interfaceHidden),
      toggleFullScreen: () =>
        void toggleFullScreen().catch((e) =>
          notify(m.app_full_screen_failed({ error: errorMessage(e) })),
        ),
      openShortcuts: () => (shortcutsOpen = true),
      openAbout: () => (aboutOpen = true),
      openPreferences: () => (preferencesOpen = true),
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
      notify,
      openSizeDialog: (kind) => (sizeDialog = kind),
      importImage: () => fileInput.click(),
      newDocument: () => (startOpen = true),
      openDocument: (path) => session.open(path),
      saveDocument: () => session.save(),
      saveDocumentAs: () => session.saveAs(),
      exportPng: () => session.exportPng(),
      importPalette: () => paletteInput.click(),
      confirm,
      openCommandPalette: () => (paletteOpen = true),
      canUseFiles: capabilities.userFiles,
      quit: appWindow ? () => void appWindow?.close() : null,
    }),
  );

  /** Runs a command from the interface. */
  function run(id: string, params?: unknown) {
    runCommand(editor, painter, id, params);
  }

  /** A command's first shortcut, e.g. "Ctrl+S", if it has one. */
  function shortcut(id: string): string | undefined {
    const chord = keymap.chordsFor(id)[0];
    return chord && formatChord(chord);
  }

  /** The compact tab's swatch is outlined with the light or dark most unlike the color:
   *  seen on any canvas. */
  const swatchOutline = $derived.by(() => {
    if (!options.color) return undefined;
    const [r, g, b] = options.color;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128
      ? "rgb(0 0 0 / 0.7)"
      : "rgb(255 255 255 / 0.8)";
  });

  /** Tooltip with the command's title and shortcut, e.g. "Undo (Ctrl+Z)". */
  function tip(id: string): string {
    const title = editor.commands.get(id)?.title ?? id;
    const keys = shortcut(id);
    return keys ? m.editor_command_tip({ title, keys }) : title;
  }

  /** A dialog is open: the menus do nothing, and the title bar is dimmed. */
  const dialogOpen = $derived(
    startOpen ||
      paletteOpen ||
      shortcutsOpen ||
      aboutOpen ||
      preferencesOpen ||
      sizeDialog !== null ||
      unsavedRequest !== null ||
      confirmRequest !== null,
  );

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
      .catch((e) => (error = m.editor_brush_engine_unavailable({ error: errorMessage(e) })));

    void layout.load(notify);
    themePrefs.reportErrors(notify);
    loadPalettes(notify).then((library) => {
      palettes = library;
      library.subscribe(() => paletteVersion++);
    });
    void closeStalePreview();
    void session.start().then((restored) => {
      if (!initial && !capabilities.userFiles && !restored) startOpen = true;
    });
    if (!appWindow) return;
    // Closing the window: offer to save unsaved changes first.
    const window = appWindow;
    const unlisten = window.onCloseRequested(async (event) => {
      event.preventDefault();
      if (!(await session.confirmDiscard())) return;
      await Promise.all([session.closing(), flushPalettes(), layout.flush(), themePrefs.flush()]);
      previewWindow?.close();
      await window.destroy();
    });
    return () => void unlisten.then((fn) => fn());
  });

  // The preview of the whole drawing: over the canvas ("in"), or in a window of its own
  // ("out"), which is sent the drawing while it is open.
  let preview = $state<"off" | "in" | "out">("off");
  let previewWindow: OpenWindow | null = null;
  function setPreview(next: "off" | "in" | "out") {
    if (next === preview) return;
    if (preview === "out") previewWindow?.close();
    previewWindow = null;
    preview = next;
    if (next !== "out") return;
    const opened = openPreviewWindow(() => {
      if (previewWindow !== opened) return;
      previewWindow = null;
      preview = "off";
    });
    previewWindow = opened;
  }
  $effect(() => {
    if (preview === "out") return sendToWindow(editor.drawing);
  });

  // The canvas size, and a new view whenever it changes (cropped, scaled, turned…).
  let canvasSize = $state({ width: 0, height: 0 });
  let resizes = $state(0);
  $effect(() => {
    const { drawing } = editor;
    canvasSize = { width: drawing.width, height: drawing.height };
    return drawing.subscribe((change) => {
      if (change.type !== "canvas-resized") return;
      canvasSize = { width: drawing.width, height: drawing.height };
      resizes++;
    });
  });
  const viewKey = $derived({ editor, resizes });

  // Follows the open document's changes.
  $effect(() => {
    const bump = () => version++;
    // Untracked: this effect must not depend on `version`, which it changes.
    untrack(bump);
    const unsubscribe = [
      editor.drawing.subscribe((change) => {
        if (change.type === "pixels-changed") pixelVersion++;
        else bump();
      }),
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
    const title = session.unsaved
      ? m.editor_window_title_unsaved({ name: session.name })
      : m.editor_window_title({ name: session.name });
    if (appWindow) appWindow.setTitle(title);
    else document.title = title;
  });
  $effect(() => {
    // Not behind the preferences: the whole interface is seen while choosing its look.
    windowTitle.dimmed = dialogOpen && !preferencesOpen;
  });
  $effect(() => {
    windowTitle.menu = menuBar;
    windowTitle.end = titleEnd;
    windowTitle.center = compact && !interfaceHidden ? toolBar : null;
    return () => {
      windowTitle.center = null;
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
        error = m.editor_cannot_import({ name: file.name, error: errorMessage(e) });
      }
    }
  }

  async function importPalette(file: File) {
    if (!palettes) return;
    try {
      palettes.add(parseHexPalette(await file.text(), file.name.replace(/\.[^.]+$/, "")));
    } catch (e) {
      notify(m.editor_cannot_import({ name: file.name, error: errorMessage(e) }));
    }
  }

  /** In a browser, closing the tab would lose the latest changes: the browser asks first. */
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!capabilities.ownWindow && session.unsaved) e.preventDefault();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isTyping(e) || dialogOpen) return;
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
  class:panels-closed={!panelsOpen}
  class:sliding
  class:compact
  class:interface-hidden={interfaceHidden}
  bind:clientWidth={appWidth}
  bind:clientHeight={appHeight}
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
    <!-- A new view for each document, fitted to the window, and when its size changes. -->
    {#key viewKey}
      <CanvasView
        bind:this={canvasView}
        {editor}
        {painter}
        brushCursor={(eraser) => tools.cursor(eraser)}
        brushColor={options.color}
        hoverCursor={(p, zoom) => activeTool.hover?.(editor, p, zoom) ?? null}
        selectionHandles={isSelectTool(activeTool)}
        pixelGrid={layout.pixelGrid}
        touchRotation={mode.touchRotation}
        pixelZoom={mode.pixelZoom}
        fingerDraws={layout.fingerDraws}
        onpen={() => layout.notePen()}
        {insets}
        oncamera={(c) => (camera = c)}
        oncursor={(p) => (cursor = p)}
        oncommand={(id) => run(id)}
      />
    {/key}
  </div>

  <div
    class="panel-column"
    bind:this={panelColumn}
    bind:clientHeight={columnHeight}
    inert={!panelsOpen}
  >
    <PanelColumn
      tab={tabbed ? panelTab : null}
      tabBar={!compact}
      ontab={(tab) => (panelTab = tab)}
      {layout}
      {editor}
      {version}
      color={options.color}
      oncolor={(c) => (options.color = c)}
      {palettes}
      {paletteVersion}
      {tip}
      {shortcut}
      {run}
    />
  </div>

  <!-- Opens or closes the column: a tab above the tools, against the column or, closed,
       against the window's edge. When compact, one button per tab: the current color (on a
       checkerboard if none), and the layers. -->
  {#if compact}
    <div class="panel panels-tab">
      <button
        class="icon"
        class:active={panelsOpen && panelTab === "color"}
        title={m.editor_color_tab()}
        onclick={() => openTab("color")}
      >
        <span
          class="swatch"
          style:border-color={swatchOutline}
          style:--swatch-color={options.color
            ? `rgb(${options.color[0]} ${options.color[1]} ${options.color[2]})`
            : undefined}
        ></span>
      </button>
      <button
        class="icon"
        class:active={panelsOpen && panelTab === "layers"}
        title={m.layers_panel()}
        onclick={() => openTab("layers")}
      >
        <Layers />
      </button>
    </div>
  {:else}
    <button class="panel panels-tab" title={tip("view.togglePanels")} onclick={togglePanels}>
      {#if panelsOnLeft}
        {#if panelsOpen}<PanelLeftClose />{:else}<PanelLeftOpen />{/if}
      {:else if panelsOpen}<PanelRightClose />{:else}<PanelRightOpen />{/if}
    </button>
  {/if}

  <!-- The column's inner edge: drag it to change the column's width. -->
  <div class="column-edge" hidden={!panelsOpen}>
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
      {compact}
      position={layout.toolsPosition}
      bind:element={toolColumn}
      onmove={(p) => (layout.toolsPosition = p)}
      onreset={() => layout.resetToolsPosition()}
      {tip}
      {run}
    />
  </div>

  <!-- The active tool's options, centered above the canvas. When compact, they are in the
       title bar, and messages float at the bottom. -->
  <div class="bar top" bind:this={top}>
    {#if !compact}{@render toolBar()}{/if}
  </div>

  {#if preview === "in"}
    <PreviewPopin
      drawing={editor.drawing}
      side={panelsOnLeft ? "right" : "left"}
      onPopOut={capabilities.windows ? () => setPreview("out") : null}
      onClose={() => setPreview("off")}
    />
  {/if}

  <div class="bar bottom" bind:this={bottom}>
    {#if !compact}
      <StatusBar
        {editor}
        {cursor}
        busy={session.busy}
        {error}
        {camera}
        pixelGrid={layout.pixelGrid}
        {tip}
        {run}
        onShortcuts={() => (shortcutsOpen = true)}
      />
    {:else if session.busy || error}
      <div class="panel message" class:error={!session.busy}>{session.busy ?? error}</div>
    {/if}
  </div>

  <!-- When compact, undo and redo below the tools, in the status bar's corner: no keyboard
       on a phone, and within the other hand's reach. Beside them, the actions on the
       selection, while there is one. -->
  {#if compact}
    <div class="corner">
      <div class="panel history" role="group" aria-label={m.editor_history()}>
        {#each ["history.undo", "history.redo"] as id (id)}
          <button class="icon" title={tip(id)} disabled={!enabled(id)} onclick={() => run(id)}>
            {#if id === "history.undo"}<Undo2 />{:else}<Redo2 />{/if}
          </button>
        {/each}
      </div>
      {#if enabled("selection.deselect")}
        <div class="panel actions">{@render selectionActions()}</div>
      {/if}
    </div>
  {/if}

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

{#snippet toolBar()}
  <ToolBar
    tool={shownTool}
    settings={options.tools[shownTool.id]}
    preview={toolPreview}
    {compact}
    actions={selectionActions}
  />
{/snippet}

{#snippet selectionActions()}
  {#if enabled("selection.deselect")}
    <button title={tip("selection.deselect")} onclick={() => run("selection.deselect")}>
      {m.editor_deselect()}
    </button>
  {/if}
{/snippet}

{#snippet titleEnd()}
  {@render layoutMenu()}
{/snippet}

{#snippet layoutMenu()}
  <LayoutMenu
    modes={modes.list()}
    mode={mode.id}
    disabled={dialogOpen}
    {tip}
    {run}
    preview={preview !== "off"}
    onPreview={(open) => setPreview(open ? "in" : "off")}
    {fullScreen}
    onFullScreen={(on) =>
      void setFullScreen(on).catch((e) =>
        notify(m.app_full_screen_failed({ error: errorMessage(e) })),
      )}
  />
{/snippet}

{#snippet menuBar()}
  <MenuBar
    {menus}
    collapsed={compact}
    disabled={dialogOpen}
    title={(id) => editor.commands.get(id)?.title ?? id}
    {shortcut}
    {enabled}
    {run}
  />
{/snippet}

<CommandPalette {editor} {keymap} {run} bind:open={paletteOpen} />
<ShortcutsDialog {editor} {keymap} bind:open={shortcutsOpen} />
<AboutDialog bind:open={aboutOpen} />
<PreferencesDialog bind:open={preferencesOpen} {layout} {touchScreen} />
<ImageSizeDialog
  bind:kind={sizeDialog}
  width={canvasSize.width}
  height={canvasSize.height}
  smoothByDefault={mode.smoothScaling}
  side={panelsOnLeft ? "right" : "left"}
  {run}
  onpreview={(preview) => canvasView?.previewResize(preview)}
/>

<StartScreen
  bind:open={startOpen}
  modes={modes.list()}
  mode={mode.id}
  recent={session.recent}
  recovery={session.recovery}
  oncreate={(width, height, background, mode) =>
    session.newDocument(width, height, background, mode)}
  onchange={previewNew}
  onopen={(path) => session.open(path)}
  onrecover={() => session.recover()}
  ondiscardrecovery={() => session.discardRecovery()}
/>
<UnsavedDialog request={unsavedRequest} />
<ConfirmDialog
  request={confirmRequest}
  onclose={() => {
    confirmRequest = null;
    answerConfirm(false);
  }}
/>

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
    /* Where the panels and the tools start. */
    --content-top: var(--top-inset);
    /* Like the title bar. */
    --bar-height: calc(var(--control-height) + var(--space));
    /* The panels' tab above the tools: one button, two when compact. */
    --tabs-height: var(--bar-height);
    /* Taken by the panels' column from the window's edge, with its gutter: none if closed. */
    --column-space: calc(var(--panel-width) + var(--space));
  }

  .panels-closed {
    --column-space: 0px;
  }

  .canvas {
    position: absolute;
    inset: 0;
  }

  .bar {
    position: absolute;
    height: var(--bar-height);
  }

  /* Between the tab (see .panels-tab) and the window's other edge (the tools stay below),
     the bar centered in it (by the layout: a transform could blur the text), as wide as its
     content, or as the room left. Clicks around the bar go through to the canvas. */
  .top {
    top: var(--top-inset);
    left: var(--space);
    right: calc(var(--column-space) + var(--tool-column-width) + 2 * var(--space));
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .panels-left .top {
    left: calc(var(--column-space) + var(--tool-column-width) + 2 * var(--space));
    right: var(--space);
  }

  .top > :global(*) {
    flex: 0 1 auto;
    min-width: 0;
    pointer-events: auto;
  }

  /* From the panels' column to the window's other edge (later the animation timeline,
     which will open upwards). */
  .bottom {
    bottom: var(--space);
    left: var(--space);
    right: calc(var(--column-space) + var(--space));
  }

  .panels-left .bottom {
    left: calc(var(--column-space) + var(--space));
    right: var(--space);
  }

  /* The whole height, beside the status bar. Closed, it slides out past the window's
     edge. */
  /* Above the options' panels, which may reach it on a narrow screen (see ToolBar), like
     the panels' tab and the tools. */
  .panel-column {
    position: absolute;
    z-index: 1;
    top: var(--content-top);
    right: var(--space);
    bottom: var(--space);
    width: var(--panel-width);
  }

  .panels-left .panel-column {
    right: auto;
    left: var(--space);
  }

  .panels-closed .panel-column {
    visibility: hidden;
    transform: translateX(calc(100% + var(--space)));
  }

  .panels-closed.panels-left .panel-column {
    transform: translateX(calc(-100% - var(--space)));
  }

  /* Above the tool column, in the options' line, as wide as the tools. */
  .panels-tab {
    position: absolute;
    z-index: 1;
    top: var(--content-top);
    right: calc(var(--column-space) + var(--space));
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
    justify-content: center;
    width: var(--tool-column-width);
    height: var(--tabs-height);
    padding: 0;
  }

  /* Two buttons, padded like the tools below. */
  .compact {
    --tabs-height: calc(2 * var(--control-height) + var(--space) + 4px);
  }

  .compact .panels-tab {
    padding: calc(var(--space) / 2);
  }

  /* On a checkerboard, to show that there is no color. */
  .swatch {
    box-sizing: border-box;
    width: calc(var(--control-height) - 6px);
    height: calc(var(--control-height) - 6px);
    /* The color and the checkerboard in the round itself, not in a child it clips: its
       edge stays smooth. */
    background:
      linear-gradient(var(--swatch-color, transparent), var(--swatch-color, transparent)),
      repeating-conic-gradient(var(--field-border) 0 25%, var(--field) 0 50%) 0 0 / 8px 8px;
    background-clip: padding-box;
    border: 1px solid var(--field-border);
    border-radius: 50%;
  }

  /* The hover color over the panel's, which may be see-through. */
  button.panels-tab:hover {
    background: linear-gradient(var(--hover), var(--hover)), var(--panel);
  }

  .panels-left .panels-tab {
    right: auto;
    left: calc(var(--column-space) + var(--space));
  }

  /* The whole gap between the column and the tools, its line in the middle. */
  .column-edge {
    position: absolute;
    top: var(--content-top);
    bottom: var(--space);
    right: calc(var(--panel-width) + var(--space));
    display: flex;
    width: var(--space);
  }

  .panels-left .column-edge {
    right: auto;
    left: calc(var(--panel-width) + var(--space));
  }

  .column-edge[hidden] {
    display: none;
  }

  /* Where the tool column can go: beside the panels' column, past the width handle, between
     the options' bar and the status bar (their lines are kept for them). Clicks go through
     it to the canvas, except on the column. */
  .tool-track {
    position: absolute;
    z-index: 1;
    top: calc(var(--content-top) + var(--tabs-height) + var(--space));
    bottom: calc(var(--bar-height) + 2 * var(--space));
    right: calc(var(--column-space) + var(--space));
    width: var(--tool-column-width);
    pointer-events: none;
  }

  .panels-left .tool-track {
    right: auto;
    left: calc(var(--column-space) + var(--space));
  }

  /* Compact: no options' line (they are in the title bar) and no status bar. The empty
     bars stay, as the canvas's insets. Messages float at the bottom. */
  .compact .top {
    top: var(--titlebar-height);
    height: 0;
  }

  .compact .bottom {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: 0;
    pointer-events: none;
  }

  /* Undo and redo, in the status bar's corner on the tools' side, below them, then the
     actions on the selection, towards the middle. */
  .corner {
    position: absolute;
    z-index: 1;
    bottom: var(--space);
    right: calc(var(--column-space) + var(--space));
    display: flex;
    flex-direction: row-reverse;
    gap: var(--space);
  }

  .panels-left .corner {
    right: auto;
    left: calc(var(--column-space) + var(--space));
    flex-direction: row;
  }

  .corner .panel {
    display: flex;
    gap: 2px;
    padding: calc(var(--space) / 2);
  }

  .message {
    max-width: 100%;
    padding: calc(var(--space) / 2) var(--space);
    overflow: hidden;
    color: var(--text-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .message.error {
    color: var(--danger);
  }

  /* Only the canvas (Tab): the panels, the tools and the bars go. */
  .interface-hidden
    :is(.panel-column, .panels-tab, .column-edge, .tool-track, .top, .bottom, .corner) {
    visibility: hidden;
  }

  /* Opening or closing: everything beside the column follows it. */
  .sliding :is(.panel-column, .panels-tab, .tool-track, .top, .bottom, .corner) {
    transition:
      transform 0.2s ease,
      visibility 0.2s,
      left 0.2s ease,
      right 0.2s ease;
  }

  /* Fills the edge: no negative margins as between stacked panels. */
  .app .column-edge :global(.splitter) {
    flex: 1;
    margin: 0;
  }
</style>
