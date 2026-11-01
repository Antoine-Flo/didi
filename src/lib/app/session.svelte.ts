// The open document: its editor, file and unsaved changes, and the file actions (new,
// open, save, save as, export), recent files and crash recovery.
//
// Recovery: two minutes after a change, a copy of the document is written to the app data
// folder (never to the user's file). It is removed when the document is saved or closed
// normally. At start, a copy left by a crash is moved aside and offered in the start
// screen until the user opens or discards it.

import { documentFromEditor, editorFromDocument } from "$lib/core/didi-file";
import type { Editor } from "$lib/core/editor";
import {
  canUseFiles,
  chooseFileToOpen,
  chooseFileToSave,
  readDataBytes,
  readDataFile,
  removeDataFile,
  writeDataBytes,
  writeDataFile,
} from "$lib/platform/storage";
import {
  decodeDocument,
  documentName,
  encodeDocument,
  exportPng,
  fileName,
  openDocument,
  pngDataUrl,
  saveDocument,
} from "./files";
import { newEditor, type Background } from "./new-drawing";
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
const RECOVERY_DELAY_MS = 2 * 60 * 1000;
/** This session's copy, and the one left by a previous session that did not close. */
const RECOVERY = { file: "recovery.didi", info: "recovery.json" };
const PREVIOUS = { file: "recovery-previous.didi", info: "recovery-previous.json" };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Session {
  editor: Editor = $state.raw(newEditor());
  /** The document's file, null until it is saved. */
  path = $state<string | null>(null);
  name = $state("Untitled");
  /** A file action in progress ("Saving…"), shown to the user. */
  busy = $state<string | null>(null);
  recent = $state.raw<RecentFile[]>([]);
  /** A copy left by a session that did not close normally. */
  recovery = $state.raw<RecoveryInfo | null>(null);

  /** History marker of the last save: see History.marker. */
  private savedMarker = $state.raw<unknown>(null);
  /** Bumped on every history change, to recompute `dirty`. */
  private revision = $state(0);
  private extensions: Record<string, unknown> = {};
  private unsubscribe: () => void = () => {};
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  /** `editor`: the document to start with, a new one by default. */
  constructor(
    private readonly host: SessionHost,
    editor: Editor = newEditor(),
  ) {
    this.setEditor(editor);
    this.savedMarker = editor.history.marker;
  }

  /** Whether the document has changes that are not saved. */
  get dirty(): boolean {
    void this.revision;
    return this.editor.history.marker !== this.savedMarker;
  }

  /** Loads the recent files, and sets aside a copy left by a crash. Call once at start. */
  async start() {
    try {
      this.recent = await loadRecent();
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
  }

  /** Asks to save unsaved changes. Returns false if the user cancels. */
  async confirmDiscard(): Promise<boolean> {
    if (!this.dirty) return true;
    const choice = await this.host.askUnsaved(this.name);
    if (choice === "save") return this.save();
    return choice === "discard";
  }

  async newDocument(width: number, height: number, background: Background) {
    if (!(await this.confirmDiscard())) return;
    this.replace(newEditor(width, height, background), null, "Untitled");
  }

  /** Opens a .didi file: the given one, or one chosen by the user. */
  async open(path?: string) {
    if (!this.checkFiles() || !(await this.confirmDiscard())) return;
    path ??= (await chooseFileToOpen(DIDI_FILTER)) ?? undefined;
    if (!path) return;
    await this.run(`Opening ${fileName(path)}…`, `Cannot open ${fileName(path)}`, async () => {
      const { doc, thumbnail } = await openDocument(path);
      this.replace(editorFromDocument(doc), path, documentName(path));
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
    if (!this.checkFiles()) return;
    let path = await chooseFileToSave(`${this.name}.png`, PNG_FILTER);
    if (!path) return;
    if (!/\.png$/i.test(path)) path += ".png";
    const doc = documentFromEditor(this.editor);
    await this.run(`Exporting ${fileName(path)}…`, `Cannot export ${fileName(path)}`, () =>
      exportPng(path, doc),
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
      this.replace(editorFromDocument(doc), info.path, info.name);
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
    const doc = documentFromEditor(this.editor, this.extensions);
    const marker = this.editor.history.marker;
    return this.run(`Saving ${fileName(path)}…`, `Cannot save ${fileName(path)}`, async () => {
      const thumbnail = await saveDocument(path, doc);
      this.path = path;
      this.name = documentName(path);
      this.savedMarker = marker;
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

  private replace(editor: Editor, path: string | null, name: string) {
    this.setEditor(editor);
    this.path = path;
    this.name = name;
    this.extensions = {};
    this.savedMarker = editor.history.marker;
    void this.removeRecovery();
  }

  private setEditor(editor: Editor) {
    this.unsubscribe();
    this.editor = editor;
    this.unsubscribe = editor.history.subscribe(() => {
      this.revision++;
      this.scheduleRecovery();
    });
  }

  private async addRecent(path: string, thumbnail: Uint8Array) {
    this.recent = withRecent(this.recent, {
      path,
      name: documentName(path),
      thumbnail: pngDataUrl(thumbnail),
      time: Date.now(),
    });
    await saveRecent(this.recent);
  }

  private scheduleRecovery() {
    if (this.recoveryTimer !== null || !this.dirty) return;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      this.writeRecovery().catch((e) =>
        this.host.notify(`Could not write the recovery copy: ${message(e)}`),
      );
    }, RECOVERY_DELAY_MS);
  }

  private async writeRecovery() {
    if (!this.dirty) return;
    const { file } = await encodeDocument(documentFromEditor(this.editor, this.extensions));
    await writeDataBytes(RECOVERY.file, file);
    const info: RecoveryInfo = { name: this.name, path: this.path, time: Date.now() };
    await writeDataFile(RECOVERY.info, JSON.stringify(info));
  }

  private async removeRecovery() {
    if (this.recoveryTimer !== null) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    await removeDataFile(RECOVERY.file);
    await removeDataFile(RECOVERY.info);
  }
}
