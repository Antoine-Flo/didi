import { describe, expect, it } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { Painter } from "#lib/app/input/painter.js";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import type { Modifiers } from "#lib/app/tools/tool.js";
import { commandsOf } from "#lib/core/testing/test-utils.js";

const tools = createToolRegistry();

function setup(tool: string) {
  const editor = new Editor(new Drawing(32, 32));
  commandsOf(editor).execute("layer.add");
  editor.history.clear();
  const options = tools.defaultOptions();
  options.color = [200, 0, 0];
  const keys: Modifiers = { shift: false, ctrl: false, alt: false };
  const painter = new Painter(editor, {
    tool: () => tools.get(tool),
    options: () => options,
    onPick: () => {},
    onMessage: () => {},
    modifiers: () => keys,
  });
  const alpha = (x: number, y: number) =>
    editor.activeLayer!.tiles.readRegion({ x, y, width: 1, height: 1 })[3];
  const painted = () => {
    let n = 0;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (alpha(x, y)) {
          n++;
        }
      }
    }
    return n;
  };
  const drag = (from: [number, number], ...to: [number, number][]) => {
    painter.begin({ x: from[0] + 0.5, y: from[1] + 0.5, pressure: 1 });
    painter.move(to.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5, pressure: 1 })));
  };
  return { editor, painter, options, keys, alpha, painted, drag };
}

describe("shape tools", () => {
  it("draw only the last shape of the drag, as one undo step", () => {
    const { editor, painter, painted, alpha, drag } = setup("rectangle");
    drag([2, 2], [20, 20], [5, 4]);
    painter.end();
    expect(painted()).toBe(4 + 4 + 1 + 1);
    expect(alpha(5, 4)).toBe(255);
    expect(alpha(20, 20)).toBe(0);
    expect(editor.history.steps).toBe(1);
    expect(editor.history.undoLabel).toBe("Rectangle");
    editor.history.undo();
    expect(painted()).toBe(0);
  });

  it("follow Shift without moving the pen", () => {
    const { painter, keys, alpha, drag } = setup("line");
    drag([0, 0], [10, 1]);
    painter.flush();
    expect(alpha(10, 1)).toBe(255);
    keys.shift = true;
    painter.flush();
    expect(alpha(10, 1)).toBe(0);
    expect(alpha(10, 0)).toBe(255);
    painter.end();
  });

  it("fill rectangles and ellipses when asked", () => {
    const { painter, options, painted, drag } = setup("ellipse");
    options.tools.ellipse.style = "filled";
    drag([0, 0], [7, 7]);
    painter.end();
    const filled = painted();
    expect(filled).toBeGreaterThan(40);
    expect(filled).toBeLessThan(64);
  });

  it("are cancelled without a trace", () => {
    const { editor, painter, painted, drag } = setup("ellipse");
    drag([0, 0], [9, 5]);
    painter.cancel();
    expect(painted()).toBe(0);
    expect(editor.history.steps).toBe(0);
  });
});

describe("pixel brush", () => {
  it("paints with the chosen tip, round or square", () => {
    const round = setup("pixel");
    round.options.tools.pixel.size = 5;
    round.drag([10, 10]);
    round.painter.end();
    const square = setup("pixel");
    square.options.tools.pixel.size = 5;
    square.options.tools.pixel.shape = "square";
    square.drag([10, 10]);
    square.painter.end();
    expect(square.painted()).toBe(25);
    expect(round.painted()).toBeLessThan(25);
    expect(square.alpha(8, 8)).toBe(255);
    expect(round.alpha(8, 8)).toBe(0);
  });
});

describe("paint bucket", () => {
  it("fills the clicked area as one undo step", () => {
    const { editor, painter, painted, drag } = setup("rectangle");
    drag([0, 0], [9, 9]);
    painter.end();
    const outline = painted();
    const bucket = setupOn(editor, "fill");
    bucket.begin({ x: 4.5, y: 4.5, pressure: 1 });
    bucket.end();
    expect(painted()).toBe(outline + 8 * 8);
    expect(editor.history.undoLabel).toBe("Paint bucket");
  });
});

function setupOn(editor: Editor, tool: string) {
  const options = tools.defaultOptions();
  options.color = [0, 0, 200];
  return new Painter(editor, {
    tool: () => tools.get(tool),
    options: () => options,
    onPick: () => {},
    onMessage: () => {},
  });
}
