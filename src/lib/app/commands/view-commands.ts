// The view commands: zoom, rotation and mirror of the canvas, the drawing hand, and what is
// shown (panels, grids, preview, interface, full screen).

import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import type { Hand } from "#lib/app/prefs/layout-prefs.js";
import type { DialogOpener } from "#lib/app/commands/app-commands.js";
import { m } from "#lib/paraglide/messages.js";

/** The canvas's view (see ViewController): until it is shown, these do nothing. */
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

/** What the view commands act on. */
export interface ViewHost extends DialogOpener {
  readonly view: ViewControls;
  /** The user's drawing hand: the panels are on the other side (left for right-handed users). */
  hand: Hand;
  /** What is shown, for the switches of View → Show. */
  shown(what: "panels" | "interface" | "pixelGrid" | "tileGrid" | "preview"): boolean;
  /** Shows or hides the panels' column. */
  togglePanels(): void;
  /** Shows or hides the pixels' grid. */
  togglePixelGrid(): void;
  /** Shows or hides the document's tiles' grid. */
  toggleTileGrid(): void;
  /** Opens or closes the preview of the whole drawing. */
  togglePreview(): void;
  /** Hides every panel and bar, or shows them again: only the canvas. */
  toggleInterface(): void;
  /** Full screen, or back. */
  toggleFullScreen(): void;
}

const ROTATION_STEP = Math.PI / 12;

/** Registers the view commands. */
export function registerViewCommands(registry: CommandRegistry<Editor>, host: ViewHost) {
  const view = (title: string, id: string, run: (view: ViewControls) => void) =>
    registry.register({ id, title, run: () => run(host.view) });

  view(m.cmd_view_fit(), "view.fit", (v) => v.fitView());
  view(m.cmd_view_actual_size(), "view.actualSize", (v) => v.zoomTo(1));
  view(m.cmd_view_zoom_in(), "view.zoomIn", (v) => v.zoomStep(1));
  view(m.cmd_view_zoom_out(), "view.zoomOut", (v) => v.zoomStep(-1));
  view(m.cmd_view_rotate_left(), "view.rotateLeft", (v) => v.rotateBy(-ROTATION_STEP));
  view(m.cmd_view_rotate_right(), "view.rotateRight", (v) => v.rotateBy(ROTATION_STEP));
  view(m.cmd_view_reset_rotation(), "view.resetRotation", (v) => v.resetRotation());
  view(m.cmd_view_mirror(), "view.mirror", (v) => v.mirrorView());

  registry.register({
    id: "view.rightHanded",
    title: m.cmd_view_right_handed(),
    run: () => (host.hand = "right"),
  });
  registry.register({
    id: "view.leftHanded",
    title: m.cmd_view_left_handed(),
    run: () => (host.hand = "left"),
  });
  registry.register({
    id: "view.togglePanels",
    title: m.cmd_view_toggle_panels(),
    checked: () => host.shown("panels"),
    run: () => host.togglePanels(),
  });
  registry.register({
    id: "view.pixelGrid",
    title: m.cmd_view_pixel_grid(),
    checked: () => host.shown("pixelGrid"),
    run: () => host.togglePixelGrid(),
  });
  registry.register({
    id: "view.tileGrid",
    title: m.cmd_view_tile_grid(),
    checked: () => host.shown("tileGrid"),
    run: () => host.toggleTileGrid(),
  });
  registry.register({
    id: "view.preview",
    title: m.cmd_view_preview(),
    checked: () => host.shown("preview"),
    run: () => host.togglePreview(),
  });
  registry.register({
    id: "view.gridSettings",
    title: m.cmd_view_grid_settings(),
    run: () => host.openDialog("grid"),
  });
  registry.register({
    id: "view.hideInterface",
    title: m.cmd_view_hide_interface(),
    checked: () => host.shown("interface"),
    run: () => host.toggleInterface(),
  });
  registry.register({
    id: "view.fullScreen",
    title: m.cmd_view_full_screen(),
    run: () => host.toggleFullScreen(),
  });
}
