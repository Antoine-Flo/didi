// The recovery copy: a few seconds after a change, a copy of the document is written to the app
// data folder (never to the user's file). It is removed when the document is saved or closed
// normally. At start, a copy left by a crash is moved aside and offered in the start screen
// until the user opens or discards it.
//
// In a browser, there are no files: that copy is the document's only save. It stays when the
// tab closes, and comes back by itself at start.

import type { DocumentData } from "#lib/core/file/didi-file.js";
import {
  readDataBytes,
  readDataFile,
  removeDataFile,
  writeDataBytes,
  writeDataFile,
} from "#lib/platform/storage.js";
import { decodeDocument, encodeDocument } from "./files";
import { m } from "#lib/paraglide/messages.js";

export interface RecoveryInfo {
  name: string;
  /** The file the document came from, if it had one. */
  path: string | null;
  /** When the copy was written, in ms since 1970. */
  time: number;
}

const DELAY_MS = 3000;
/** Longer for a document that is long to copy: at most a tenth of the time goes to that. */
const DELAY_PER_WRITE = 10;
/** This session's copy, and the one left by a previous session that did not close. */
const CURRENT = { file: "recovery.didi", info: "recovery.json" };
const PREVIOUS = { file: "recovery-previous.didi", info: "recovery-previous.json" };

type CopyFiles = typeof CURRENT;

/** A copy's files as they are stored, if both are there. */
async function read(files: CopyFiles): Promise<{ text: string; bytes: Uint8Array } | null> {
  const text = await readDataFile(files.info);
  const bytes = text !== null ? await readDataBytes(files.file) : null;
  return text !== null && bytes ? { text, bytes } : null;
}

async function remove(files: CopyFiles) {
  await removeDataFile(files.file);
  await removeDataFile(files.info);
}

/**
 * At start, in the desktop app: moves this session's copy, left by a session that did not
 * close, aside. Returns what the copy set aside is, if there is one (also an older one).
 */
export async function setAsideLeftCopy(): Promise<RecoveryInfo | null> {
  const left = await read(CURRENT);
  if (left) {
    await writeDataBytes(PREVIOUS.file, left.bytes);
    await writeDataFile(PREVIOUS.info, left.text);
  }
  const previous = await readDataFile(PREVIOUS.info);
  return previous !== null ? (JSON.parse(previous) as RecoveryInfo) : null;
}

/** The document set aside by `setAsideLeftCopy`. Throws if it is missing. */
export async function readSetAsideCopy(): Promise<DocumentData> {
  const bytes = await readDataBytes(PREVIOUS.file);
  if (!bytes) {
    throw new Error(m.files_recovery_copy_missing());
  }
  return (await decodeDocument(bytes)).doc;
}

export const discardSetAsideCopy = () => remove(PREVIOUS);

/** In a browser: the copy left when the tab closed, if there is one. */
export async function readLeftCopy(): Promise<{ info: RecoveryInfo; doc: DocumentData } | null> {
  const left = await read(CURRENT);
  if (!left) {
    return null;
  }
  const { doc } = await decodeDocument(left.bytes);
  return { info: JSON.parse(left.text) as RecoveryInfo, doc };
}

export interface RecoveryHost {
  /** Whether the document has changes that no file has: only then is a copy needed. */
  needsCopy(): boolean;
  /** The document, and what to say about it, as they are now. */
  snapshot(): { doc: DocumentData; info: RecoveryInfo };
  /** A copy could not be written. */
  onError(error: unknown): void;
}

/** This session's copy. */
export class RecoveryCopy {
  /** Changes are not in the copy yet. */
  pending = $state(false);

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The copy's last write or removal: they run one at a time, in order. */
  private work: Promise<unknown> = Promise.resolve();
  private writes = 0;
  private writeMs = 0;
  /** The copy exists, and may have to be removed. */
  private written = false;

  constructor(private readonly host: RecoveryHost) {}

  /** The copy left when a browser tab closed is this session's from now on. */
  adopt() {
    this.written = true;
  }

  /** Writes the copy a little later, after a change. */
  schedule() {
    if (this.timer !== null || (!this.host.needsCopy() && !this.written)) {
      return;
    }
    this.pending = true;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        const id = ++this.writes;
        this.writeNow()
          .then(() => {
            // Still pending if more changes came meanwhile. After a failure too.
            if (id === this.writes && this.timer === null) {
              this.pending = false;
            }
          })
          .catch((e) => this.host.onError(e));
      },
      Math.max(DELAY_MS, this.writeMs * DELAY_PER_WRITE),
    );
  }

  /** Writes the copy now, after any write or removal in progress. */
  writeNow(): Promise<void> {
    return this.inOrder(() => this.write());
  }

  /** Removes the copy, and forgets a write to come. */
  remove(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = null;
    this.pending = false;
    return this.inOrder(() => this.removeFiles());
  }

  /** After the copy's work in progress: an older write must not land after a newer one. */
  private inOrder(work: () => Promise<void>): Promise<void> {
    const done = this.work.then(work);
    this.work = done.catch(() => {});
    return done;
  }

  private async write() {
    // Back to the saved state, e.g. everything undone: the copy would bring the changes back.
    if (!this.host.needsCopy()) {
      if (this.written) {
        await this.removeFiles();
      }
      return;
    }
    const start = performance.now();
    const { doc, info } = this.host.snapshot();
    const { file } = await encodeDocument(doc);
    await writeDataBytes(CURRENT.file, file);
    await writeDataFile(CURRENT.info, JSON.stringify(info));
    this.writeMs = performance.now() - start;
    this.written = true;
  }

  private async removeFiles() {
    await remove(CURRENT);
    this.written = false;
  }
}
