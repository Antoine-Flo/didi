import { describe, expect, it } from "vitest";
import { Painter } from "#lib/app/canvas/painter.js";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { capture, expectSameState, fill } from "#lib/core/test-utils.js";
import { selectionClip } from "#lib/core/selection/selection.js";
import { shapeMask } from "#lib/core/selection/shape.js";
import { createToolRegistry } from "./builtin";

const tools = createToolRegistry();
const ZOOM = 8;
/** Red square, selected below. */
const SQUARE = { x: 10, y: 10, width: 10, height: 10 };
const RED = [255, 0, 0, 255];
const EMPTY = [0, 0, 0, 0];

function setup() {
  const editor = new Editor(new Drawing(64, 64));
  editor.commands.execute("layer.add");
  editor.drawing.writePixels(editor.activeLayer!.id, SQUARE, fill(SQUARE, [255, 0, 0, 255]));
  editor.history.clear();
  const state = { tool: "select", shift: false, message: "" };
  const options = tools.defaultOptions();
  options.color = [0, 255, 0];
  const painter = new Painter(editor, {
    tool: () => tools.get(state.tool),
    options: () => options,
    onPick: () => {},
    onMessage: (m) => (state.message = m),
    modifiers: () => ({ shift: state.shift, ctrl: false, alt: false }),
  });
  const drag = (x0: number, y0: number, x1: number, y1: number) => {
    const started = painter.begin({ x: x0, y: y0, pressure: 1, viewZoom: ZOOM });
    painter.move([{ x: x1, y: y1, pressure: 1, viewZoom: ZOOM }]);
    painter.end();
    return started;
  };
  const pixel = (x: number, y: number) => [
    ...editor.activeLayer!.tiles.readRegion({ x, y, width: 1, height: 1 }),
  ];
  return { editor, painter, state, options, drag, pixel };
}

/** Selects the red square, by dragging across it (pixels 10 to 19). */
function selected() {
  const context = setup();
  context.drag(10.5, 10.5, 19.5, 19.5);
  expect(context.editor.selection.rect).toEqual(SQUARE);
  return context;
}

describe("the selection tool", () => {
  it("selects by dragging, in any direction, inside the canvas", () => {
    const { editor, drag } = setup();
    drag(19.5, 19.5, 10.5, 10.5);
    expect(editor.selection.rect).toEqual(SQUARE);
    drag(40.5, 40.5, 500, 500);
    expect(editor.selection.rect).toEqual({ x: 40, y: 40, width: 24, height: 24 });
  });

  it("removes the selection with a click outside", () => {
    const { editor, drag } = selected();
    drag(50, 50, 50, 50);
    expect(editor.selection.rect).toBeNull();
    editor.history.undo();
    expect(editor.selection.rect).toEqual(SQUARE);
  });

  it("moves an edge with a bounds handle, without touching the pixels", () => {
    const { editor, drag, pixel } = selected();
    const before = capture(editor.drawing);
    // The top handle, inside the frame.
    drag(15, 11, 15, 13);
    expect(editor.selection.rect).toEqual({ x: 10, y: 12, width: 10, height: 8 });
    expect(editor.selection.floating).toBeNull();
    expectSameState(capture(editor.drawing), before);
    expect(pixel(15, 10)).toEqual(RED);
    editor.history.undo();
    expect(editor.selection.rect).toEqual(SQUARE);
  });

  it("moves the content from the center", () => {
    const { editor, drag, pixel } = selected();
    drag(13, 13, 23, 16);
    expect(editor.selection.rect).toEqual({ x: 20, y: 13, width: 10, height: 10 });
    expect(pixel(10, 10)).toEqual(EMPTY);
    expect(pixel(20, 13)).toEqual(RED);
    expect(editor.selection.floating).not.toBeNull();
  });

  it("does nothing with a simple click in the center", () => {
    const { editor, drag } = selected();
    const steps = editor.history.steps;
    const before = capture(editor.drawing);
    drag(13, 13, 13, 13);
    expect(editor.selection.floating).toBeNull();
    expect(editor.history.steps).toBe(steps);
    expectSameState(capture(editor.drawing), before);
  });

  it("scales the content with a content handle, keeping the ratio with Shift", () => {
    const { editor, state, drag, pixel } = selected();
    // The bottom right handle, outside the frame.
    drag(21.25, 21.25, 31.25, 26.25);
    expect(editor.selection.rect).toEqual({ x: 10, y: 10, width: 20, height: 15 });
    expect(pixel(29, 24)).toEqual(RED);
    state.shift = true;
    drag(31.25, 26.25, 41.25, 26.25);
    expect(editor.selection.rect).toEqual({ x: 10, y: 10, width: 30, height: 23 });
  });

  it("undoes each gesture, back to the original pixels", () => {
    const { editor, drag } = selected();
    const before = capture(editor.drawing);
    drag(13, 13, 23, 23);
    const moved = capture(editor.drawing);
    drag(23, 23, 33, 33);
    editor.history.undo();
    expectSameState(capture(editor.drawing), moved);
    expect(editor.selection.rect).toEqual({ x: 20, y: 20, width: 10, height: 10 });
    editor.history.undo();
    expectSameState(capture(editor.drawing), before);
    expect(editor.selection.floating).toBeNull();
    expect(editor.selection.rect).toEqual(SQUARE);
    editor.history.redo();
    expectSameState(capture(editor.drawing), moved);
  });

  it("applies the content before moving the bounds", () => {
    const { editor, drag, pixel } = selected();
    drag(13, 13, 23, 13);
    drag(25, 11, 25, 13);
    expect(editor.selection.floating).toBeNull();
    expect(editor.selection.rect).toEqual({ x: 20, y: 12, width: 10, height: 8 });
    expect(pixel(25, 10)).toEqual(RED);
  });

  it("leaves no selection when applying content that is off the canvas", () => {
    const { editor, drag } = selected();
    drag(13, 13, 98, 13);
    expect(editor.selection.rect?.x).toBe(95);
    drag(100, 11, 100, 13);
    expect(editor.selection.rect).toBeNull();
    expect(editor.selection.floating).toBeNull();
  });

  it("applies the content when a new selection starts", () => {
    const { editor, drag, pixel } = selected();
    drag(13, 13, 23, 13);
    drag(50, 50, 55, 55);
    expect(editor.selection.floating).toBeNull();
    expect(pixel(25, 15)).toEqual(RED);
    expect(pixel(15, 15)).toEqual(EMPTY);
  });

  it("cancels a gesture in progress", () => {
    const { editor, painter } = selected();
    const before = capture(editor.drawing);
    painter.begin({ x: 13, y: 13, pressure: 1, viewZoom: ZOOM });
    painter.move([{ x: 30, y: 30, pressure: 1, viewZoom: ZOOM }]);
    painter.flush();
    expect(editor.selection.floating).not.toBeNull();
    painter.cancel();
    expect(editor.selection.floating).toBeNull();
    expect(editor.selection.rect).toEqual(SQUARE);
    expectSameState(capture(editor.drawing), before);
  });

  it("selects on a locked layer, but refuses to take its pixels", () => {
    const { editor, state, drag, pixel } = setup();
    editor.drawing.updateLayer(editor.activeLayer!.id, { locked: true });
    drag(10.5, 10.5, 19.5, 19.5);
    expect(editor.selection.rect).toEqual(SQUARE);
    expect(drag(13, 13, 23, 23)).toBe(false);
    expect(state.message).toContain("locked");
    expect(pixel(15, 15)).toEqual(RED);
  });
});

describe("rotating and skewing", () => {
  /** The red square, with a blue top left pixel, selected. */
  function marked() {
    const context = setup();
    const { editor, drag } = context;
    const corner = { x: 10, y: 10, width: 1, height: 1 };
    editor.drawing.writePixels(editor.activeLayer!.id, corner, fill(corner, [0, 0, 255, 255]));
    drag(10.5, 10.5, 19.5, 19.5);
    return context;
  }
  const BLUE = [0, 0, 255, 255];

  it("rotates from the band near a corner, around the center", () => {
    const { editor, drag, pixel } = marked();
    // From the bottom right to the bottom left: a quarter turn, clockwise.
    drag(22.5, 22.5, 7.5, 22.5);
    expect(pixel(19, 10)).toEqual(BLUE);
    expect(pixel(10, 10)).toEqual(RED);
    expect(editor.selection.state.transform).toBeTruthy();
    expect(editor.selection.floating).not.toBeNull();
  });

  it("goes back to exact pixels when undone, or turned back", () => {
    const { editor, drag, pixel } = marked();
    const before = capture(editor.drawing);
    drag(22.5, 22.5, 7.5, 22.5);
    editor.history.undo();
    expectSameState(capture(editor.drawing), before);
    drag(22.5, 22.5, 7.5, 22.5);
    // The same corner is now at the bottom left: turn it back.
    drag(7.5, 22.5, 22.5, 22.5);
    expect(editor.selection.state.transform).toBeFalsy();
    expect(pixel(10, 10)).toEqual(BLUE);
  });

  it("snaps to 15° with Shift", () => {
    const { editor, state, drag } = marked();
    state.shift = true;
    drag(22.5, 22.5, 22, 25);
    const { a, c } = editor.selection.state.transform!;
    const degrees = (Math.atan2(c, a) * 180) / Math.PI;
    expect(Math.round(degrees * 1000) % 15000).toBe(0);
  });

  it("applies to the rectangle around it", () => {
    const { editor, drag } = marked();
    drag(22.5, 22.5, 15, 26.1);
    editor.commands.execute("selection.apply");
    const { rect, transform } = editor.selection.state;
    expect(transform).toBeFalsy();
    expect(rect!.width).toBeGreaterThan(10);
    expect(rect!.height).toBeGreaterThan(10);
  });

  it("moves the center of rotation with the cross, without lifting anything", () => {
    const { editor, drag, pixel } = marked();
    const before = capture(editor.drawing);
    drag(15, 15, 20, 20);
    expect(editor.selection.state.pivot).toEqual({ x: 20, y: 20 });
    expect(editor.selection.floating).toBeNull();
    expectSameState(capture(editor.drawing), before);
    // Half a turn around it: the square goes to the other side.
    drag(22.5, 22.5, 17.5, 17.5);
    expect(pixel(25, 25)).toEqual(RED);
    expect(pixel(15, 15)).toEqual(EMPTY);
    expect(pixel(29, 29)).toEqual(BLUE);
    editor.history.undo();
    editor.history.undo();
    expect(editor.selection.state.pivot).toBeFalsy();
  });

  it("snaps the center of rotation to halves of pixels", () => {
    const { editor, drag } = marked();
    drag(15, 15, 20.3, 20.2);
    expect(editor.selection.state.pivot).toEqual({ x: 20.5, y: 20 });
  });

  it("moves the center of rotation along with the content", () => {
    const { editor, drag } = marked();
    drag(15, 15, 18, 18);
    drag(13, 13, 23, 13);
    expect(editor.selection.state.pivot).toEqual({ x: 28, y: 18 });
  });

  it("skews from the band along a side, the opposite side staying in place", () => {
    const { editor, drag, pixel } = marked();
    // The top side, 4 pixels to the right.
    drag(15, 7, 19, 7);
    expect(pixel(23, 10)).toEqual(RED);
    expect(pixel(12, 10)).toEqual(EMPTY);
    expect(pixel(10, 19)).toEqual(RED);
    expect(pixel(20, 19)).toEqual(EMPTY);
    expect(editor.selection.state.transform).toBeTruthy();
    editor.history.undo();
    expect(pixel(10, 10)).toEqual(BLUE);
  });

  it("scales along the sides of rotated content", () => {
    const { editor, drag } = marked();
    drag(22.5, 22.5, 7.5, 22.5);
    // The first ring's corner that was bottom right is now bottom left.
    drag(8.75, 21.25, 3.75, 21.25);
    expect(editor.selection.rect).toEqual({ x: 10, y: 10, width: 10, height: 15 });
  });

  it("hides the bounds handles until rotated content is applied", () => {
    const { editor, drag } = marked();
    drag(22.5, 22.5, 7.5, 22.5);
    const start = editor.selection.rect;
    drag(15, 11, 15, 13);
    expect(editor.selection.rect).toEqual(start);
    expect(editor.selection.floating).not.toBeNull();
  });
});

describe("mirroring with a content handle", () => {
  const BLUE = [0, 0, 255, 255];

  /** The red square, with a blue top left pixel, selected. */
  function marked() {
    const context = setup();
    const { editor, drag } = context;
    const corner = { x: 10, y: 10, width: 1, height: 1 };
    editor.drawing.writePixels(editor.activeLayer!.id, corner, fill(corner, [0, 0, 255, 255]));
    drag(10.5, 10.5, 19.5, 19.5);
    return context;
  }

  it("mirrors when the left handle goes past the right side", () => {
    const { editor, drag, pixel } = marked();
    drag(8.75, 15, 28.75, 15);
    expect(pixel(15, 15)).toEqual(EMPTY);
    expect(pixel(29, 10)).toEqual(BLUE);
    expect(pixel(20, 10)).toEqual(RED);
    editor.commands.execute("selection.apply");
    expect(editor.selection.rect).toEqual({ x: 20, y: 10, width: 10, height: 10 });
    expect(pixel(29, 10)).toEqual(BLUE);
  });

  it("mirrors in the same gesture, back and forth", () => {
    const { editor, painter, pixel } = marked();
    const at = (x: number) => ({ x, y: 15, pressure: 1, viewZoom: ZOOM });
    painter.begin(at(8.75));
    painter.move([at(28.75)]);
    painter.flush();
    expect(pixel(29, 10)).toEqual(BLUE);
    painter.move([at(8.75)]);
    painter.flush();
    expect(pixel(10, 10)).toEqual(BLUE);
    painter.end();
    expect(editor.selection.state.transform).toBeFalsy();
  });

  it("comes back to a plain rectangle when mirrored twice", () => {
    const { editor, drag, pixel } = marked();
    drag(8.75, 15, 28.75, 15);
    // The same handle is now on the right.
    drag(31.25, 15, 11.25, 15);
    expect(editor.selection.state.transform).toBeFalsy();
    expect(editor.selection.rect).toEqual(SQUARE);
    expect(pixel(10, 10)).toEqual(BLUE);
  });

  it("mirrors vertically, and both ways from a corner", () => {
    const { drag, pixel } = marked();
    drag(21.25, 21.25, 1.25, 1.25);
    // Across the top left corner, which stays in place.
    expect(pixel(9, 9)).toEqual(BLUE);
    expect(pixel(0, 0)).toEqual(RED);
    expect(pixel(15, 15)).toEqual(EMPTY);
  });

  it("is undone as one step", () => {
    const { editor, drag } = marked();
    const before = capture(editor.drawing);
    drag(8.75, 15, 28.75, 15);
    editor.history.undo();
    expectSameState(capture(editor.drawing), before);
    expect(editor.selection.rect).toEqual(SQUARE);
  });
});

describe("a rectangle being dragged", () => {
  const at = (x: number, y: number) => ({ x, y, pressure: 1, viewZoom: ZOOM });

  it("only shows a preview until the pen is lifted", () => {
    const { editor, painter } = setup();
    painter.begin(at(10.5, 10.5));
    painter.move([at(20.5, 15.5)]);
    painter.flush();
    expect(editor.selection.rect).toBeNull();
    const area = { x: 10, y: 10, width: 11, height: 6 };
    expect(editor.selection.draft).toEqual({ rect: area });
    painter.end();
    expect(editor.selection.draft).toBeNull();
    expect(editor.selection.rect).toEqual(area);
    expect(editor.history.steps).toBe(1);
  });

  it("leaves nothing when cancelled", () => {
    const { editor, painter } = setup();
    painter.begin(at(10.5, 10.5));
    painter.move([at(20.5, 15.5)]);
    painter.flush();
    painter.cancel();
    expect(editor.selection.draft).toBeNull();
    expect(editor.selection.rect).toBeNull();
    expect(editor.history.steps).toBe(0);
  });
});

describe("the lasso", () => {
  const BLOCK = { x: 5, y: 5, width: 30, height: 30 };

  /** A red block, and a triangle selected in it: its right angle at (10, 10). */
  function lassoed() {
    const context = setup();
    const { editor, painter } = context;
    editor.drawing.writePixels(editor.activeLayer!.id, BLOCK, fill(BLOCK, [255, 0, 0, 255]));
    editor.history.clear();
    context.options.tools.select.shape = "lasso";
    const at = (x: number, y: number) => ({ x, y, pressure: 1, viewZoom: ZOOM });
    painter.begin(at(10.5, 10.5));
    painter.move([at(20.5, 10.5), at(30.5, 10.5), at(20.5, 20.5), at(10.5, 30.5)]);
    painter.end();
    expect(editor.selection.rect).toEqual({ x: 10, y: 10, width: 21, height: 21 });
    return context;
  }

  it("only shows a preview until the pen is lifted", () => {
    const { editor, painter, options } = setup();
    options.tools.select.shape = "lasso";
    const at = (x: number, y: number) => ({ x, y, pressure: 1, viewZoom: ZOOM });
    painter.begin(at(10.5, 10.5));
    painter.move([at(20.5, 10.5), at(20.5, 20.5)]);
    painter.flush();
    expect(editor.selection.rect).toBeNull();
    expect(editor.selection.draft?.rect).toEqual({ x: 10, y: 10, width: 11, height: 11 });
    painter.end();
    expect(editor.selection.draft).toBeNull();
    expect(editor.selection.rect).toEqual({ x: 10, y: 10, width: 11, height: 11 });
  });

  it("previews exactly what it will select, closing line included", () => {
    const { editor, painter, options } = setup();
    options.tools.select.shape = "lasso";
    const at = (x: number, y: number) => ({ x, y, pressure: 1, viewZoom: ZOOM });
    painter.begin(at(10.5, 10.5));
    // Two sides of a triangle: the third one, from the end to the start, is not drawn.
    painter.move([at(20.5, 10.5), at(20.5, 20.5)]);
    painter.flush();
    const preview = editor.selection.draft!;
    const mask = shapeMask(preview.rect, preview.shape!);
    const inMask = (x: number, y: number) => mask[(y - 10) * 11 + (x - 10)];
    expect(inMask(15, 15)).toBe(1);
    expect(inMask(13, 13)).toBe(1);
    expect(inMask(12, 18)).toBe(0);
    painter.end();
    const { clip, clipMask } = selectionClip(editor.selection.state);
    expect(clip).toEqual(preview.rect);
    expect(clipMask).toEqual(mask);
  });

  it("previews nothing before a second pixel", () => {
    const { editor, painter, options } = setup();
    options.tools.select.shape = "lasso";
    const at = (x: number, y: number) => ({ x, y, pressure: 1, viewZoom: ZOOM });
    painter.begin(at(10.5, 10.5));
    painter.flush();
    expect(editor.selection.draft).toBeNull();
    painter.cancel();
  });

  it("leaves nothing when cancelled", () => {
    const { editor, painter, options } = setup();
    options.tools.select.shape = "lasso";
    const at = (x: number, y: number) => ({ x, y, pressure: 1, viewZoom: ZOOM });
    painter.begin(at(10.5, 10.5));
    painter.move([at(20.5, 10.5)]);
    painter.flush();
    painter.cancel();
    expect(editor.selection.draft).toBeNull();
    expect(editor.selection.rect).toBeNull();
    expect(editor.history.steps).toBe(0);
  });

  it("selects what it goes through and surrounds", () => {
    const { editor } = lassoed();
    const { clipMask } = selectionClip(editor.selection.state);
    const inMask = (x: number, y: number) => clipMask![(y - 10) * 21 + (x - 10)];
    expect(inMask(10, 10)).toBe(1);
    expect(inMask(30, 10)).toBe(1);
    expect(inMask(15, 15)).toBe(1);
    expect(inMask(30, 30)).toBe(0);
    expect(inMask(25, 25)).toBe(0);
  });

  it("removes the selection with a click", () => {
    const { editor, drag } = lassoed();
    drag(50, 50, 50, 50);
    expect(editor.selection.rect).toBeNull();
    editor.history.undo();
    expect(editor.selection.state.shape).toBeTruthy();
  });

  it("limits drawing to its shape", () => {
    const { state, drag, pixel } = lassoed();
    state.tool = "pixel";
    drag(12.5, 12.5, 30.5, 30.5);
    expect(pixel(15, 15)).toEqual([0, 255, 0, 255]);
    expect(pixel(28, 28)).toEqual(RED);
  });

  it("moves only the pixels of its shape, and cancels", () => {
    const { editor, drag, pixel } = lassoed();
    const before = capture(editor.drawing);
    drag(13, 13, 43, 13);
    expect(pixel(13, 13)).toEqual(EMPTY);
    expect(pixel(43, 13)).toEqual(RED);
    // In the frame, outside the shape: not taken.
    expect(pixel(28, 28)).toEqual(RED);
    expect(pixel(58, 28)).toEqual(EMPTY);
    editor.commands.execute("selection.cancel");
    expectSameState(capture(editor.drawing), before);
    expect(editor.selection.state.shape).toBeTruthy();
  });

  it("stretches its shape with the bars, without touching the pixels", () => {
    const { editor, drag } = lassoed();
    const before = capture(editor.drawing);
    const shape = editor.selection.state.shape;
    drag(20.5, 11, 20.5, 13);
    expect(editor.selection.rect).toEqual({ x: 10, y: 12, width: 21, height: 19 });
    expect(editor.selection.state.shape).toBe(shape);
    expectSameState(capture(editor.drawing), before);
  });

  it("keeps its shape when applied after a rotation", () => {
    const { editor, drag } = lassoed();
    // Half a turn around its center, from the band near the bottom right corner.
    drag(33.5, 33.5, 7.5, 7.5);
    editor.commands.execute("selection.apply");
    const { rect, shape } = editor.selection.state;
    expect(rect).toEqual({ x: 10, y: 10, width: 21, height: 21 });
    const mask = shapeMask(rect!, shape!);
    expect(mask[20 * 21 + 20]).toBe(1);
    expect(mask[0]).toBe(0);
  });
});

describe("the smooth selection tool", () => {
  function smooth() {
    const context = setup();
    context.state.tool = "smoothSelect";
    context.drag(10.5, 10.5, 19.5, 19.5);
    return context;
  }

  it("selects and moves like the other one, pixels unchanged", () => {
    const { editor, drag, pixel } = smooth();
    expect(editor.selection.rect).toEqual(SQUARE);
    drag(13, 13, 23, 13);
    expect(pixel(20, 15)).toEqual(RED);
    expect(pixel(29, 15)).toEqual(RED);
    expect(pixel(30, 15)).toEqual(EMPTY);
    expect(pixel(19, 15)).toEqual(EMPTY);
  });

  it("mixes pixels when content is scaled", () => {
    const { editor, drag, pixel } = smooth();
    // The east handle, ten pixels further: twice as wide. The edge fades, the middle stays.
    drag(21.25, 15, 31.25, 15);
    expect(editor.selection.rect?.width).toBe(20);
    expect(pixel(20, 15)).toEqual(RED);
    const edge = pixel(29, 15);
    expect(edge[3]).toBeGreaterThan(0);
    expect(edge[3]).toBeLessThan(255);
  });

  it("keeps pixels exact with the pixel art tool", () => {
    const { editor, drag, pixel } = selected();
    drag(21.25, 15, 31.25, 15);
    expect(editor.selection.rect?.width).toBe(20);
    expect(pixel(29, 15)).toEqual(RED);
  });
});

describe("the menu of the selection tool", () => {
  it("offers the rectangle and the lasso", () => {
    expect(tools.get("select").menu?.items.map((i) => i.value)).toEqual(["rectangle", "lasso"]);
  });
});

describe("drawing with a selection", () => {
  it("limits the pixel tools to the selection", () => {
    const { state, drag, pixel } = selected();
    state.tool = "pixel";
    drag(15.5, 15.5, 30.5, 15.5);
    expect(pixel(19, 15)).toEqual([0, 255, 0, 255]);
    expect(pixel(20, 15)).toEqual(EMPTY);
    state.tool = "pixelEraser";
    drag(15.5, 17.5, 30.5, 17.5);
    expect(pixel(19, 17)).toEqual(EMPTY);
    state.tool = "line";
    drag(25.5, 25.5, 30.5, 30.5);
    expect(pixel(25, 25)).toEqual(EMPTY);
    state.tool = "fill";
    drag(40.5, 40.5, 40.5, 40.5);
    expect(pixel(40, 40)).toEqual(EMPTY);
  });

  it("applies floating content before drawing", () => {
    const { editor, state, drag, pixel } = selected();
    drag(13, 13, 23, 13);
    state.tool = "pixel";
    drag(25.5, 15.5, 25.5, 15.5);
    expect(editor.selection.floating).toBeNull();
    expect(pixel(25, 15)).toEqual([0, 255, 0, 255]);
    expect(pixel(24, 15)).toEqual(RED);
  });

  it("keeps floating content while picking a color", () => {
    const { editor, state, drag } = selected();
    drag(13, 13, 23, 13);
    state.tool = "picker";
    drag(25, 15, 25, 15);
    expect(editor.selection.floating).not.toBeNull();
  });
});
