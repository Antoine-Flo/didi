// The commands choosing a mode, a tool, a selection shape or a brush, and resizing the brush.

import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { setOfBrush } from "#lib/mypaint/brush-sets.js";
import { bundledBrush, findBundledBrush } from "#lib/mypaint/brushes.js";
import type { ModeRegistry } from "#lib/app/modes/mode.js";
import type { ToolOptions, ToolRegistry } from "#lib/app/tools/tool.js";
import { m } from "#lib/paraglide/messages.js";

/** What the tool commands act on. */
export interface ToolHost {
  /** Id of the document's mode. */
  mode: string;
  readonly modes: ModeRegistry;
  /** Id of the active tool. */
  tool: string;
  readonly tools: ToolRegistry;
  readonly options: ToolOptions;
}

const selectionTitle = { rectangle: m.tool_rectangle_selection, lasso: m.tool_lasso_selection };

/** Registers the mode, tool, selection and brush commands. */
export function registerToolCommands(registry: CommandRegistry<Editor>, host: ToolHost) {
  const current = () => host.tools.get(host.tool);
  const resize = (direction: 1 | -1) => {
    const settings = host.options.tools[host.tool];
    if (settings) {
      current().resize?.(settings, direction);
    }
  };

  // A command per mode and per tool registered so far.
  host.modes.list().forEach((mode) =>
    registry.register({
      id: `mode.${mode.id}`,
      title: m.cmd_mode({ title: mode.title }),
      checked: () => host.mode === mode.id,
      run: () => (host.mode = mode.id),
    }),
  );
  host.tools.list().forEach((tool) =>
    registry.register({
      id: `tool.${tool.id}`,
      title: m.cmd_tool({ title: tool.title }),
      shortTitle: tool.title,
      run: () => (host.tool = tool.id),
    }),
  );
  (["rectangle", "lasso"] as const).forEach((shape) =>
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
  );
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
  });
  registry.register({
    id: "brush.grow",
    title: m.cmd_brush_grow(),
    enabled: () => current().resize !== undefined,
    run: () => resize(1),
  });
  registry.register({
    id: "brush.shrink",
    title: m.cmd_brush_shrink(),
    enabled: () => current().resize !== undefined,
    run: () => resize(-1),
  });
}
