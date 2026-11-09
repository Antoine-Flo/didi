<script lang="ts">
  // The tools of the mode, in a thin column beside the panels, or against the window's other
  // edge: its grip moves it (see EdgeColumn and edge-columns.ts).
  //
  // Some tools share a button (see tool-groups.ts); more of them in the compact layout, or
  // when the column does not fit in the height it has.

  import ToolButton from "#lib/app/panels/ToolButton.svelte";
  import EdgeColumn from "#lib/app/widgets/EdgeColumn.svelte";
  import type { Tool, ToolSettings } from "#lib/app/tools/tool.js";
  import { shownTool, toolEntries, type ToolEntry } from "#lib/app/tools/tool-groups.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    tools,
    active,
    settings,
    side,
    room,
    compact = false,
    top,
    element = $bindable(),
    height = $bindable(0),
    ondrop,
    ondragging,
    onreset,
    tip,
    run,
  }: {
    tools: Tool[];
    /** Id of the active tool. */
    active: string;
    /** Every tool's settings, by id. */
    settings: Record<string, ToolSettings>;
    /** Where the tools' popups open: towards the canvas. */
    side: "left" | "right";
    /** The height the column has, in pixels: its edge's, less the other columns on it. */
    room: number;
    /** The compact layout: the tools are grouped as when short of height. */
    compact?: boolean;
    /** In pixels from the top of its edge. */
    top: number;
    element?: HTMLElement;
    height?: number;
    ondrop: (box: DOMRect) => void;
    ondragging?: (dragging: boolean) => void;
    onreset: () => void;
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
  } = $props();

  // Short of height: more tools grouped. The column's height ungrouped is kept, to ungroup
  // once there is room for it again; it is measured again when the tools change.
  let short = $state(false);
  let fullHeight = 0;
  $effect(() => {
    void tools;
    short = false;
  });
  $effect(() => {
    if (height === 0 || room === 0) {
      return;
    }
    if (!short && height > room) {
      fullHeight = height;
      short = true;
    } else if (short && room >= fullHeight) {
      short = false;
    }
  });
  const entries = $derived(toolEntries(tools, compact || short));
  const sectionOf = (entry: ToolEntry) =>
    (entry.kind === "tool" ? entry.tool : entry.tools[0]).section ?? "draw";

  /** The tool each group's button shows when none of its tools is active: the last used. */
  const lastUsed = $state<Record<string, string>>({});
  $effect(() => {
    const group = tools.find((t) => t.id === active)?.group?.group;
    if (group) {
      lastUsed[group.id] = active;
    }
  });
</script>

<EdgeColumn
  {top}
  gripTitle={m.tool_column_grip_tip()}
  gripLabel={m.tool_column_grip()}
  bind:element
  bind:height
  {ondrop}
  {ondragging}
  {onreset}
>
  {#each entries as entry, i (entry.kind === "tool" ? entry.tool.id : entry.group.id)}
    {#if i > 0 && sectionOf(entries[i - 1]) !== sectionOf(entry)}
      <hr />
    {/if}
    {#if entry.kind === "tool"}
      {@const t = entry.tool}
      <ToolButton
        tool={t}
        active={active === t.id}
        settings={settings[t.id]}
        {side}
        {compact}
        {tip}
        {run}
      />
    {:else}
      {@const t = shownTool(entry.tools, active, lastUsed[entry.group.id])}
      <ToolButton
        tool={t}
        group={{ title: entry.group.title, tools: entry.tools, settings }}
        active={active === t.id}
        settings={settings[t.id]}
        {side}
        {compact}
        {tip}
        {run}
      />
    {/if}
  {/each}
</EdgeColumn>
