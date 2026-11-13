// Groups of the tool column: tools sharing one button, which shows the one used last. Some
// tools are always grouped (the rectangle and the ellipse), others only when the column
// does not fit in the window's height (the line).

import type { Tool, ToolGroup } from "#lib/app/tools/tool.js";

/** A button of the tool column: one tool, or a group of them. */
export type ToolEntry =
  { kind: "tool"; tool: Tool } | { kind: "group"; group: ToolGroup; tools: Tool[] };

/**
 * The buttons for these tools, in order: a group where its first tool is. `short`: the
 * column does not fit, the tools grouped `whenShort` are grouped too. A group of a single
 * tool is that tool's own button.
 */
export function toolEntries(tools: readonly Tool[], short: boolean): ToolEntry[] {
  const grouped = (t: Tool) => (t.group && (short || !t.group.whenShort) ? t.group.group : null);
  const entries: ToolEntry[] = [];
  const groups = new Map<string, Extract<ToolEntry, { kind: "group" }>>();
  for (const tool of tools) {
    const group = grouped(tool);
    const entry = group && groups.get(group.id);
    if (entry) {
      entry.tools.push(tool);
    } else if (group) {
      const created = { kind: "group" as const, group, tools: [tool] };
      groups.set(group.id, created);
      entries.push(created);
    } else {
      entries.push({ kind: "tool", tool });
    }
  }
  return entries.map((e) =>
    e.kind === "group" && e.tools.length === 1 ? { kind: "tool", tool: e.tools[0] } : e,
  );
}

/** The tool a group's button shows: the active one, else the last used, else the first. */
export function shownTool(tools: readonly Tool[], active: string, lastUsed?: string): Tool {
  return tools.find((t) => t.id === active) ?? tools.find((t) => t.id === lastUsed) ?? tools[0];
}
