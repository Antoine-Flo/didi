// Interface commands: modes, tools, brushes, colors, palettes, view, files. Most take no params,
// so they can be bound to shortcuts, listed in the command palette and later put in the
// quick wheel; those that need params are marked `needsParams`.

import type { MessageLevel } from "#lib/app/state/messages.svelte.js";
import type { DrawingView } from "#lib/render/drawing-view.js";
import type { RGB } from "#lib/core/color/color.js";
import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import type { PaletteLibrary } from "#lib/core/color/palette.js";
import type { ModeRegistry } from "#lib/app/modes/mode.js";
import type { ToolOptions, ToolRegistry } from "#lib/app/tools/tool.js";
import type { Hand } from "#lib/app/prefs/layout-prefs.js";
import { registerColorCommands } from "#lib/app/commands/color-commands.js";
import { registerEditCommands } from "#lib/app/commands/edit-commands.js";
import { registerFileCommands } from "#lib/app/commands/file-commands.js";
import { registerToolCommands } from "#lib/app/commands/tool-commands.js";
import { registerViewCommands } from "#lib/app/commands/view-commands.js";

/** The view controls of the canvas, once it is mounted. */
export interface ViewControls {
  fitView(): void;
  /** One step in (1) or out (-1). */
  zoomStep(direction: 1 | -1): void;
  zoomTo(zoom: number): void;
  rotateBy(angle: number): void;
  resetRotation(): void;
  /** Shows the drawing reversed, left to right, or back. */
  mirrorView(): void;
}

/** What the editor drives in the canvas's view (see CanvasView, bound to it). */
export interface CanvasControls extends ViewControls {
  /** Shows the document's new size while the size dialog is open; null when it closes. */
  previewResize(preview: Parameters<DrawingView["setResizePreview"]>[0]): void;
}

/** What the commands act on, provided by the editor interface. */
export interface AppHost {
  /** Id of the document's mode. */
  mode: string;
  readonly modes: ModeRegistry;
  /** Id of the active tool. */
  tool: string;
  readonly tools: ToolRegistry;
  readonly options: ToolOptions;
  readonly view: ViewControls | null;
  /** The user's drawing hand: the panels are on the other side (left for right-handed users). */
  hand: Hand;
  /** Shows or hides the panels' column. */
  togglePanels(): void;
  /** What is shown, for the switches of View → Show. */
  shown(what: "panels" | "interface" | "pixelGrid" | "tileGrid" | "preview"): boolean;
  /** Opens or closes the preview of the whole drawing. */
  togglePreview(): void;
  /** Opens the grids' settings. */
  openGridSettings(): void;
  /** Shows or hides the pixels' grid. */
  togglePixelGrid(): void;
  /** Shows or hides the document's tiles' grid. */
  toggleTileGrid(): void;
  /** Hides every panel and bar, or shows them again: only the canvas. */
  toggleInterface(): void;
  /** Full screen, or back. */
  toggleFullScreen(): void;
  openShortcuts(): void;
  openAbout(): void;
  openPreferences(): void;
  /** The user's palettes, once loaded. */
  readonly palettes: PaletteLibrary | null;
  /** The colors drawn with lately, in the document's mode, the latest first. */
  recentColors(): readonly RGB[];
  /** Empties the recent colors of the document's mode. */
  clearRecentColors(): void;
  importImage(): void;
  /** Shows the start screen, to create a document or open a recent one. */
  newDocument(): void;
  /** Opens a document: asks which one, unless `path` is given (e.g. a recent file). */
  openDocument(path?: string): void;
  saveDocument(): void;
  saveDocumentAs(): void;
  exportPng(): void;
  /** Asks for a .hex file and adds it as a new palette. */
  importPalette(): void;
  /** Asks the user to confirm an action that cannot be undone. Resolves to their answer. */
  confirm(question: { title: string; text: string; action: string }): Promise<boolean>;
  openCommandPalette(): void;
  /** Whether documents can be opened and saved as files. Without it, no such commands. */
  readonly canUseFiles: boolean;
  /** Opens the dialog changing the canvas size, or the image size. */
  openSizeDialog(kind: "canvas" | "image"): void;
  /** Shows a short message to the user, e.g. why a command did nothing. */
  notify(message: string, level?: MessageLevel): void;
  /** Closes the app (offering to save first). Null where it cannot: no such command. */
  readonly quit: (() => void) | null;
}

/** Registers the interface commands. Returns a function that unregisters them. */
export function registerAppCommands(registry: CommandRegistry<Editor>, host: AppHost): () => void {
  const unregister = [
    registerToolCommands(registry, host),
    registerViewCommands(registry, host),
    registerColorCommands(registry, host),
    registerEditCommands(registry, host),
    registerFileCommands(registry, host),
  ];
  return () => unregister.forEach((fn) => fn());
}
