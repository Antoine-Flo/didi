// Interface commands: tools, brushes, colors, palettes, view, files. Most take no params,
// so they can be bound to shortcuts, listed in the command palette and later put in the
// quick wheel; those that need params are marked `needsParams`.

import { fromHex } from "#lib/core/color.js";
import type { CommandRegistry } from "#lib/core/commands.js";
import type { Editor } from "#lib/core/editor.js";
import type { PaletteLibrary } from "#lib/core/palette.js";
import { bundledBrush, findBundledBrush } from "#lib/mypaint/brushes.js";
import { TOOLS, stepToolSize, type ToolId, type ToolOptions } from "#lib/app/canvas/tools.js";

/** The view controls of the canvas, once it is mounted. */
export interface ViewControls {
  fitView(): void;
  zoomBy(factor: number): void;
  zoomTo(zoom: number): void;
  rotateBy(angle: number): void;
  resetRotation(): void;
}

/** What the commands act on, provided by the editor interface. */
export interface AppHost {
  tool: ToolId;
  readonly options: ToolOptions;
  readonly view: ViewControls | null;
  /** The user's palettes, once loaded. */
  readonly palettes: PaletteLibrary | null;
  importImage(): void;
  /** Shows the start screen, to create a document or open a recent one. */
  newDocument(): void;
  openDocument(): void;
  saveDocument(): void;
  saveDocumentAs(): void;
  exportPng(): void;
  /** Asks for a .hex file and adds it as a new palette. */
  importPalette(): void;
  openCommandPalette(): void;
}

const ROTATION_STEP = Math.PI / 12;

/** Registers the interface commands. Returns a function that unregisters them. */
export function registerAppCommands(registry: CommandRegistry<Editor>, host: AppHost): () => void {
  const view = (title: string, id: string, run: (view: ViewControls) => void) =>
    registry.register({
      id,
      title,
      enabled: () => host.view !== null,
      run: () => run(host.view!),
    });

  const unregister = [
    ...TOOLS.map((tool) =>
      registry.register({
        id: `tool.${tool.id}`,
        title: `Tool: ${tool.title}`,
        run: () => (host.tool = tool.id),
      }),
    ),
    registry.register<{ id: string }>({
      id: "brush.select",
      title: "Select brush",
      needsParams: true,
      enabled: (_, { id }) => findBundledBrush(id) !== undefined,
      run(_, { id }) {
        // An eraser brush selects the eraser tool, any other brush the brush tool. Each brush
        // starts at the size it was designed for.
        const brush = bundledBrush(id);
        host.tool = brush.eraser ? "eraser" : "brush";
        const settings = brush.eraser ? host.options.eraser : host.options.brush;
        settings.preset = id;
        settings.size = brush.nativeSize;
      },
    }),
    registry.register({
      id: "brush.grow",
      title: "Increase brush size",
      enabled: () => host.tool !== "picker",
      run: () => void stepToolSize(host.options, host.tool, 1),
    }),
    registry.register({
      id: "brush.shrink",
      title: "Decrease brush size",
      enabled: () => host.tool !== "picker",
      run: () => void stepToolSize(host.options, host.tool, -1),
    }),

    view("Fit to window", "view.fit", (v) => v.fitView()),
    view("Actual size (100%)", "view.actualSize", (v) => v.zoomTo(1)),
    view("Zoom in", "view.zoomIn", (v) => v.zoomBy(1.25)),
    view("Zoom out", "view.zoomOut", (v) => v.zoomBy(0.8)),
    view("Rotate left", "view.rotateLeft", (v) => v.rotateBy(-ROTATION_STEP)),
    view("Rotate right", "view.rotateRight", (v) => v.rotateBy(ROTATION_STEP)),
    view("Reset rotation", "view.resetRotation", (v) => v.resetRotation()),

    registry.register<{ color: string }>({
      id: "color.set",
      title: "Set color",
      needsParams: true,
      enabled: (_, { color }) => fromHex(color) !== null,
      run: (_, { color }) => (host.options.color = fromHex(color)!),
    }),

    registry.register({
      id: "palette.addColor",
      title: "Add color to palette",
      enabled: () => host.palettes?.active != null,
      run: () => void host.palettes!.addColor(host.options.color),
    }),
    registry.register<{ index: number }>({
      id: "palette.removeColor",
      title: "Remove color from palette",
      needsParams: true,
      enabled: (_, { index }) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < (host.palettes?.active?.colors.length ?? 0),
      run: (_, { index }) => host.palettes!.removeColor(index),
    }),
    registry.register<{ index: number }>({
      id: "palette.select",
      title: "Show palette",
      needsParams: true,
      enabled: (_, { index }) =>
        Number.isInteger(index) && index >= 0 && index < (host.palettes?.palettes.length ?? 0),
      run: (_, { index }) => host.palettes!.select(index),
    }),
    registry.register({
      id: "palette.new",
      title: "New palette",
      enabled: () => host.palettes !== null,
      run: () => host.palettes!.add({ name: "Palette", colors: [] }),
    }),
    registry.register({
      id: "palette.import",
      title: "Import palette (.hex)…",
      enabled: () => host.palettes !== null,
      run: () => host.importPalette(),
    }),
    registry.register<{ name: string }>({
      id: "palette.rename",
      title: "Rename palette",
      needsParams: true,
      enabled: (_, { name }) =>
        host.palettes?.active != null && typeof name === "string" && name.trim() !== "",
      run: (_, { name }) => host.palettes!.rename(host.palettes!.activeIndex, name),
    }),
    registry.register({
      id: "palette.delete",
      title: "Delete palette",
      enabled: () => host.palettes?.active != null,
      run: () => host.palettes!.remove(),
    }),

    registry.register({ id: "file.new", title: "New document…", run: () => host.newDocument() }),
    registry.register({ id: "file.open", title: "Open…", run: () => host.openDocument() }),
    registry.register({ id: "file.save", title: "Save", run: () => host.saveDocument() }),
    registry.register({ id: "file.saveAs", title: "Save as…", run: () => host.saveDocumentAs() }),
    registry.register({ id: "file.exportPng", title: "Export PNG…", run: () => host.exportPng() }),
    registry.register({
      id: "file.importImage",
      title: "Import image…",
      run: () => host.importImage(),
    }),
    registry.register({
      id: "app.commandPalette",
      title: "Command palette",
      run: () => host.openCommandPalette(),
    }),
  ];
  return () => unregister.forEach((fn) => fn());
}
