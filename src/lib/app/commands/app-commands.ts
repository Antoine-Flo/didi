// Interface commands: modes, tools, brushes, colors, palettes, view, files. Most take no params,
// so they can be bound to shortcuts, listed in the command palette and later put in the
// quick wheel; those that need params are marked `needsParams`.

import { fromHex, sameColor } from "#lib/core/color/color.js";
import { addPaletteColor, removePaletteColor } from "#lib/core/color/palette-edits.js";
import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import type { PaletteLibrary } from "#lib/core/color/palette.js";
import { setOfBrush } from "#lib/mypaint/brush-sets.js";
import { bundledBrush, findBundledBrush } from "#lib/mypaint/brushes.js";
import type { ModeRegistry } from "#lib/app/modes/mode.js";
import type { ToolOptions, ToolRegistry } from "#lib/app/tools/tool.js";
import type { Hand } from "#lib/app/shell/layout-prefs.svelte.js";
import { movable } from "#lib/core/editor/editor-commands.js";
import { errorMessage } from "#lib/app/error-message.js";
import { copy, toPaste } from "./clipboard";
import { m } from "#lib/paraglide/messages.js";

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
  /** What is shown, for the switches of the Show menu. */
  shown(what: "panels" | "interface" | "pixelGrid" | "tileGrid"): boolean;
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
  notify(message: string): void;
  /** Closes the app (offering to save first). Null where it cannot: no such command. */
  readonly quit: (() => void) | null;
}

const ROTATION_STEP = Math.PI / 12;

const selectionTitle = { rectangle: m.tool_rectangle_selection, lasso: m.tool_lasso_selection };

/** Registers the interface commands. Returns a function that unregisters them. */
export function registerAppCommands(registry: CommandRegistry<Editor>, host: AppHost): () => void {
  const view = (title: string, id: string, run: (view: ViewControls) => void) =>
    registry.register({
      id,
      title,
      enabled: () => host.view !== null,
      run: () => run(host.view!),
    });

  const current = () => host.tools.get(host.tool);
  /** The shown palette, if it can be edited. */
  const editable = () => host.palettes?.editable ?? null;
  const resize = (direction: 1 | -1) => {
    const settings = host.options.tools[host.tool];
    if (settings) {
      current().resize?.(settings, direction);
    }
  };

  /** Tells the user a clipboard operation failed. */
  const failed = (what: (params: { error: string }) => string) => (e: unknown) =>
    host.notify(what({ error: errorMessage(e) }));
  /** The mode's selection tool, whose handles move and scale floating content. */
  const selectionTool = () => {
    host.tool = host.modes.get(host.mode).selectTool;
  };

  // A command per mode and per tool registered so far.
  const unregister = [
    ...host.modes.list().map((mode) =>
      registry.register({
        id: `mode.${mode.id}`,
        title: m.cmd_mode({ title: mode.title }),
        run: () => (host.mode = mode.id),
      }),
    ),
    ...host.tools.list().map((tool) =>
      registry.register({
        id: `tool.${tool.id}`,
        title: m.cmd_tool({ title: tool.title }),
        shortTitle: tool.title,
        run: () => (host.tool = tool.id),
      }),
    ),
    ...(["rectangle", "lasso"] as const).map((shape) =>
      registry.register({
        id: `selection.${shape}`,
        title: m.cmd_tool({ title: selectionTitle[shape]() }),
        shortTitle: selectionTitle[shape](),
        run() {
          const tool = host.modes.get(host.mode).selectTool;
          host.tool = tool;
          host.options.tools[tool].shape = shape;
        },
      }),
    ),
    registry.register<{ id: string }>({
      id: "brush.select",
      title: m.cmd_brush_select(),
      needsParams: true,
      enabled: (_, { id }) => findBundledBrush(id) !== undefined && setOfBrush(id) !== undefined,
      run(_, { id }) {
        // Selects the tool of the brush's set (a pencil, the pencil tool). Each brush starts
        // at the size it was designed for.
        const brush = bundledBrush(id);
        host.tool = setOfBrush(id)!.id;
        const settings = host.options.tools[host.tool];
        settings.preset = id;
        settings.size = brush.nativeSize;
      },
    }),
    registry.register({
      id: "brush.grow",
      title: m.cmd_brush_grow(),
      enabled: () => current().resize !== undefined,
      run: () => resize(1),
    }),
    registry.register({
      id: "brush.shrink",
      title: m.cmd_brush_shrink(),
      enabled: () => current().resize !== undefined,
      run: () => resize(-1),
    }),

    view(m.cmd_view_fit(), "view.fit", (v) => v.fitView()),
    view(m.cmd_view_actual_size(), "view.actualSize", (v) => v.zoomTo(1)),
    view(m.cmd_view_zoom_in(), "view.zoomIn", (v) => v.zoomStep(1)),
    view(m.cmd_view_zoom_out(), "view.zoomOut", (v) => v.zoomStep(-1)),
    view(m.cmd_view_rotate_left(), "view.rotateLeft", (v) => v.rotateBy(-ROTATION_STEP)),
    view(m.cmd_view_rotate_right(), "view.rotateRight", (v) => v.rotateBy(ROTATION_STEP)),
    view(m.cmd_view_reset_rotation(), "view.resetRotation", (v) => v.resetRotation()),
    view(m.cmd_view_mirror(), "view.mirror", (v) => v.mirrorView()),

    registry.register<{ color: string }>({
      id: "color.set",
      title: m.cmd_color_set(),
      needsParams: true,
      enabled: (_, { color }) => fromHex(color) !== null,
      run: (_, { color }) => (host.options.color = fromHex(color)!),
    }),

    registry.register({
      id: "palette.addColor",
      title: m.cmd_palette_add_color(),
      enabled: () => {
        const color = host.options.color;
        return color !== null && editable()?.colors.some((c) => sameColor(c, color)) === false;
      },
      run: (editor) => editor.history.push(addPaletteColor(host.palettes!, host.options.color!)),
    }),
    registry.register<{ index: number }>({
      id: "palette.removeColor",
      title: m.cmd_palette_remove_color(),
      needsParams: true,
      enabled: (_, { index }) =>
        Number.isInteger(index) && index >= 0 && index < (editable()?.colors.length ?? 0),
      run: (editor, { index }) => editor.history.push(removePaletteColor(host.palettes!, index)),
    }),
    registry.register({
      id: "palette.toggleLock",
      title: m.cmd_palette_toggle_lock(),
      enabled: () => host.palettes !== null,
      run: () => (host.palettes!.locked = !host.palettes!.locked),
    }),
    registry.register<{ index: number }>({
      id: "palette.select",
      title: m.cmd_palette_select(),
      needsParams: true,
      enabled: (_, { index }) =>
        Number.isInteger(index) && index >= 0 && index < (host.palettes?.palettes.length ?? 0),
      run: (_, { index }) => host.palettes!.select(index),
    }),
    registry.register({
      id: "palette.new",
      title: m.cmd_palette_new(),
      enabled: () => host.palettes !== null,
      run: () => host.palettes!.add({ name: m.app_palette_default_name(), colors: [] }),
    }),
    registry.register<{ name: string }>({
      id: "palette.duplicate",
      title: m.cmd_palette_duplicate(),
      needsParams: true,
      enabled: (_, { name }) =>
        host.palettes?.active != null && typeof name === "string" && name.trim() !== "",
      run(_, { name }) {
        // A copy is made to be edited: unlocked.
        const palettes = host.palettes!;
        palettes.add({ name: name.trim(), colors: [...palettes.active!.colors] });
        palettes.locked = false;
      },
    }),
    registry.register({
      id: "palette.import",
      title: m.cmd_palette_import(),
      enabled: () => host.palettes !== null,
      run: () => host.importPalette(),
    }),
    registry.register<{ name: string }>({
      id: "palette.rename",
      title: m.cmd_palette_rename(),
      needsParams: true,
      enabled: (_, { name }) =>
        editable() != null && typeof name === "string" && name.trim() !== "",
      run: (_, { name }) => host.palettes!.rename(host.palettes!.activeIndex, name),
    }),
    registry.register({
      id: "palette.delete",
      title: m.cmd_palette_delete(),
      enabled: () => editable() != null,
      async run() {
        const palettes = host.palettes!;
        const palette = palettes.active!;
        const confirmed = await host.confirm({
          title: m.app_palette_delete_title({ name: palette.name }),
          text: m.app_palette_delete_text(),
          action: m.common_delete(),
        });
        const index = palettes.indexOf(palette);
        if (confirmed && index >= 0) {
          palettes.remove(index);
        }
      },
    }),

    // Edit: the clipboard, and transforming the selected pixels (with the selection's tool).
    registry.register({
      id: "edit.copy",
      title: m.cmd_edit_copy(),
      enabled: (editor) => editor.selection.floating !== null || editor.activeLayer !== null,
      run: (editor) => void copy(editor).catch(failed(m.error_copy_failed)),
    }),
    registry.register({
      id: "edit.cut",
      title: m.cmd_edit_cut(),
      enabled: (editor) => editor.editableLayer(true) !== null,
      run(editor) {
        const done = copy(editor);
        editor.clear(m.cmd_edit_cut());
        void done.catch(failed(m.error_copy_failed));
      },
    }),
    registry.register({
      id: "edit.paste",
      title: m.cmd_edit_paste(),
      enabled: (editor) => editor.activeLayer !== null && !editor.activeLayer.locked,
      run: (editor) =>
        void toPaste(editor)
          .then((paste) => {
            if (!paste) {
              return host.notify(m.app_nothing_to_paste());
            }
            if (editor.paste(paste.image, paste.at)) {
              selectionTool();
            }
          })
          .catch(failed(m.error_paste_failed)),
    }),
    registry.register({
      id: "edit.pasteAsLayer",
      title: m.cmd_edit_paste_as_layer(),
      run: (editor) =>
        void toPaste(editor)
          .then((paste) => {
            if (!paste) {
              return host.notify(m.app_nothing_to_paste());
            }
            editor.pasteAsLayer(paste.image, paste.at);
          })
          .catch(failed(m.error_paste_failed)),
    }),
    registry.register({
      id: "edit.transform",
      title: m.cmd_edit_transform(),
      enabled: movable,
      run(editor) {
        if (editor.transform()) {
          selectionTool();
        } else {
          host.notify(m.app_nothing_to_transform());
        }
      },
    }),

    registry.register({
      id: "image.canvasSize",
      title: m.cmd_image_canvas_size(),
      run: () => host.openSizeDialog("canvas"),
    }),
    registry.register({
      id: "image.imageSize",
      title: m.cmd_image_image_size(),
      run: () => host.openSizeDialog("image"),
    }),

    registry.register({ id: "file.new", title: m.cmd_file_new(), run: () => host.newDocument() }),
    registry.register({
      id: "file.exportPng",
      title: m.cmd_file_export_png(),
      run: () => host.exportPng(),
    }),
    registry.register({
      id: "file.importImage",
      title: m.cmd_file_import_image(),
      run: () => host.importImage(),
    }),
    registry.register({
      id: "app.commandPalette",
      title: m.cmd_app_command_palette(),
      run: () => host.openCommandPalette(),
    }),
    registry.register({
      id: "view.rightHanded",
      title: m.cmd_view_right_handed(),
      run: () => (host.hand = "right"),
    }),
    registry.register({
      id: "view.leftHanded",
      title: m.cmd_view_left_handed(),
      run: () => (host.hand = "left"),
    }),
    registry.register({
      id: "view.togglePanels",
      title: m.cmd_view_toggle_panels(),
      checked: () => host.shown("panels"),
      run: () => host.togglePanels(),
    }),
    registry.register({
      id: "view.pixelGrid",
      title: m.cmd_view_pixel_grid(),
      checked: () => host.shown("pixelGrid"),
      run: () => host.togglePixelGrid(),
    }),
    registry.register({
      id: "view.tileGrid",
      title: m.cmd_view_tile_grid(),
      checked: () => host.shown("tileGrid"),
      run: () => host.toggleTileGrid(),
    }),
    registry.register({
      id: "view.gridSettings",
      title: m.cmd_view_grid_settings(),
      run: () => host.openGridSettings(),
    }),
    registry.register({
      id: "view.hideInterface",
      title: m.cmd_view_hide_interface(),
      checked: () => host.shown("interface"),
      run: () => host.toggleInterface(),
    }),
    registry.register({
      id: "view.fullScreen",
      title: m.cmd_view_full_screen(),
      run: () => host.toggleFullScreen(),
    }),
    registry.register({
      id: "app.shortcuts",
      title: m.cmd_app_shortcuts(),
      run: () => host.openShortcuts(),
    }),
    registry.register({
      id: "app.preferences",
      title: m.cmd_app_preferences(),
      run: () => host.openPreferences(),
    }),
    registry.register({ id: "app.about", title: m.cmd_app_about(), run: () => host.openAbout() }),
  ];
  if (host.canUseFiles) {
    unregister.push(
      registry.register<{ path?: string } | undefined>({
        id: "file.open",
        title: m.cmd_file_open(),
        run: (_, params) => host.openDocument(params?.path),
      }),
      registry.register({
        id: "file.save",
        title: m.cmd_file_save(),
        run: () => host.saveDocument(),
      }),
      registry.register({
        id: "file.saveAs",
        title: m.cmd_file_save_as(),
        run: () => host.saveDocumentAs(),
      }),
    );
  }
  const { quit } = host;
  if (quit) {
    unregister.push(registry.register({ id: "app.quit", title: m.cmd_app_quit(), run: quit }));
  }
  return () => unregister.forEach((fn) => fn());
}
