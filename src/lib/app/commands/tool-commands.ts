// The commands choosing a tool or a selection shape, and resizing the brush.

import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { selectTool } from "#lib/app/tools/select-tool.js";
import type { ToolOptions, ToolRegistry } from "#lib/app/tools/tool.js";
import { m } from "#lib/paraglide/messages.js";

/** What the tool commands act on. */
export interface ToolHost {
  /** Id of the active tool. */
  tool: string;
  readonly tools: ToolRegistry;
  readonly options: ToolOptions;
}

const selectionTitle = { rectangle: m.tool_rectangle_selection, lasso: m.tool_lasso_selection };

/** Registers the tool, selection and brush size commands. */
export function registerToolCommands(registry: CommandRegistry<Editor>, host: ToolHost) {
  const current = () => host.tools.get(host.tool);
  const resize = (direction: 1 | -1) => {
    const settings = host.options.tools[host.tool];
    if (settings) {
      current().resize?.(settings, direction);
    }
  };

  // A command per tool registered so far.
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
        host.tool = selectTool.id;
        host.options.tools[selectTool.id].shape = shape;
      },
    }),
  );
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
