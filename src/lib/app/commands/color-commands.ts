// The color commands (the current colors, the recent ones) and the palette commands.

import { fromHex, sameColor } from "#lib/core/color/color.js";
import { addPaletteColor, removePaletteColor } from "#lib/core/color/palette-edits.js";
import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import type { AppHost } from "#lib/app/commands/app-commands.js";
import { m } from "#lib/paraglide/messages.js";

/** Registers the color and palette commands. Returns a function that unregisters them. */
export function registerColorCommands(
  registry: CommandRegistry<Editor>,
  host: AppHost,
): () => void {
  /** The shown palette, if it can be edited. */
  const editable = () => host.palettes?.editable ?? null;

  const unregister = [
    registry.register<{ color: string }>({
      id: "color.set",
      title: m.cmd_color_set(),
      needsParams: true,
      enabled: (_, { color }) => fromHex(color) !== null,
      run: (_, { color }) => (host.options.color = fromHex(color)!),
    }),
    registry.register({
      id: "color.swap",
      title: m.cmd_color_swap(),
      run: () => {
        const { color, secondary } = host.options;
        host.options.color = secondary;
        host.options.secondary = color;
      },
    }),
    registry.register({
      id: "color.clearRecent",
      title: m.cmd_color_clear_recent(),
      enabled: () => host.recentColors().length > 0,
      run: () => host.clearRecentColors(),
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
  ];
  return () => unregister.forEach((fn) => fn());
}
