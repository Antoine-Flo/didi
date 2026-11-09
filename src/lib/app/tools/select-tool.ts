// The selection (see $lib/core/selection), by rectangle or lasso, chosen in the popup under its
// button; once made, the two work the same. What the pen does depends on where it
// goes down. Outside: a new selection, or none with a simple click. On a bounds handle: moves
// an edge. On the cross: moves the center of rotation. Inside: moves the content. On the outer
// handles: scales, rotates or skews it. Content stays floating until it is applied, and every
// gesture is one undo step.
//
// There are two tools, as for the pencils and erasers: one keeps pixels exact, for pixel art, and
// the other one smooths transformed content, for painting.

import { Lasso, SquareDashed } from "@lucide/svelte";
import { scaled, zoneAt, zoneCursor } from "#lib/core/selection/handles.js";
import { boxDelta, centerOf, moved, rotated, skewed } from "#lib/core/selection/placement.js";
import { placementOf } from "#lib/core/selection/selection.js";
import {
  MoveEdge,
  MovePivot,
  TransformContent,
  type Place,
} from "#lib/app/tools/select-gesture.js";
import { NewLasso, NewRectangle } from "#lib/app/tools/select-new-area.js";
import { defineTool, type Tool, type ToolContext } from "#lib/app/tools/tool.js";
import { m } from "#lib/paraglide/messages.js";

const SNAP_ANGLE = Math.PI / 12;

/** The layer content can be taken from, or null after telling the user why not. */
function contentLayer(context: ToolContext): string | null {
  const { selection, activeLayer: layer } = context.editor;
  if (selection.floating) {
    return selection.floating.layerId;
  }
  if (!layer) {
    return context.refuse(m.tool_no_layer_to_move());
  }
  if (layer.locked) {
    return context.refuse(m.canvas_layer_locked({ name: layer.name }));
  }
  if (!layer.visible) {
    return context.refuse(m.canvas_layer_hidden({ name: layer.name }));
  }
  return layer.id;
}

type SelectSettings = {
  /** How a new selection is made. */
  shape: "rectangle" | "lasso";
};

function selectionTool(id: string, title: string, smooth: boolean): Tool {
  return defineTool<SelectSettings>({
    id,
    title,
    icon: SquareDashed,
    section: "pick",
    defaults: { shape: "rectangle" },
    menu: {
      key: "shape",
      iconFollowsChoice: true,
      items: [
        { value: "rectangle", label: m.tool_shape_rectangle(), icon: SquareDashed },
        { value: "lasso", label: m.tool_shape_lasso(), icon: Lasso },
      ],
    },
    hint: m.tool_select_hint(),
    needsLayer: false,
    needsColor: false,
    cursor: () => ({ kind: "none" }),
    hover(editor, { x, y }, zoom) {
      const { state } = editor.selection;
      const placement = placementOf(state);
      if (!placement) {
        return null;
      }
      return zoneCursor(zoneAt(placement, x, y, zoom, state.pivot ?? null), placement);
    },
    begin(context, settings, sample) {
      const { state } = context.editor.selection;
      const placement = placementOf(state);
      const zone = placement
        ? zoneAt(placement, sample.x, sample.y, sample.viewZoom ?? 1, state.pivot ?? null)
        : ({ kind: "outside" } as const);
      if (zone.kind === "outside") {
        return settings.shape === "lasso"
          ? new NewLasso(context, sample)
          : new NewRectangle(context, sample);
      }
      if (zone.kind === "bounds") {
        return new MoveEdge(context, sample, zone.side);
      }
      if (zone.kind === "pivot") {
        return new MovePivot(context, sample);
      }

      const layerId = contentLayer(context);
      if (!layerId) {
        return null;
      }
      const transform = (label: string, place: Place, carriesPivot = false) =>
        new TransformContent(context, sample, label, layerId, place, smooth, carriesPivot);

      switch (zone.kind) {
        case "inside":
          return transform(
            m.tool_undo_move(),
            (start, pen, grab) =>
              moved(start, Math.round(pen.x - grab.x), Math.round(pen.y - grab.y)),
            true,
          );
        case "content":
          return transform(m.tool_undo_scale(), (start, pen, grab) => {
            const delta = boxDelta(start, pen.x - grab.x, pen.y - grab.y);
            const shift = context.modifiers().shift;
            return scaled(start, zone.id, delta.x, delta.y, shift);
          });
        case "rotate": {
          const center = state.pivot ?? centerOf(placement!);
          return transform(m.tool_undo_rotate(), (start, pen, grab) => {
            const from = Math.atan2(grab.y - center.y, grab.x - center.x);
            let angle = Math.atan2(pen.y - center.y, pen.x - center.x) - from;
            if (context.modifiers().shift) {
              angle = Math.round(angle / SNAP_ANGLE) * SNAP_ANGLE;
            }
            return angle === 0 ? start : rotated(start, center, angle);
          });
        }
        case "skew":
          return transform(m.tool_undo_skew(), (start, pen, grab) => {
            const dx = pen.x - grab.x;
            const dy = pen.y - grab.y;
            return dx === 0 && dy === 0 ? start : skewed(start, zone.side, dx, dy);
          });
      }
    },
  });
}

export const selectTool = selectionTool("select", m.tool_selection(), false);
export const smoothSelectTool = selectionTool("smoothSelect", m.tool_smooth_selection(), true);

/** Whether it is one of the selection tools: they show the selection's handles. */
export const isSelectTool = ({ id }: Tool) => id === selectTool.id || id === smoothSelectTool.id;
