// The open document: its editor, mode, file and unsaved changes, and the file actions (new,
// open, save, save as, export), recent files and crash recovery.
//
// Recovery: a few seconds after a change, a copy of the document is written to the app data
// folder (never to the user's file). It is removed when the document is saved or closed
// normally. At start, a copy left by a crash is moved aside and offered in the start
// screen until the user opens or discards it.
//
// In a browser, there are no files: that copy is the document's only save. It stays when the
// tab closes, and comes back by itself at start.

import { documentFromEditor, editorFromDocument } from "#lib/core/file/didi-file.js";
import type { Editor } from "#lib/core/editor/editor.js";
import {
  canUseFiles,
  chooseBrowserFile,
  chooseFileToOpen,
  chooseFileToSave,
  readDataBytes,
  readDataFile,
  removeDataFile,
  writeDataBytes,
  writeDataFile,
} from "#lib/platform/storage.js";
import {
  decodeDocument,
  documentName,
  encodeDocument,
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

export type UnsavedChoice = "save" | "discard" | "cancel";

export interface SessionHost {
  /** Shows a message to the user. */
  notify(message: string): void;
  /** Asks what to do with the unsaved changes of a document. */
  askUnsaved(name: string): Promise<UnsavedChoice>;
}

export interface RecoveryInfo {
  name: string;
  /** The file the document came from, if it had one. */
  path: string | null;
  /** When the copy was written, in ms since 1970. */
  time: number;
}

const DIDI_FILTER = [{ name: "Didi drawing", extensions: ["didi"] }];
const PNG_FILTER = [{ name: "PNG image", extensions: ["png"] }];
const RECOVERY_DELAY_MS = 3000;
/** Longer for a document that is long to copy: at most a tenth of the time goes to that. */
const RECOVERY_DELAY_PER_WRITE = 10;
/** This session's copy, and the one left by a previous session that did not close. */
const RECOVERY = { file: "recovery.didi", info: "recovery.json" };
const PREVIOUS = { file: "recovery-previous.didi", info: "recovery-previous.json" };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const hiddenLayers = (editor: Editor): ReadonlySet<string> =>
  new Set(editor.drawing.layers.filter((l) => !l.visible).map((l) => l.id));

export class Session {
  editor: Editor = $state.raw(newEditor());
  /** The document's file, null until it is saved. */
  path = $state<string | null>(null);
  name = $state("Untitled");
  /** Id of the document's mode (see $lib/app/modes), saved with it. */
  mode = $state(DEFAULT_MODE);
  /** A file action in progress ("Saving…"), shown to the user. */
  busy = $state<string | null>(null);
  recent = $state.raw<RecentFile[]>([]);
  /** A copy left by a session that did not close normally. */
  recovery = $state.raw<RecoveryInfo | null>(null);

  /** History marker of the last save: see History.marker. */
  private savedMarker = $state.raw<unknown>(null);
  /** The mode at the last save. */
  private savedMode = $state(DEFAULT_MODE);
  /** The layers hidden at the last save. Visibility is saved, but is not in the history. */
  private savedHidden = $state.raw<ReadonlySet<string>>(new Set());
  /** Bumped on every history or visibility change, to recompute `dirty`. */
  private revision = $state(0);
  private extensions: Record<string, unknown> = {};
  private unsubscribe: () => void = () => {};
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  /** The copy's last write or removal: they run one at a time, in order. */
  private recoveryWork: Promise<unknown> = Promise.resolve();
  private recoveryWrites = 0;
  private recoveryWriteMs = 0;
  /** A copy of this session exists, which may have to be removed. */
  private copyWritten = false;
  /** Changes are not in the copy yet. */
  private copyPending = $state(false);

  /** `editor`: the document to start with, a new one by default, in `mode`. */
  constructor(
    private readonly host: SessionHost,
    editor: Editor = newEditor(),
    mode: string = DEFAULT_MODE,
  ) {
    this.setEditor(editor);
    this.savedMarker = editor.history.marker;
    this.savedHidden = hiddenLayers(editor);
    this.mode = this.savedMode = mode;
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
    return (
      this.editor.history.marker !== this.savedMarker ||
      this.mode !== this.savedMode ||
      this.editor.drawing.layers.some((l) => l.visible === this.savedHidden.has(l.id))
    );
  }

  /** Whether closing now would lose changes. In a browser, the copy keeps them. */
  get unsaved(): boolean {
    return canUseFiles() ? this.dirty : this.copyPending;
  }

  /**
   * Loads the recent files, and sets aside a copy left by a crash. Call once at start. Returns
   * whether the document was restored (in a browser).
   */
  async start(): Promise<boolean> {
    try {
      this.recent = await loadRecent();
      if (!canUseFiles()) return await this.restoreCopy();
      const text = await readDataFile(RECOVERY.info);
      const bytes = text !== null ? await readDataBytes(RECOVERY.file) : null;
      if (text !== null && bytes) {
        await writeDataBytes(PREVIOUS.file, bytes);
        await writeDataFile(PREVIOUS.info, text);
      }
      await this.removeRecovery();
      const previous = await readDataFile(PREVIOUS.info);
      if (previous !== null) this.recovery = JSON.parse(previous) as RecoveryInfo;
    } catch (e) {
      this.host.notify(`Could not read the app data: ${message(e)}`);
    }
    return false;
  }

  /** In a browser: back to the document as it was when the tab closed. */
  private async restoreCopy(): Promise<boolean> {
    const text = await readDataFile(RECOVERY.info);
    const bytes = text !== null ? await readDataBytes(RECOVERY.file) : null;
    if (text === null || !bytes || !this.untouched) return false;
    const info = JSON.parse(text) as RecoveryInfo;
    const { doc } = await decodeDocument(bytes);
    this.replace(editorFromDocument(doc), null, info.name, doc.mode ?? DEFAULT_MODE, true);
    this.extensions = doc.extensions;
    // Not in any file: replacing it would lose it.
    this.savedMarker = {};
    this.copyWritten = true;
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
    this.replace(newEditor(width, height, background), null, "Untitled", mode);
  }

  /** Changes the document's mode: an unsaved change, but not an undo step. */
  setMode(id: string) {
    if (id === this.mode) return;
    this.mode = id;
    this.scheduleRecovery();
  }

  /** Opens a .didi file: the given one, or one chosen by the user. */
  async open(path?: string) {
    if (!this.checkFiles() || !(await this.confirmDiscard())) return;
    path ??= (await chooseFileToOpen(DIDI_FILTER)) ?? undefined;
    if (!path) return;
    await this.run(`Opening ${fileName(path)}…`, `Cannot open ${fileName(path)}`, async () => {
      const { doc, thumbnail } = await openDocument(path);
      this.replace(editorFromDocument(doc), path, documentName(path), doc.mode ?? DEFAULT_MODE);
      this.extensions = doc.extensions;
      if (thumbnail) await this.addRecent(path, thumbnail);
    });
  }

  /** Saves to the document's file, or asks for one. Returns false if not saved. */
  async save(): Promise<boolean> {
    if (!this.path) return this.saveAs();
    return this.saveTo(this.path);
  }

  async saveAs(): Promise<boolean> {
    if (!this.checkFiles()) return false;
    let path = await chooseFileToSave(this.path ?? `${this.name}.didi`, DIDI_FILTER);
    if (!path) return false;
    if (!/\.didi$/i.test(path)) path += ".didi";
    return this.saveTo(path);
  }

  async exportPng() {
    if (!canUseFiles()) return this.downloadPng();
    let path = await chooseFileToSave(`${this.name}.png`, PNG_FILTER);
    if (!path) return;
    if (!/\.png$/i.test(path)) path += ".png";
    const doc = documentFromEditor(this.editor);
    await this.run(`Exporting ${fileName(path)}…`, `Cannot export ${fileName(path)}`, () =>
      exportPng(path, doc),
    );
  }

  /** In a browser, which has no paths: it writes where the user chose. */
  private async downloadPng() {
    const name = `${this.name}.png`;
    const write = await chooseBrowserFile(name, "image/png", ".png");
    if (!write) return;
    const doc = documentFromEditor(this.editor);
    await this.run(`Exporting ${name}…`, `Cannot export ${name}`, async () =>
      write(await renderPng(doc)),
    );
  }

  /** Opens the copy left by a previous session, as an unsaved document. */
  async recover() {
    const info = this.recovery;
    if (!info || !(await this.confirmDiscard())) return;
    await this.run("Recovering…", "Cannot recover the document", async () => {
      const bytes = await readDataBytes(PREVIOUS.file);
      if (!bytes) throw new Error("the copy is missing");
      const { doc } = await decodeDocument(bytes);
      this.replace(editorFromDocument(doc), info.path, info.name, doc.mode ?? DEFAULT_MODE);
      this.extensions = doc.extensions;
      // Not saved yet: the recovered changes are not in any file.
      this.savedMarker = {};
      await this.discardRecovery();
    });
  }

  async discardRecovery() {
    this.recovery = null;
    await removeDataFile(PREVIOUS.file);
    await removeDataFile(PREVIOUS.info);
  }

  /** Forgets this session's recovery copy: call when closing normally. */
  async closing() {
    await this.removeRecovery();
  }

  private async saveTo(path: string): Promise<boolean> {
    // The state being saved: later changes, during the save, stay unsaved.
    const doc = documentFromEditor(this.editor, this.extensions, this.mode);
    const marker = this.editor.history.marker;
    const hidden = hiddenLayers(this.editor);
    const mode = this.mode;
    return this.run(`Saving ${fileName(path)}…`, `Cannot save ${fileName(path)}`, async () => {
      const thumbnail = await saveDocument(path, doc);
      this.path = path;
      this.name = documentName(path);
      this.savedMarker = marker;
      this.savedHidden = hidden;
      this.savedMode = mode;
      await this.removeRecovery();
      await this.addRecent(path, thumbnail);
    });
  }

  /** Runs a file action, showing `label` meanwhile. Returns false (and tells) if it fails. */
  private async run(label: string, failure: string, action: () => Promise<void>): Promise<boolean> {
    this.busy = label;
    try {
      await action();
      return true;
    } catch (e) {
      this.host.notify(`${failure}: ${message(e)}`);
      return false;
    } finally {
      this.busy = null;
    }
  }

  private checkFiles(): boolean {
    if (canUseFiles()) return true;
    this.host.notify("Files can only be opened and saved in the desktop app.");
    return false;
  }

  private replace(
    editor: Editor,
    path: string | null,
    name: string,
    mode: string,
    keepCopy = false,
  ) {
    this.setEditor(editor);
    this.path = path;
    this.name = name;
    this.mode = this.savedMode = mode;
    this.extensions = {};
    this.savedMarker = editor.history.marker;
    this.savedHidden = hiddenLayers(editor);
    if (!keepCopy) void this.removeRecovery();
  }

  private setEditor(editor: Editor) {
    this.unsubscribe();
    this.editor = editor;
    const changed = () => {
      this.revision++;
      this.scheduleRecovery();
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

  private scheduleRecovery() {
    if (this.recoveryTimer !== null || (!this.dirty && !this.copyWritten)) return;
    this.copyPending = true;
    this.recoveryTimer = setTimeout(
      () => {
        this.recoveryTimer = null;
        const id = ++this.recoveryWrites;
        const write = this.inOrder(() => this.writeRecovery());
        write
          .then(() => {
            // Still pending if more changes came meanwhile. After a failure too.
            if (id === this.recoveryWrites && this.recoveryTimer === null) {
              this.copyPending = false;
            }
          })
          .catch((e) => this.host.notify(`Could not write the recovery copy: ${message(e)}`));
      },
      Math.max(RECOVERY_DELAY_MS, this.recoveryWriteMs * RECOVERY_DELAY_PER_WRITE),
    );
  }

  /** After the copy's work in progress: an older write must not land after a newer one. */
  private inOrder(work: () => Promise<void>): Promise<void> {
    const done = this.recoveryWork.then(work);
    this.recoveryWork = done.catch(() => {});
    return done;
  }

  private async writeRecovery() {
    // Back to the saved state, e.g. everything undone: the copy would bring the changes back.
    if (!this.dirty) {
      if (this.copyWritten) await this.removeCopy();
      return;
    }
    const start = performance.now();
    const { file } = await encodeDocument(
      documentFromEditor(this.editor, this.extensions, this.mode),
    );
    await writeDataBytes(RECOVERY.file, file);
    const info: RecoveryInfo = { name: this.name, path: this.path, time: Date.now() };
    await writeDataFile(RECOVERY.info, JSON.stringify(info));
    this.recoveryWriteMs = performance.now() - start;
    this.copyWritten = true;
  }

  private removeRecovery(): Promise<void> {
    if (this.recoveryTimer !== null) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.copyPending = false;
    return this.inOrder(() => this.removeCopy());
  }

  private async removeCopy() {
    await removeDataFile(RECOVERY.file);
    await removeDataFile(RECOVERY.info);
    this.copyWritten = false;
  }
}
