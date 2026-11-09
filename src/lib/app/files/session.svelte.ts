// The open document: its editor, mode, file and unsaved changes, and the file actions (new,
// open, save, save as, export), recent files and crash recovery (see recovery-copy).

import {
  DEFAULT_TILE_GRID,
  documentFromEditor,
  editorFromDocument,
  type DocumentData,
  type TileGrid,
} from "#lib/core/file/didi-file.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { errorMessage } from "#lib/app/error-message.js";
import {
  canUseFiles,
  chooseBrowserFile,
  chooseFileToOpen,
  chooseFileToSave,
} from "#lib/platform/storage.js";
import {
  documentName,
  exportPng,
  renderPng,
  fileName,
  openDocument,
  pngDataUrl,
  saveDocument,
} from "./files";
import { newEditor, type Background } from "./new-drawing";
import { DEFAULT_MODE } from "#lib/app/modes/mode.js";
import { loadRecent, saveRecent, withRecent, type RecentFile } from "./recent";
import {
  discardSetAsideCopy,
  readLeftCopy,
  readSetAsideCopy,
  RecoveryCopy,
  setAsideLeftCopy,
  type RecoveryInfo,
} from "./recovery-copy.svelte";
import { m } from "#lib/paraglide/messages.js";

export type { RecoveryInfo } from "./recovery-copy.svelte";

export type UnsavedChoice = "save" | "discard" | "cancel";

export interface SessionHost {
  /** Shows a message to the user. */
  notify(message: string): void;
  /** Asks what to do with the unsaved changes of a document. */
  askUnsaved(name: string): Promise<UnsavedChoice>;
}

const didiFilter = () => [{ name: m.files_didi_filter(), extensions: ["didi"] }];
const sameGrid = (a: TileGrid, b: TileGrid) =>
  a.width === b.width && a.height === b.height && a.shown === b.shown;

const pngFilter = () => [{ name: m.files_png_filter(), extensions: ["png"] }];

/** The document as last saved, to tell whether it has changed since. */
interface SavedState {
  /** See History.marker. */
  marker: unknown;
  mode: string;
  grid: TileGrid;
  /** Visibility is saved, but is not in the history. */
  hidden: ReadonlySet<string>;
}

const savedStateOf = (editor: Editor, mode: string, grid: TileGrid): SavedState => ({
  marker: editor.history.marker,
  mode,
  grid,
  hidden: new Set(editor.drawing.layers.filter((l) => !l.visible).map((l) => l.id)),
});

/** What a document replacing the open one is. */
interface Replacement {
  /** Its file, null if it has none. */
  path: string | null;
  name: string;
  mode: string;
  grid?: TileGrid;
  extensions?: Record<string, unknown>;
  /** Its changes are in no file (e.g. a recovered copy): replacing it would lose them. */
  inNoFile?: boolean;
  /** The recovery copy is this document's, and stays. */
  keepCopy?: boolean;
}

export class Session {
  editor: Editor = $state.raw(newEditor());
  /** The document's file, null until it is saved. */
  path = $state<string | null>(null);
  name = $state<string>(m.files_untitled());
  /** Id of the document's mode (see $lib/app/modes), saved with it. */
  mode = $state(DEFAULT_MODE);
  /** The tiles' grid over the drawing, saved with it. */
  grid = $state.raw<TileGrid>(DEFAULT_TILE_GRID);
  /** A file action in progress ("Saving…"), shown to the user. */
  busy = $state<string | null>(null);
  recent = $state.raw<RecentFile[]>([]);
  /** A copy left by a session that did not close normally. */
  recovery = $state.raw<RecoveryInfo | null>(null);

  private saved = $state.raw<SavedState>(
    savedStateOf(this.editor, DEFAULT_MODE, DEFAULT_TILE_GRID),
  );
  /** Bumped on every history or visibility change, to recompute `dirty`. */
  private revision = $state(0);
  private extensions: Record<string, unknown> = {};
  private unsubscribe: () => void = () => {};
  private readonly copy = new RecoveryCopy({
    needsCopy: () => this.dirty,
    snapshot: () => ({
      doc: documentFromEditor(this.editor, this.extensions, this.mode, this.grid),
      info: { name: this.name, path: this.path, time: Date.now() },
    }),
    onError: (e) => this.host.notify(m.files_recovery_write_failed({ error: errorMessage(e) })),
  });

  /** `editor`: the document to start with, a new one by default, in `mode`. */
  constructor(
    private readonly host: SessionHost,
    editor: Editor = newEditor(),
    mode: string = DEFAULT_MODE,
  ) {
    this.setEditor(editor);
    this.mode = mode;
    this.saved = savedStateOf(editor, mode, this.grid);
  }

  /**
   * A new document nobody has touched: no file, no change, nothing to undo or redo. It can
   * be replaced without losing anything.
   */
  get untouched(): boolean {
    const { history } = this.editor;
    return this.path === null && !this.dirty && !history.canUndo && !history.canRedo;
  }

  /** Whether the document has changes that are not saved. */
  get dirty(): boolean {
    void this.revision;
    const { saved } = this;
    return (
      this.editor.history.marker !== saved.marker ||
      this.mode !== saved.mode ||
      !sameGrid(this.grid, saved.grid) ||
      this.editor.drawing.layers.some((l) => l.visible === saved.hidden.has(l.id))
    );
  }

  /** Whether closing now would lose changes. In a browser, the copy keeps them. */
  get unsaved(): boolean {
    return canUseFiles() ? this.dirty : this.copy.pending;
  }

  /**
   * Loads the recent files, and sets aside a copy left by a crash. Call once at start. Returns
   * whether the document was restored (in a browser).
   */
  async start(): Promise<boolean> {
    try {
      this.recent = await loadRecent();
      if (!canUseFiles()) return await this.restoreCopy();
      const info = await setAsideLeftCopy();
      await this.copy.remove();
      if (info) this.recovery = info;
    } catch (e) {
      this.host.notify(m.files_app_data_read_failed({ error: errorMessage(e) }));
    }
    return false;
  }

  /** In a browser: back to the document as it was when the tab closed. */
  private async restoreCopy(): Promise<boolean> {
    const left = await readLeftCopy();
    if (!left || !this.untouched) return false;
    this.load(left.doc, { path: null, name: left.info.name, inNoFile: true, keepCopy: true });
    this.copy.adopt();
    return true;
  }

  /** Asks to save unsaved changes. Returns false if the user cancels. */
  async confirmDiscard(): Promise<boolean> {
    if (!this.dirty) return true;
    const choice = await this.host.askUnsaved(this.name);
    if (choice === "save") return this.save();
    return choice === "discard";
  }

  async newDocument(
    width: number,
    height: number,
    background: Background,
    mode: string = DEFAULT_MODE,
  ) {
    if (!(await this.confirmDiscard())) return;
    this.replace(newEditor(width, height, background), {
      path: null,
      name: m.files_untitled(),
      mode,
    });
  }

  /** Changes the document's mode: an unsaved change, but not an undo step. */
  setMode(id: string) {
    if (id === this.mode) return;
    this.mode = id;
    this.copy.schedule();
  }

  /** Changes the tiles' grid (or shows it): an unsaved change, but not an undo step. */
  setGrid(grid: TileGrid) {
    if (sameGrid(grid, this.grid)) return;
    this.grid = grid;
    this.copy.schedule();
  }

  /** Opens a .didi file: the given one, or one chosen by the user. */
  async open(path?: string) {
    if (!this.checkFiles() || !(await this.confirmDiscard())) return;
    path ??= (await chooseFileToOpen(didiFilter())) ?? undefined;
    if (!path) return;
    const name = fileName(path);
    await this.run(
      m.files_opening({ name }),
      (error) => m.files_open_failed({ name, error }),
      async () => {
        const { doc, thumbnail } = await openDocument(path);
        this.load(doc, { path, name: documentName(path) });
        if (thumbnail) await this.addRecent(path, thumbnail);
      },
    );
  }

  /** Saves to the document's file, or asks for one. Returns false if not saved. */
  async save(): Promise<boolean> {
    if (!this.path) return this.saveAs();
    return this.saveTo(this.path);
  }

  async saveAs(): Promise<boolean> {
    if (!this.checkFiles()) return false;
    let path = await chooseFileToSave(this.path ?? `${this.name}.didi`, didiFilter());
    if (!path) return false;
    if (!/\.didi$/i.test(path)) path += ".didi";
    return this.saveTo(path);
  }

  async exportPng() {
    if (!canUseFiles()) return this.downloadPng();
    let path = await chooseFileToSave(`${this.name}.png`, pngFilter());
    if (!path) return;
    if (!/\.png$/i.test(path)) path += ".png";
    const doc = documentFromEditor(this.editor);
    const name = fileName(path);
    await this.run(
      m.files_exporting({ name }),
      (error) => m.files_export_failed({ name, error }),
      () => exportPng(path, doc),
    );
  }

  /** In a browser, which has no paths: it writes where the user chose. */
  private async downloadPng() {
    const name = `${this.name}.png`;
    const write = await chooseBrowserFile(name, "image/png", ".png");
    if (!write) return;
    const doc = documentFromEditor(this.editor);
    await this.run(
      m.files_exporting({ name }),
      (error) => m.files_export_failed({ name, error }),
      async () => write(await renderPng(doc)),
    );
  }

  /** Opens the copy left by a previous session, as an unsaved document. */
  async recover() {
    const info = this.recovery;
    if (!info || !(await this.confirmDiscard())) return;
    await this.run(
      m.files_recovering(),
      (error) => m.files_recover_failed({ error }),
      async () => {
        const doc = await readSetAsideCopy();
        this.load(doc, { path: info.path, name: info.name, inNoFile: true });
        // This session's copy first: at no point does a crash lose the document.
        await this.copy.writeNow();
        await this.discardRecovery();
      },
    );
  }

  async discardRecovery() {
    this.recovery = null;
    await discardSetAsideCopy();
  }

  /** Forgets this session's recovery copy: call when closing normally. */
  async closing() {
    await this.copy.remove();
  }

  private async saveTo(path: string): Promise<boolean> {
    // The state being saved: later changes, during the save, stay unsaved.
    const doc = documentFromEditor(this.editor, this.extensions, this.mode, this.grid);
    const saved = savedStateOf(this.editor, this.mode, this.grid);
    const name = fileName(path);
    return this.run(
      m.files_saving({ name }),
      (error) => m.files_save_failed({ name, error }),
      async () => {
        const thumbnail = await saveDocument(path, doc);
        this.path = path;
        this.name = documentName(path);
        this.saved = saved;
        await this.copy.remove();
        await this.addRecent(path, thumbnail);
      },
    );
  }

  /**
   * Runs a file action, showing `label` meanwhile. Returns false (and tells, with `failure`
   * given the error) if it fails.
   */
  private async run(
    label: string,
    failure: (error: string) => string,
    action: () => Promise<void>,
  ): Promise<boolean> {
    this.busy = label;
    try {
      await action();
      return true;
    } catch (e) {
      this.host.notify(failure(errorMessage(e)));
      return false;
    } finally {
      this.busy = null;
    }
  }

  private checkFiles(): boolean {
    if (canUseFiles()) return true;
    this.host.notify(m.files_desktop_only());
    return false;
  }

  /** Replaces the open document with one read from a file or a copy. */
  private load(doc: DocumentData, replacement: Omit<Replacement, "mode" | "grid" | "extensions">) {
    this.replace(editorFromDocument(doc), {
      ...replacement,
      mode: doc.mode ?? DEFAULT_MODE,
      grid: doc.grid,
      extensions: doc.extensions,
    });
  }

  private replace(editor: Editor, replacement: Replacement) {
    this.setEditor(editor);
    this.path = replacement.path;
    this.name = replacement.name;
    this.mode = replacement.mode;
    this.grid = replacement.grid ?? DEFAULT_TILE_GRID;
    this.extensions = replacement.extensions ?? {};
    this.saved = savedStateOf(editor, replacement.mode, this.grid);
    if (replacement.inNoFile) this.saved = { ...this.saved, marker: {} };
    if (!replacement.keepCopy) void this.copy.remove();
  }

  private setEditor(editor: Editor) {
    this.unsubscribe();
    this.editor = editor;
    const changed = () => {
      this.revision++;
      this.copy.schedule();
    };
    const unsubscribe = [
      editor.history.subscribe(changed),
      editor.drawing.subscribe((change) => {
        if (change.type === "layer-updated" && change.keys.includes("visible")) changed();
      }),
    ];
    this.unsubscribe = () => unsubscribe.forEach((fn) => fn());
  }

  private async addRecent(path: string, thumbnail: Uint8Array) {
    this.recent = withRecent(this.recent, {
      path,
      name: documentName(path),
      thumbnail: pngDataUrl(thumbnail),
      time: Date.now(),
      mode: this.mode,
    });
    await saveRecent(this.recent);
  }
}
