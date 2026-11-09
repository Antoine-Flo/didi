// The view commands: zoom, rotation and mirror of the canvas, the drawing hand, and what is
// shown (panels, grids, preview, interface, full screen).

import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import type { AppHost, ViewControls } from "#lib/app/commands/app-commands.js";
import { m } from "#lib/paraglide/messages.js";

const ROTATION_STEP = Math.PI / 12;

/** Registers the view commands. Returns a function that unregisters them. */
export function registerViewCommands(registry: CommandRegistry<Editor>, host: AppHost): () => void {
  const view = (title: string, id: string, run: (view: ViewControls) => void) =>
    registry.register({
      id,
      title,
      enabled: () => host.view !== null,
      run: () => run(host.view!),
    });

  const unregister = [
    view(m.cmd_view_fit(), "view.fit", (v) => v.fitView()),
    view(m.cmd_view_actual_size(), "view.actualSize", (v) => v.zoomTo(1)),
    view(m.cmd_view_zoom_in(), "view.zoomIn", (v) => v.zoomStep(1)),
    view(m.cmd_view_zoom_out(), "view.zoomOut", (v) => v.zoomStep(-1)),
    view(m.cmd_view_rotate_left(), "view.rotateLeft", (v) => v.rotateBy(-ROTATION_STEP)),
    view(m.cmd_view_rotate_right(), "view.rotateRight", (v) => v.rotateBy(ROTATION_STEP)),
    view(m.cmd_view_reset_rotation(), "view.resetRotation", (v) => v.resetRotation()),
    view(m.cmd_view_mirror(), "view.mirror", (v) => v.mirrorView()),

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
      id: "view.preview",
      title: m.cmd_view_preview(),
      checked: () => host.shown("preview"),
      run: () => host.togglePreview(),
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
  ];
  return () => unregister.forEach((fn) => fn());
}
