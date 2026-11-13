// Everything the editor's interface shows and acts on: the open document, the tools and
// colors, the painter, the shortcuts and menus, the layout, the preview and the dialogs. Created by EditorApp, while it initializes (its effects belong to it).

import { registerAppCommands } from "#lib/app/commands/app-commands.js";
import { BROWSER_BINDINGS, DEFAULT_KEYMAP } from "#lib/app/commands/default-keymap.js";
import { availableMenus, defaultMenus } from "#lib/app/commands/default-menus.js";
import { isTyping, keyInput } from "#lib/app/commands/keyboard.js";
import { formatChord, KeymapIndex } from "#lib/app/commands/keymap.js";
import { runCommand } from "#lib/app/commands/run-command.js";
import { importFiles, importPalette } from "#lib/app/files/import-image.js";
import { NEW_DOCUMENT } from "#lib/app/files/new-document-choice.svelte.js";
import { newEditor, type Background } from "#lib/app/files/new-drawing.js";
import { flushPalettes, loadPalettes } from "#lib/app/files/palette-storage.js";
import { Session } from "#lib/app/files/session.svelte.js";
import { watchLastPointer } from "#lib/app/input/last-pointer.js";
import { held, heldModifiers } from "#lib/app/input/modifiers.svelte.js";
import { Painter } from "#lib/app/input/painter.js";
import { ViewController } from "#lib/app/input/view-controller.svelte.js";
import { EditorLayout } from "#lib/app/layout/editor-layout.svelte.js";
import { windowTitle } from "#lib/app/layout/window-title.svelte.js";
import { LayoutPrefs } from "#lib/app/prefs/layout-prefs.svelte.js";
import { SavedColors } from "#lib/app/prefs/saved-colors.svelte.js";
import { themePrefs } from "#lib/app/prefs/theme-prefs.svelte.js";
import { PreviewState } from "#lib/app/preview/preview-state.svelte.js";
import { errorMessage } from "#lib/app/shared/error-message.js";
import { Watched } from "#lib/app/shared/watched.svelte.js";
import { AppUpdate } from "#lib/app/state/app-update.svelte.js";
import { EditorDialogs } from "#lib/app/state/dialogs.svelte.js";
import { commandHost } from "#lib/app/state/command-host.js";
import { EditorChanges } from "#lib/app/state/editor-changes.svelte.js";
import { Messages, type MessageAction, type MessageLevel } from "#lib/app/state/messages.svelte.js";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import { pickerTool } from "#lib/app/tools/picker-tool.js";
import { ToolState } from "#lib/app/tools/tool-state.svelte.js";
import type { Tool, ToolOptions } from "#lib/app/tools/tool.js";
import type { PaletteLibrary } from "#lib/core/color/palette.js";
import { CommandRegistry } from "#lib/core/editor/commands.js";
import { registerEditorCommands } from "#lib/core/editor/editor-commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { m } from "#lib/paraglide/messages.js";
import { capabilities } from "#lib/platform/capabilities.js";
import { closeStalePreview } from "#lib/platform/preview-window.js";
import { findUpdate, restartApp } from "#lib/platform/updater.js";
import { appWindow, watchFullScreen } from "#lib/platform/window.js";
import type { Point } from "#lib/render/camera.js";

export class EditorState {
  readonly dialogs: EditorDialogs;
  /** The open document, and its file. */
  readonly session: Session;
  readonly editor: Editor;
  /** Every command, registered once: they act on the open document, whichever it is. */
  readonly commands = new CommandRegistry<Editor>(() => this.editor);
  readonly changes: EditorChanges;
  readonly tools: ToolState;
  readonly options: ToolOptions;
  /** The tool the panels show: Alt turns any tool into the picker while it is held. */
  readonly shownTool: Tool;
  /** The current and second colors, kept from one session to the next. */
  private readonly savedColors: SavedColors;
  /** One painter for the whole session. */
  readonly painter: Painter;
  /** The shortcuts. */
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

  /** The messages shown at the bottom. */
  readonly messages = new Messages();
  /** A newer version of the app, offered at start (in the builds that update themselves). */
  readonly update = new AppUpdate({
    find: findUpdate,
    startScreenOpen: () => this.dialogs.start,
    notify: (text, level, action) => this.notify(text, level, action),
    prepareToQuit: () => this.prepareToQuit(),
    restart: restartApp,
  });
  /** The window (or the browser's page) is full screen: followed, F11 and Esc change it too. */
  fullScreen = $state(false);
  /** Only the canvas shows: every panel and bar is hidden (Tab). */
  interfaceHidden = $state(false);
  cursor = $state<Point | null>(null);
  /** The canvas's view: its camera, and what moves it. */
  readonly view: ViewController;
  /** The user's palettes, once loaded. */
  readonly palettes = new Watched<PaletteLibrary>();
  /** Opens the system's file picker for images, or for palettes: set by the interface. */
  pickImages = () => {};
  pickPalette = () => {};

  /** Starts with `initial` (e.g. the stress test), else a new document. */
  constructor(private readonly initial: Editor | undefined) {
    // The start screen shows at start. In a browser, only once it is known that no document
    // comes back (see `session.start`).
    this.dialogs = new EditorDialogs(!initial && capabilities.userFiles);
    this.session = new Session(
      {
        notify: (message, level) => this.notify(message, level),
        askUnsaved: (n) => this.dialogs.askUnsaved(n),
      },
      initial ?? newEditor(NEW_DOCUMENT.width, NEW_DOCUMENT.height, NEW_DOCUMENT.background),
    );
    this.editor = $derived(this.session.editor);
    this.changes = new EditorChanges(() => this.editor);
    this.tools = new ToolState(createToolRegistry());
    this.options = this.tools.options;
    this.shownTool = $derived(held.alt ? pickerTool : this.tools.active);
    this.savedColors = new SavedColors(this.options);
    this.painter = new Painter(this.session.editor, {
      tool: (eraser) => this.tools.forPen(eraser),
      options: () => $state.snapshot(this.options),
      onPick: (picked) => this.tools.pick(picked),
      onMessage: (message) => this.notify(message, "info"),
      modifiers: heldModifiers,
    });
    $effect.pre(() => this.painter.setEditor(this.editor));
    this.keymap = $derived(
      new KeymapIndex({
        version: 1,
        bindings: [...DEFAULT_KEYMAP.bindings, ...(capabilities.userFiles ? [] : BROWSER_BINDINGS)],
      }),
    );
    $effect(() => watchFullScreen((on) => (this.fullScreen = on)));
    this.layout = new EditorLayout(this.prefs, () => this.shownTool.id);
    this.preview = new PreviewState(() => this.editor.drawing);
    this.view = new ViewController({
      canvas: () => this.editor.drawing,
      insets: () => this.layout.insets(),
    });
    this.toolPreview = $derived.by(() => this.previewTool());
    this.menus = $derived.by(() => {
      const { history } = this.changes;
      const all = defaultMenus({
        recent: this.session.recent,
        undoLabel: history.undoLabel,
        redoLabel: history.redoLabel,
      });
      return availableMenus(all, (id) => this.commands.has(id));
    });
    // Once everything they act on exists.
    registerEditorCommands(this.commands);
    registerAppCommands(this.commands, commandHost(this));
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
      windowTitle.dimLayers = this.dialogs.dimLayers;
    });
  }

  private previewTool() {
    const { shownTool: tool, options, changes, cursor } = this;
    if (!tool.preview) {
      return null;
    }
    changes.track();
    changes.trackPixels();
    const opacity = options.tools[this.tools.drawingTool]?.opacity;
    const current = { color: options.color, opacity: typeof opacity === "number" ? opacity : 1 };
    if (!cursor) {
      return current;
    }
    return tool.preview(this.editor, options.tools[tool.id], cursor, current);
  }

  /**
   * The work in progress, under the messages: saving, opening… or the update, unless the
   * start screen shows it already.
   */
  get busy(): string | null {
    return this.session.busy ?? (this.dialogs.start ? null : this.update.busy);
  }

  /** Shows a message at the bottom: an error by default, which stays until closed. */
  notify(message: string, level: MessageLevel = "error", action?: MessageAction) {
    this.messages.show(message, level, action);
  }

  /**
   * A size or a background chosen in the start screen. While the document behind is
   * untouched, it becomes an empty one with that choice, so that what is behind matches it
   * (also when clicking outside). A document with any change or a file is never replaced.
   */
  previewNew(width: number, height: number, background: Background) {
    if (!this.session.untouched) {
      return;
    }
    void this.session.newDocument(width, height, background);
  }

  /** Runs a command from the interface. */
  run(id: string, params?: unknown) {
    runCommand(this.commands, this.editor, this.painter, id, params);
  }

  /** A command's first shortcut, e.g. "Ctrl+S", if it has one. */
  shortcut(id: string): string | undefined {
    const chord = this.keymap.chordsFor(id)[0];
    return chord && formatChord(chord);
  }

  /** Tooltip with the command's title and shortcut, e.g. "Undo (Ctrl+Z)". */
  tip(id: string): string {
    const title = this.commands.get(id)?.title ?? id;
    const keys = this.shortcut(id);
    return keys ? m.editor_command_tip({ title, keys }) : title;
  }

  /** Whether a command can run now, for menus. */
  enabled(id: string, params?: unknown): boolean {
    this.changes.track();
    return this.commands.has(id) && this.commands.isEnabled(id, params);
  }

  /** Imports images as layers and .hex files as palettes. */
  importFiles(files: Iterable<File>) {
    void importFiles(this.editor, this.palettes.current, files, (message) => this.notify(message));
  }

  importPalette(file: File) {
    void importPalette(this.palettes.current, file, (message) => this.notify(message));
  }

  /** Loads what the editor needs and was saved; returns what stops it on unmount. */
  mount(): () => void {
    const notify = (message: string) => this.notify(message);
    // Follows Shift and Ctrl from now on, for the shape tools, and the pointers for bug reports.
    heldModifiers();
    const stopPointers = watchLastPointer();
    void this.prefs.load(notify);
    void this.savedColors.load(notify);
    themePrefs.reportErrors(notify);
    loadPalettes(notify)
      .then((library) => this.palettes.set(library))
      .catch((e) => notify(m.files_palettes_load_failed({ error: errorMessage(e) })));
    void closeStalePreview();
    void this.session.start().then((restored) => {
      if (!this.initial && !capabilities.userFiles && !restored) {
        this.dialogs.start = true;
      }
    });
    void this.update.check();
    if (!appWindow) {
      return stopPointers;
    }
    // Closing the window: offer to save unsaved changes first.
    const window = appWindow;
    const unlisten = window.onCloseRequested(async (event) => {
      event.preventDefault();
      if (await this.prepareToQuit()) {
        await window.destroy();
      }
    });
    return () => {
      stopPointers();
      void unlisten.then((fn) => fn());
    };
  }

  /**
   * Before quitting (closing the window, installing an update): offers to save unsaved changes,
   * writes what is pending, closes the preview's window. False if the user cancels.
   */
  private async prepareToQuit(): Promise<boolean> {
    if (!(await this.session.confirmDiscard())) {
      return false;
    }
    await Promise.all([
      this.session.closing(),
      flushPalettes(),
      this.prefs.flush(),
      this.savedColors.flush(),
      themePrefs.flush(),
    ]);
    this.preview.closeWindow();
    return true;
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
    const { commands } = this;
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
}
