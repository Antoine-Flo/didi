// Everything the editor's interface shows and acts on: the open document and its mode, the
// tools and colors, the painter, the shortcuts and menus, the layout, the preview and the
// dialogs. Created by EditorApp, while it initializes (its effects belong to it).

import { untrack } from "svelte";
import {
  registerAppCommands,
  type AppHost,
  type CanvasControls,
} from "#lib/app/commands/app-commands.js";
import { BROWSER_BINDINGS, DEFAULT_KEYMAP } from "#lib/app/commands/default-keymap.js";
import { availableMenus, defaultMenus } from "#lib/app/commands/default-menus.js";
import { isTyping, keyInput } from "#lib/app/commands/keyboard.js";
import { formatChord, KeymapIndex } from "#lib/app/commands/keymap.js";
import { runCommand } from "#lib/app/commands/run-command.js";
import { importFiles, importPalette } from "#lib/app/files/import-image.js";
import { newEditor, type Background } from "#lib/app/files/new-drawing.js";
import { flushPalettes, loadPalettes } from "#lib/app/files/palette-storage.js";
import { Session } from "#lib/app/files/session.svelte.js";
import { held, heldModifiers } from "#lib/app/input/modifiers.svelte.js";
import { Painter } from "#lib/app/input/painter.js";
import { EditorLayout } from "#lib/app/layout/editor-layout.svelte.js";
import { windowTitle } from "#lib/app/layout/window-title.svelte.js";
import { createModeRegistry } from "#lib/app/modes/builtin.js";
import { DEFAULT_MODE, START_MODE, type Mode } from "#lib/app/modes/mode.js";
import { LayoutPrefs } from "#lib/app/prefs/layout-prefs.svelte.js";
import { ModeColors } from "#lib/app/prefs/mode-colors.svelte.js";
import { themePrefs } from "#lib/app/prefs/theme-prefs.svelte.js";
import { PreviewState } from "#lib/app/preview/preview-state.svelte.js";
import { errorMessage } from "#lib/app/shared/error-message.js";
import { EditorDialogs } from "#lib/app/state/dialogs.svelte.js";
import { EditorChanges } from "#lib/app/state/editor-changes.svelte.js";
import { ModeColorsSync } from "#lib/app/state/mode-colors-sync.svelte.js";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import { pickerTool } from "#lib/app/tools/picker-tool.js";
import { ToolState } from "#lib/app/tools/tool-state.svelte.js";
import type { Tool, ToolOptions } from "#lib/app/tools/tool.js";
import type { PaletteLibrary } from "#lib/core/color/palette.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { loadMyPaint } from "#lib/mypaint/engine.js";
import { m } from "#lib/paraglide/messages.js";
import { capabilities } from "#lib/platform/capabilities.js";
import { closeStalePreview } from "#lib/platform/preview-window.js";
import { appWindow, toggleFullScreen, watchFullScreen } from "#lib/platform/window.js";
import type { Camera, Point } from "#lib/render/camera.js";

/** A new empty document in a mode, with its default size and background. */
function blankEditor(mode: Mode): Editor {
  const { size, background } = mode.newDocument;
  return newEditor(size.width, size.height, background);
}

export class EditorState {
  readonly modes = createModeRegistry();
  readonly dialogs: EditorDialogs;
  /** The open document, and its file. */
  readonly session: Session;
  readonly editor: Editor;
  readonly changes: EditorChanges;
  /** The document's mode: which tools and panels are shown. */
  readonly mode: Mode;
  readonly tools: ToolState;
  readonly options: ToolOptions;
  /** The tool the panels show: Alt turns any tool into the picker while it is held. */
  readonly shownTool: Tool;
  /** The colors of each mode (current, second, recent), kept from one session to the next. */
  readonly modeColors = new ModeColors();
  private readonly colorsSync: ModeColorsSync;
  /** One painter for the whole session: it keeps the brushes it has loaded. */
  readonly painter: Painter;
  /** The common shortcuts, and the mode's own, which win. */
  readonly keymap: KeymapIndex;
  /** The tool bar's swatch: what the tool would make of the color drawn with, at the cursor. */
  readonly toolPreview: ReturnType<NonNullable<Tool["preview"]>> | null;
  /** The title bar's menus. Undo and redo name their step, e.g. "Undo Brush". */
  readonly menus: ReturnType<typeof availableMenus>;
  /** The layout (the side of the panels, the sizes of resizable panels), kept from one
   *  session to the next, and where the parts go now. */
  readonly prefs = new LayoutPrefs();
  readonly layout: EditorLayout;
  /** The preview of the whole drawing, over the canvas or in a window of its own. */
  readonly preview: PreviewState;

  /** The message shown at the bottom. */
  error = $state<string | null>(null);
  /** The window (or the browser's page) is full screen: followed, F11 and Esc change it too. */
  fullScreen = $state(false);
  /** Only the canvas shows: every panel and bar is hidden (Tab). */
  interfaceHidden = $state(false);
  camera = $state<Camera>({ x: 0, y: 0, zoom: 1, rotation: 0 });
  cursor = $state<Point | null>(null);
  canvasView = $state<CanvasControls | null>(null);
  /** The user's palettes, once loaded. */
  palettes = $state.raw<PaletteLibrary | null>(null);
  paletteVersion = $state(0);
  /** Opens the system's file picker for images, or for palettes: set by the interface. */
  pickImages = () => {};
  pickPalette = () => {};

  /** Starts with `initial` (e.g. the stress test), else a new document. */
  constructor(private readonly initial: Editor | undefined) {
    // The start screen shows at start. In a browser, only once it is known that no document
    // comes back (see `session.start`).
    this.dialogs = new EditorDialogs(!initial && capabilities.userFiles);
    this.session = new Session(
      { notify: (message) => this.notify(message), askUnsaved: (n) => this.dialogs.askUnsaved(n) },
      initial ?? blankEditor(this.modes.get(START_MODE)),
      initial ? DEFAULT_MODE : START_MODE,
    );
    this.editor = $derived(this.session.editor);
    this.changes = new EditorChanges(() => this.editor);
    this.mode = $derived(this.modes.resolve(this.session.mode));
    this.tools = new ToolState(
      createToolRegistry(),
      untrack(() => this.mode),
    );
    this.options = this.tools.options;
    $effect.pre(() => {
      const next = this.mode;
      untrack(() => this.tools.setMode(next));
    });
    this.shownTool = $derived(held.alt ? pickerTool : this.tools.active);
    this.colorsSync = new ModeColorsSync(this.modeColors, this.options, () => this.mode.id);
    this.painter = new Painter(this.session.editor, {
      tool: (eraser) => this.tools.forPen(eraser),
      options: () => $state.snapshot(this.options),
      onPick: (picked) => this.tools.pick(picked),
      onPainted: (color) => this.modeColors.addRecent(this.mode.id, color),
      onMessage: (message) => this.notify(message),
      modifiers: heldModifiers,
    });
    $effect.pre(() => this.painter.setEditor(this.editor));
    this.keymap = $derived(
      new KeymapIndex({
        version: 1,
        bindings: [
          ...DEFAULT_KEYMAP.bindings,
          ...(capabilities.userFiles ? [] : BROWSER_BINDINGS),
          ...this.mode.bindings,
        ],
      }),
    );
    $effect(() => watchFullScreen((on) => (this.fullScreen = on)));
    this.layout = new EditorLayout(this.prefs, () => this.shownTool.id);
    this.preview = new PreviewState(() => this.editor.drawing);
    this.toolPreview = $derived.by(() => this.previewTool());
    this.menus = $derived.by(() => {
      void this.changes.version;
      const all = defaultMenus({
        recent: this.session.recent,
        modes: this.modes.list(),
        undoLabel: this.editor.history.undoLabel,
        redoLabel: this.editor.history.redoLabel,
      });
      return availableMenus(all, (id) => this.editor.commands.has(id));
    });
    // Registered before the first render, which shows the commands' titles.
    $effect.pre(() => registerAppCommands(this.editor.commands, this.commandHost()));
    // "● name — Didi" while there are unsaved changes, in the taskbar or the browser's tab.
    $effect(() => {
      const { name } = this.session;
      const title = this.session.unsaved
        ? m.editor_window_title_unsaved({ name })
        : m.editor_window_title({ name });
      if (appWindow) {
        // Nothing to do if it fails: the title is only a hint.
        void appWindow.setTitle(title);
      } else {
        document.title = title;
      }
    });
    $effect(() => {
      // Not behind the preferences: the whole interface is seen while choosing its look.
      windowTitle.dimmed = this.dialogs.anyOpen && !this.dialogs.preferences;
    });
  }

  private previewTool() {
    const { shownTool: tool, options, changes, cursor } = this;
    if (!tool.preview) {
      return null;
    }
    void changes.version;
    void changes.pixelVersion;
    const opacity = options.tools[this.tools.drawingTool]?.opacity;
    const current = { color: options.color, opacity: typeof opacity === "number" ? opacity : 1 };
    if (!cursor) {
      return current;
    }
    return tool.preview(this.editor, options.tools[tool.id], cursor, current);
  }

  /** Shows a message at the bottom for a few seconds. */
  notify(message: string) {
    this.error = message;
    setTimeout(() => {
      if (this.error === message) {
        this.error = null;
      }
    }, 6000);
  }

  /**
   * A mode, a size or a background chosen in the start screen. While the document behind is
   * untouched, it becomes an empty one with that choice, so that what is behind matches it
   * (also when clicking outside). A document with any change or a file is never replaced.
   */
  previewNew(width: number, height: number, background: Background, mode: string) {
    if (!this.session.untouched) {
      return;
    }
    void this.session.newDocument(width, height, background, mode);
  }

  /** Runs a command from the interface. */
  run(id: string, params?: unknown) {
    runCommand(this.editor, this.painter, id, params);
  }

  /** A command's first shortcut, e.g. "Ctrl+S", if it has one. */
  shortcut(id: string): string | undefined {
    const chord = this.keymap.chordsFor(id)[0];
    return chord && formatChord(chord);
  }

  /** Tooltip with the command's title and shortcut, e.g. "Undo (Ctrl+Z)". */
  tip(id: string): string {
    const title = this.editor.commands.get(id)?.title ?? id;
    const keys = this.shortcut(id);
    return keys ? m.editor_command_tip({ title, keys }) : title;
  }

  /** Whether a command can run now, for menus. */
  enabled(id: string, params?: unknown): boolean {
    void this.changes.version;
    return this.editor.commands.has(id) && this.editor.commands.isEnabled(id, params);
  }

  /** Imports images as layers and .hex files as palettes. */
  importFiles(files: Iterable<File>) {
    void importFiles(this.editor, this.palettes, files, (message) => this.notify(message));
  }

  importPalette(file: File) {
    void importPalette(this.palettes, file, (message) => this.notify(message));
  }

  /** Loads what the editor needs and was saved; returns what stops it on unmount. */
  mount(): () => void {
    const notify = (message: string) => this.notify(message);
    // Follows Shift and Ctrl from now on, for the shape tools.
    heldModifiers();
    loadMyPaint()
      .then((engine) => this.painter.setEngine(engine))
      .catch((e) => (this.error = m.editor_brush_engine_unavailable({ error: errorMessage(e) })));
    void this.prefs.load(notify);
    void this.colorsSync.load(notify);
    themePrefs.reportErrors(notify);
    loadPalettes(notify)
      .then((library) => {
        this.palettes = library;
        library.subscribe(() => this.paletteVersion++);
      })
      .catch((e) => notify(m.files_palettes_load_failed({ error: errorMessage(e) })));
    void closeStalePreview();
    void this.session.start().then((restored) => {
      if (!this.initial && !capabilities.userFiles && !restored) {
        this.dialogs.start = true;
      }
    });
    if (!appWindow) {
      return () => {};
    }
    // Closing the window: offer to save unsaved changes first.
    const window = appWindow;
    const unlisten = window.onCloseRequested(async (event) => {
      event.preventDefault();
      if (!(await this.session.confirmDiscard())) {
        return;
      }
      await Promise.all([
        this.session.closing(),
        flushPalettes(),
        this.prefs.flush(),
        this.modeColors.flush(),
        themePrefs.flush(),
      ]);
      this.preview.closeWindow();
      await window.destroy();
    });
    return () => void unlisten.then((fn) => fn());
  }

  /** In a browser, closing the tab would lose the latest changes: the browser asks first. */
  onBeforeUnload(e: BeforeUnloadEvent) {
    if (!capabilities.ownWindow && this.session.unsaved) {
      e.preventDefault();
    }
  }

  onKeyDown(e: KeyboardEvent) {
    if (isTyping(e) || this.dialogs.anyOpen) {
      return;
    }
    // Esc is for the stroke in progress (see CanvasView), whichever hears it first.
    if (e.defaultPrevented || (e.key === "Escape" && this.painter.active)) {
      return;
    }
    const binding = this.keymap.match(keyInput(e));
    if (!binding) {
      return;
    }
    const { commands } = this.editor;
    // Its shortcut still means nothing else here: Ctrl+S must not open the browser's dialog.
    if (!commands.has(binding.command)) {
      return e.preventDefault();
    }
    // Not disabled commands: Enter still has to press a focused button.
    if (!commands.isEnabled(binding.command, binding.params)) {
      return;
    }
    e.preventDefault();
    this.run(binding.command, binding.params);
  }

  /** What the app's commands act on (see app-commands.ts). */
  private commandHost(): AppHost {
    const { session, prefs, layout, preview, dialogs, tools, modeColors } = this;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const state = this;
    return {
      get mode() {
        return session.mode;
      },
      set mode(id) {
        session.setMode(id);
      },
      modes: this.modes,
      get hand() {
        return prefs.hand;
      },
      set hand(hand) {
        prefs.hand = hand;
      },
      togglePanels: () => layout.togglePanels(),
      togglePixelGrid: () => (prefs.pixelGrid = !prefs.pixelGrid),
      toggleTileGrid: () => session.setGrid({ ...session.grid, shown: !session.grid.shown }),
      shown: (what) => {
        const on: Record<typeof what, () => boolean> = {
          panels: () => layout.panelsOpen,
          interface: () => !this.interfaceHidden,
          pixelGrid: () => prefs.pixelGrid,
          preview: () => preview.place !== "off",
          tileGrid: () => session.grid.shown,
        };
        return on[what]();
      },
      togglePreview: () => (preview.place = preview.place === "off" ? "in" : "off"),
      openGridSettings: () => (dialogs.grid = true),
      toggleInterface: () => (this.interfaceHidden = !this.interfaceHidden),
      toggleFullScreen: () =>
        void toggleFullScreen().catch((e) =>
          this.notify(m.app_full_screen_failed({ error: errorMessage(e) })),
        ),
      openShortcuts: () => (dialogs.shortcuts = true),
      openAbout: () => (dialogs.about = true),
      openPreferences: () => (dialogs.preferences = true),
      get tool() {
        return tools.id;
      },
      set tool(id) {
        tools.id = id;
      },
      tools: tools.registry,
      options: this.options,
      get view() {
        return state.canvasView;
      },
      get palettes() {
        return state.palettes;
      },
      recentColors: () => modeColors.recent(this.mode.id),
      clearRecentColors: () => modeColors.clearRecent(this.mode.id),
      notify: (message) => this.notify(message),
      openSizeDialog: (kind) => (dialogs.size = kind),
      importImage: () => this.pickImages(),
      newDocument: () => (dialogs.start = true),
      openDocument: (path) => session.open(path),
      saveDocument: () => session.save(),
      saveDocumentAs: () => session.saveAs(),
      exportPng: () => session.exportPng(),
      importPalette: () => this.pickPalette(),
      confirm: (question) => dialogs.confirm(question),
      openCommandPalette: () => (dialogs.commandPalette = true),
      canUseFiles: capabilities.userFiles,
      quit: appWindow ? () => void appWindow?.close() : null,
    };
  }
}
