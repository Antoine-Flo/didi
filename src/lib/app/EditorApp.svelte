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
  import DocumentInfo from "#lib/app/panels/DocumentInfo.svelte";
  import NavColumn from "#lib/app/panels/NavColumn.svelte";
  import {
    columnTops,
    edgeOnSide,
    nearestSide,
    positionOnEdge,
    sideOfEdge,
    type ColumnEdge,
  } from "#lib/app/panels/edge-columns.js";
  import ToolBar from "#lib/app/panels/ToolBar.svelte";
  import ToolColumn from "#lib/app/panels/ToolColumn.svelte";
  import Splitter from "#lib/app/widgets/Splitter.svelte";
  import { LayoutPrefs } from "#lib/app/shell/layout-prefs.svelte.js";
  import LayoutMenu from "#lib/app/shell/LayoutMenu.svelte";
  import StartScreen from "#lib/app/dialogs/StartScreen.svelte";
  import UnsavedDialog from "#lib/app/dialogs/UnsavedDialog.svelte";
  import ConfirmDialog from "#lib/app/dialogs/ConfirmDialog.svelte";
  import ImageSizeDialog, { type SizeKind } from "#lib/app/dialogs/ImageSizeDialog.svelte";
  import GridDialog from "#lib/app/dialogs/GridDialog.svelte";
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
    if (!session.untouched) {
      return;
    }
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

  /** Shows a message at the bottom for a few seconds. */
  function notify(message: string) {
    error = message;
    setTimeout(() => {
      if (error === message) {
        error = null;
      }
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
  let gridOpen = $state(false);

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
    if (!shownTool.preview) {
      return null;
    }
    void version;
    void pixelVersion;
    const opacity = options.tools[tools.drawingTool]?.opacity;
    const current = { color: options.color, opacity: typeof opacity === "number" ? opacity : 1 };
    if (!cursor) {
      return current;
    }
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
  let panelsTabElement = $state<HTMLElement>();
  let toolColumn = $state<HTMLElement>();
  let navColumn = $state<HTMLElement>();
  let toolsHeight = $state(0);
  let navHeight = $state(0);
  /** Where the thin columns can go, on either edge (see edge-columns.ts). */
  const tracks: Record<ColumnEdge, HTMLElement | undefined> = $state({
    panels: undefined,
    opposite: undefined,
  });
  const trackHeights = $state<Record<ColumnEdge, number>>({ panels: 0, opposite: 0 });
  /** The same on both edges: one button. */
  let trackWidth = $state(0);
  /** The edge whose column is being dragged: above the rest. */
  let draggedFrom = $state<ColumnEdge | null>(null);
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
    if (touchScreen) {
      return;
    }
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        touchScreen = true;
      }
    };
    window.addEventListener("pointerdown", onPointer, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointer, { capture: true });
  });
  /** The interface size as a factor. Saved panel sizes are at 100%: they follow it. */
  const uiScale = $derived(layout.uiScale / 100);
  $effect(() => document.documentElement.style.setProperty("--ui-scale", String(uiScale)));
  /** The panels' column: on the left for right-handed users, out of the drawing hand's way. */
  const panelsOnLeft = $derived(layout.hand === "right");
  /** Popups of a column on an edge open towards the canvas. */
  const popupSide = (edge: ColumnEdge) =>
    sideOfEdge(edge, panelsOnLeft) === "left" ? "right" : "left";
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
  // always or never, as chosen in the preferences. Only the tool's sliders stay in the title
  // bar, its other options go into its popup (see ToolButton); the menus are behind one
  // button, and there is neither the view's column nor the document's information: undo and
  // redo float in the bottom corner, below the tools, with the actions on the selection.
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
    if (compact) {
      openWhileCompact = false;
    }
  });
  const panelsOpen = $derived(compact ? openWhileCompact : layout.panelsOpen);

  // The title bar holds the menus, then the tool's options. Short of room for the options,
  // the menus go behind one button first, until the window is as wide as the options needed;
  // another tool tries again.
  let toolbarLacking = $state(0);
  let menusShort = $state(false);
  let menusWidthNeeded = 0;
  $effect(() => {
    void shownTool.id;
    untrack(() => (menusShort = false));
  });
  $effect(() => {
    if (!menusShort && toolbarLacking > 0) {
      menusWidthNeeded = appWidth + toolbarLacking;
      menusShort = true;
    } else if (menusShort && appWidth >= menusWidthNeeded) {
      menusShort = false;
    }
  });

  /** Opening or closing, animated: not while the column is resized. */
  let sliding = $state(false);
  let slideTimer: ReturnType<typeof setTimeout> | undefined;
  function togglePanels() {
    if (compact) {
      openWhileCompact = !openWhileCompact;
    } else {
      layout.panelsOpen = !layout.panelsOpen;
    }
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
    if (panelsOpen && panelTab === tab) {
      return togglePanels();
    }
    panelTab = tab;
    if (!panelsOpen) {
      togglePanels();
    }
  }

  /** A saved panel size, as CSS. */
  const scaledSize = (size: number | undefined) =>
    size !== undefined ? `calc(${size}px * var(--ui-scale))` : undefined;

  // The thin columns: the tools, and the view's buttons (not when compact), each against an
  // edge, pushed apart when on the same one (see edge-columns.ts).
  const navShown = $derived(!compact);
  const toolsEdge = $derived(layout.toolsEdge);
  const navEdge = $derived(layout.navEdge);
  /** Between two columns on the same edge: the gutter between panels. */
  const columnGap = $derived(8 * uiScale);
  const columnTop = $derived.by(() => {
    const tops = { tools: 0, nav: 0 };
    for (const edge of ["panels", "opposite"] as const) {
      const columns = [
        ...(toolsEdge === edge
          ? [{ id: "tools" as const, height: toolsHeight, position: layout.toolsPosition }]
          : []),
        ...(navShown && navEdge === edge
          ? [{ id: "nav" as const, height: navHeight, position: layout.navPosition }]
          : []),
      ];
      const placed = columnTops(trackHeights[edge], columns, columnGap);
      columns.forEach((c, i) => (tops[c.id] = placed[i]));
    }
    return tops;
  });
  /** The height the tools have: their edge's, less the view's column if it is on it too. */
  const toolsRoom = $derived(
    trackHeights[toolsEdge] - (navShown && navEdge === toolsEdge ? navHeight + columnGap : 0),
  );

  /** A column dropped at `box`: against the nearest side, at the height it was dropped. */
  function dropColumn(column: "tools" | "nav", box: DOMRect) {
    const edge = edgeOnSide(nearestSide(box, app.getBoundingClientRect()), panelsOnLeft);
    const track = tracks[edge];
    if (track) {
      layout.placeColumn(column, edge, positionOnEdge(box, track.getBoundingClientRect()));
    }
  }

  /** Space taken by the floating panels over the canvas, margins included. */
  function insets(): Insets {
    const box = app.getBoundingClientRect();
    // On each side, as far as what floats there reaches: the panels' column and its tab, and
    // the thin columns.
    let left = 0;
    let right = 0;
    const floating = [
      panelsOpen ? panelColumn : undefined,
      panelsTabElement,
      toolColumn,
      navShown ? navColumn : undefined,
    ];
    for (const element of floating) {
      if (!element?.isConnected) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (nearestSide(rect, box) === "left") {
        left = Math.max(left, rect.right - box.left);
      } else {
        right = Math.max(right, box.right - rect.left);
      }
    }
    return {
      left,
      right,
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
      toggleTileGrid: () => session.setGrid({ ...session.grid, shown: !session.grid.shown }),
      shown: (what) =>
        what === "panels"
          ? panelsOpen
          : what === "interface"
            ? !interfaceHidden
            : what === "pixelGrid"
              ? layout.pixelGrid
              : what === "preview"
                ? preview !== "off"
                : session.grid.shown,
      togglePreview: () => setPreview(preview === "off" ? "in" : "off"),
      openGridSettings: () => (gridOpen = true),
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
    if (!options.color) {
      return undefined;
    }
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
      gridOpen ||
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
      modes: modes.list(),
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
      if (!initial && !capabilities.userFiles && !restored) {
        startOpen = true;
      }
    });
    if (!appWindow) {
      return;
    }
    // Closing the window: offer to save unsaved changes first.
    const window = appWindow;
    const unlisten = window.onCloseRequested(async (event) => {
      event.preventDefault();
      if (!(await session.confirmDiscard())) {
        return;
      }
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
    if (next === preview) {
      return;
    }
    if (preview === "out") {
      previewWindow?.close();
    }
    previewWindow = null;
    preview = next;
    if (next !== "out") {
      return;
    }
    const opened = openPreviewWindow(() => {
      if (previewWindow !== opened) {
        return;
      }
      previewWindow = null;
      preview = "off";
    });
    previewWindow = opened;
  }
  $effect(() => {
    if (preview === "out") {
      return sendToWindow(editor.drawing);
    }
  });

  // The canvas size, and a new view whenever it changes (cropped, scaled, turned…).
  let canvasSize = $state({ width: 0, height: 0 });
  let resizes = $state(0);
  $effect(() => {
    const { drawing } = editor;
    canvasSize = { width: drawing.width, height: drawing.height };
    return drawing.subscribe((change) => {
      if (change.type !== "canvas-resized") {
        return;
      }
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
        if (change.type === "pixels-changed") {
          pixelVersion++;
        } else {
          bump();
        }
      }),
      editor.history.subscribe(bump),
      editor.selection.subscribe(bump),
      editor.onActiveLayerChange(bump),
    ];
    return () => unsubscribe.forEach((fn) => fn());
  });

  // "● name — Didi" while there are unsaved changes, in the taskbar or the browser's tab.
  $effect(() => {
    const title = session.unsaved
      ? m.editor_window_title_unsaved({ name: session.name })
      : m.editor_window_title({ name: session.name });
    if (appWindow) {
      appWindow.setTitle(title);
    } else {
      document.title = title;
    }
  });
  $effect(() => {
    // Not behind the preferences: the whole interface is seen while choosing its look.
    windowTitle.dimmed = dialogOpen && !preferencesOpen;
  });
  $effect(() => {
    windowTitle.menu = menuBar;
    windowTitle.end = null;
    // No name: the document's information shows it. Only the canvas: no options either.
    windowTitle.name = "";
    windowTitle.center = interfaceHidden ? null : toolBar;
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
      if (!file.type.startsWith("image/")) {
        continue;
      }
      try {
        importImage(editor, await decodeImage(file), file.name.replace(/\.[^.]+$/, ""));
      } catch (e) {
        error = m.editor_cannot_import({ name: file.name, error: errorMessage(e) });
      }
    }
  }

  async function importPalette(file: File) {
    if (!palettes) {
      return;
    }
    try {
      palettes.add(parseHexPalette(await file.text(), file.name.replace(/\.[^.]+$/, "")));
    } catch (e) {
      notify(m.editor_cannot_import({ name: file.name, error: errorMessage(e) }));
    }
  }

  /** In a browser, closing the tab would lose the latest changes: the browser asks first. */
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!capabilities.ownWindow && session.unsaved) {
      e.preventDefault();
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isTyping(e) || dialogOpen) {
      return;
    }
    // Esc is for the stroke in progress (see CanvasView), whichever hears it first.
    if (e.defaultPrevented || (e.key === "Escape" && painter.active)) {
      return;
    }
    const binding = keymap.match({
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      altGraph: e.getModifierState("AltGraph"),
    });
    if (!binding) {
      return;
    }
    // Its shortcut still means nothing else here: Ctrl+S must not open the browser's dialog.
    if (!editor.commands.has(binding.command)) {
      return e.preventDefault();
    }
    // Not disabled commands: Enter still has to press a focused button.
    if (!editor.commands.isEnabled(binding.command, binding.params)) {
      return;
    }
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
        tileGrid={session.grid.shown ? session.grid : null}
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
    <div class="panel panels-tab" bind:this={panelsTabElement}>
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
    <button
      class="panel panels-tab"
      title={tip("view.togglePanels")}
      onclick={togglePanels}
      bind:this={panelsTabElement}
    >
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

  <!-- The thin columns, the tools and the view's buttons: beside the panels' column, on the
       canvas side, or against the window's other edge. Moved by their grip. -->
  {#each ["panels", "opposite"] as const as edge (edge)}
    <div
      class="track {edge}"
      class:dragged-from={draggedFrom === edge}
      bind:this={tracks[edge]}
      bind:clientHeight={trackHeights[edge]}
      bind:clientWidth={trackWidth}
    >
      {#if toolsEdge === edge}
        <ToolColumn
          tools={tools.inBar}
          active={shownTool.id}
          settings={options.tools}
          side={popupSide(edge)}
          room={toolsRoom}
          {compact}
          top={columnTop.tools}
          bind:element={toolColumn}
          bind:height={toolsHeight}
          ondrop={(box) => dropColumn("tools", box)}
          ondragging={(on) => (draggedFrom = on ? edge : null)}
          onreset={() => layout.resetColumn("tools")}
          {tip}
          {run}
        />
      {/if}
      {#if navShown && navEdge === edge}
        <NavColumn
          {camera}
          pixelGrid={layout.pixelGrid}
          tileGrid={session.grid}
          ontilegrid={(grid) => session.setGrid(grid)}
          side={popupSide(edge)}
          top={columnTop.nav}
          bind:element={navColumn}
          bind:height={navHeight}
          ondrop={(box) => dropColumn("nav", box)}
          ondragging={(on) => (draggedFrom = on ? edge : null)}
          onreset={() => layout.resetColumn("nav")}
          {tip}
          {run}
        >
          {#snippet end()}
            {@render layoutMenu(popupSide(edge))}
          {/snippet}
        </NavColumn>
      {/if}
    </div>
  {/each}

  <!-- The document's information, in the bottom corner away from the panels. -->
  {#if !compact}
    <div class="info">
      <DocumentInfo
        name={session.name}
        unsaved={session.unsaved}
        width={canvasSize.width}
        height={canvasSize.height}
        cursor={mode.showsCursorPixel ? cursor : undefined}
        corner={panelsOnLeft ? "right" : "left"}
      />
    </div>
  {/if}

  <!-- Where the canvas starts below the title bar, which holds the tool's options. -->
  <div class="bar top" bind:this={top}></div>

  {#if preview === "in"}
    <PreviewPopin
      drawing={editor.drawing}
      side={panelsOnLeft ? "right" : "left"}
      inset={toolsEdge === "opposite" || (navShown && navEdge === "opposite") ? trackWidth : 0}
      onPopOut={capabilities.windows ? () => setPreview("out") : null}
      onClose={() => setPreview("off")}
    />
  {/if}

  <!-- Messages float at the bottom. -->
  <div class="bar bottom" bind:this={bottom}>
    {#if session.busy || error}
      <div class="panel message" class:error={!session.busy}>{session.busy ?? error}</div>
    {/if}
  </div>

  <!-- When compact, undo and redo below the tools, in the bottom corner: no keyboard
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
      if (file) {
        importPalette(file);
      }
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
    onlacking={(pixels) => (toolbarLacking = pixels)}
  />
{/snippet}

{#snippet selectionActions()}
  {#if enabled("selection.deselect")}
    <button title={tip("selection.deselect")} onclick={() => run("selection.deselect")}>
      {m.editor_deselect()}
    </button>
  {/if}
{/snippet}

{#snippet layoutMenu(side: "left" | "right")}
  <LayoutMenu
    modes={modes.list()}
    mode={mode.id}
    {side}
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
    collapsed={compact || menusShort}
    disabled={dialogOpen}
    title={(id) => editor.commands.get(id)?.title ?? id}
    {shortcut}
    {enabled}
    checked={(id) => editor.commands.isChecked(id)}
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
<GridDialog
  bind:open={gridOpen}
  pixelGrid={layout.pixelGrid}
  tileGrid={session.grid}
  side={panelsOnLeft ? "right" : "left"}
  {tip}
  {run}
  ontilegrid={(grid) => session.setGrid(grid)}
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
  /* The canvas fills the window, under the title bar too (which holds the tool's options);
     the panels float over it, inset from the edges: a column of panels on one side, the whole
     height (on the left for right-handed users, on the right for left-handed ones,
     resizable), the tools in a thin column beside it, the view's buttons in another against
     the other edge, and the document's information in the bottom corner below them. */
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

  /* Empty: the canvas's top inset, below the title bar. */
  .top {
    top: var(--titlebar-height);
    height: 0;
  }

  /* From the panels' column to the window's other edge, empty: the canvas's bottom inset.
     Messages float above it, in the middle. */
  .bottom {
    bottom: var(--space);
    left: var(--space);
    right: calc(var(--column-space) + var(--space));
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: 0;
    pointer-events: none;
  }

  .panels-left .bottom {
    left: calc(var(--column-space) + var(--space));
    right: var(--space);
  }

  /* The whole height. Closed, it slides out past the window's
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

  /* Where the thin columns can go. Clicks go through to the canvas, except on a column.
     Beside the panels' column, past the width handle, below the panels' tab (and when
     compact, above undo and redo). */
  .track {
    position: absolute;
    z-index: 1;
    width: var(--tool-column-width);
    pointer-events: none;
  }

  /* A column being dragged passes over everything else. */
  .track.dragged-from {
    z-index: 2;
  }

  .track.panels {
    top: calc(var(--content-top) + var(--tabs-height) + var(--space));
    bottom: var(--space);
    right: calc(var(--column-space) + var(--space));
  }

  .panels-left .track.panels {
    right: auto;
    left: calc(var(--column-space) + var(--space));
  }

  .compact .track.panels {
    bottom: calc(var(--bar-height) + 2 * var(--space));
  }

  /* Against the window's other edge, above the document's information. */
  .track.opposite {
    top: var(--content-top);
    bottom: calc(var(--bar-height) + 2 * var(--space));
    left: var(--space);
  }

  .panels-left .track.opposite {
    left: auto;
    right: var(--space);
  }

  .compact .track.opposite {
    bottom: var(--space);
  }

  /* In the bottom corner, below the view's column; at most half the window. */
  .info {
    position: absolute;
    bottom: var(--space);
    left: var(--space);
    display: flex;
    max-width: 50%;
    pointer-events: none;
  }

  .panels-left .info {
    left: auto;
    right: var(--space);
    justify-content: flex-end;
  }

  /* Undo and redo, in the bottom corner on the tools' side, below them, then the actions on
     the selection, towards the middle. */
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
  .interface-hidden :is(.panel-column, .panels-tab, .column-edge, .track, .info, .bottom, .corner) {
    visibility: hidden;
  }

  /* Opening or closing: everything beside the column follows it. */
  .sliding :is(.panel-column, .panels-tab, .track.panels, .top, .bottom, .corner) {
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
