import { beforeAll, describe, expect, it } from "vitest";
import { Drawing } from "#lib/core/document/drawing.js";
import { Editor } from "#lib/core/editor/editor.js";
import { capture, expectSameState, fill } from "#lib/core/testing/test-utils.js";
import { loadMyPaint, type MyPaint } from "#lib/mypaint/engine.js";
import { Painter } from "#lib/app/input/painter.js";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import type { Picked } from "#lib/app/tools/tool.js";
import type { RGB } from "#lib/core/color/color.js";

let engine: MyPaint;
beforeAll(async () => {
  engine = await loadMyPaint();
});

const tools = createToolRegistry();

function setup(tool = "brush", withEngine = true, now?: () => number) {
  const editor = new Editor(new Drawing(200, 200));
  editor.commands.execute("layer.add");
  editor.history.clear();
  const state = {
    tool,
    options: tools.defaultOptions(),
    picked: null as Picked | null,
    painted: [] as RGB[],
    message: "",
    alt: false,
  };
  state.options.color = [200, 0, 0];
  const painter = new Painter(
    editor,
    {
      tool: (eraser) => tools.get(eraser ? "eraser" : state.tool),
      options: () => state.options,
      onPick: (c) => (state.picked = c),
      onPainted: (c) => state.painted.push(c),
      onMessage: (m) => (state.message = m),
      modifiers: () => ({ shift: false, ctrl: false, alt: state.alt }),
    },
    now,
  );
  if (withEngine) {
    painter.setEngine(engine);
  }
  const pixel = (x: number, y: number) => [
    ...editor.activeLayer!.tiles.readRegion({ x, y, width: 1, height: 1 }),
  ];
  return { editor, painter, state, pixel };
}

const line = (y: number) =>
  Array.from({ length: 20 }, (_, i) => ({ x: 20 + i * 5, y, pressure: 1 }));

describe("Painter", () => {
  it("keeps brushes inside the selection", () => {
    const { editor, painter, pixel } = setup();
    editor.selection.set({ rect: { x: 60, y: 30, width: 20, height: 40 }, floating: null });
    const [first, ...rest] = line(50);
    painter.begin(first);
    painter.move(rest);
    painter.end();
    painter.drain();
    expect(pixel(70, 50)[3]).toBeGreaterThan(0);
    expect(pixel(40, 50)).toEqual([0, 0, 0, 0]);
    expect(pixel(100, 50)).toEqual([0, 0, 0, 0]);
    expect(editor.history.steps).toBe(1);
  });

  it("paints a stroke as one undo step", () => {
    const { editor, painter, pixel } = setup();
    const before = capture(editor.drawing);
    const [first, ...rest] = line(50);
    expect(painter.begin(first)).toBe(true);
    expect(painter.active).toBe(true);
    painter.move(rest);
    painter.end();
    painter.drain();
    expect(painter.active).toBe(false);
    const [r, g, b, a] = pixel(60, 50);
    expect(a).toBeGreaterThan(200);
    expect(r).toBeGreaterThan(150);
    expect(g + b).toBeLessThan(40);
    expect(editor.history.steps).toBe(1);
    expect(editor.history.undoLabel).toBe("Brush");
    editor.history.undo();
    expectSameState(capture(editor.drawing), before);
  });

  it("reports the color of a stroke done, not an eraser's", () => {
    const { painter, state } = setup();
    const [first, ...rest] = line(50);
    painter.begin(first);
    painter.move(rest);
    painter.end();
    painter.drain();
    expect(state.painted).toEqual([[200, 0, 0]]);
    painter.begin(first, true);
    painter.move(rest);
    painter.end();
    painter.drain();
    expect(state.painted).toHaveLength(1);
  });

  it("uses the tool chosen by the host for the pen's eraser end", () => {
    const { editor, painter, pixel } = setup("pixel");
    const all = { x: 0, y: 0, width: 200, height: 200 };
    editor.drawing.writePixels(editor.activeLayer!.id, all, fill(all, [0, 0, 255, 255]));
    painter.begin({ x: 100, y: 100, pressure: 1 }, true);
    painter.end();
    painter.drain();
    expect(pixel(100, 100)).toEqual([0, 0, 0, 0]);
    expect(editor.history.undoLabel).toBe("Eraser");
  });

  it("paints as wide as the size at full pressure, like the brush outline", () => {
    // The large hard eraser grows about 3.2 times with pressure.
    const { editor, painter, state, pixel } = setup("eraser");
    const all = { x: 0, y: 0, width: 200, height: 200 };
    editor.drawing.writePixels(editor.activeLayer!.id, all, fill(all, [0, 0, 255, 255]));
    state.options.tools.eraser.size = 60;
    const [first, ...rest] = line(100);
    painter.begin(first);
    painter.move(rest);
    painter.end();
    painter.drain();
    let erased = 0;
    for (let y = 0; y < 200; y++) {
      if (pixel(70, y)[3] < 128) {
        erased++;
      }
    }
    expect(erased).toBeGreaterThan(60 * 0.85);
    expect(erased).toBeLessThan(60 * 1.15);
  });

  it("paints crisp pixels with the pixel tool", () => {
    const { painter, pixel } = setup("pixel");
    painter.begin({ x: 10.7, y: 10.2, pressure: 0.3 });
    painter.move([{ x: 14.1, y: 10.9, pressure: 0.3 }]);
    painter.end();
    painter.drain();
    for (let x = 10; x <= 14; x++) {
      expect(pixel(x, 10)).toEqual([200, 0, 0, 255]);
    }
    expect(pixel(10, 11)).toEqual([0, 0, 0, 0]);
  });

  it("erases crisp pixels with the pixel eraser", () => {
    const { editor, painter, pixel } = setup("pixelEraser");
    const all = { x: 0, y: 0, width: 200, height: 200 };
    editor.drawing.writePixels(editor.activeLayer!.id, all, fill(all, [0, 0, 255, 255]));
    painter.begin({ x: 10.7, y: 10.2, pressure: 0.3 });
    painter.move([{ x: 14.1, y: 10.9, pressure: 0.3 }]);
    painter.end();
    for (let x = 10; x <= 14; x++) {
      expect(pixel(x, 10)).toEqual([0, 0, 0, 0]);
    }
    expect(pixel(10, 11)).toEqual([0, 0, 255, 255]);
    expect(editor.history.undoLabel).toBe("Pixel eraser");
  });

  it("picks the visible color without painting", () => {
    const { editor, painter, state } = setup("picker");
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    editor.drawing.writePixels(editor.activeLayer!.id, rect, fill(rect, [10, 20, 30, 255]));
    expect(painter.begin({ x: 5, y: 5, pressure: 1 })).toBe(false);
    expect(state.picked?.color).toEqual([10, 20, 30]);
    expect(editor.history.steps).toBe(0);
    // A transparent pixel has no color; outside the canvas, nothing is taken.
    painter.begin({ x: 50, y: 50, pressure: 1 });
    expect(state.picked).toEqual({ color: null });
    state.picked = null;
    painter.begin({ x: -5, y: 5, pressure: 1 });
    expect(state.picked).toBeNull();
  });

  it("refuses to paint without a color, but still erases", () => {
    const { editor, painter, state, pixel } = setup("pixel");
    const all = { x: 0, y: 0, width: 200, height: 200 };
    editor.drawing.writePixels(editor.activeLayer!.id, all, fill(all, [0, 0, 255, 255]));
    state.options.color = null;
    expect(painter.begin({ x: 10, y: 10, pressure: 1 })).toBe(false);
    expect(state.message).toContain("No color");
    expect(pixel(10, 10)).toEqual([0, 0, 255, 255]);
    for (const tool of ["line", "rectangle", "ellipse", "fill", "brush"]) {
      state.tool = tool;
      expect(painter.begin({ x: 10, y: 10, pressure: 1 })).toBe(false);
    }
    state.tool = "pixelEraser";
    expect(painter.begin({ x: 10, y: 10, pressure: 1 })).toBe(true);
    painter.end();
    expect(pixel(10, 10)).toEqual([0, 0, 0, 0]);
    state.tool = "eraser";
    expect(painter.begin({ x: 50, y: 50, pressure: 1 })).toBe(true);
    painter.cancel();
  });

  it("picks with Alt held, whatever the tool, and paints again once released", () => {
    const { editor, painter, state, pixel } = setup("pixel");
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    editor.drawing.writePixels(editor.activeLayer!.id, rect, fill(rect, [10, 20, 30, 255]));
    state.alt = true;
    // Works on a locked layer too: picking does not change it.
    editor.drawing.updateLayer(editor.activeLayer!.id, { locked: true });
    expect(painter.begin({ x: 5, y: 5, pressure: 1 })).toBe(false);
    expect(state.picked?.color).toEqual([10, 20, 30]);
    expect(state.message).toBe("");
    expect(editor.history.steps).toBe(0);
    editor.drawing.updateLayer(editor.activeLayer!.id, { locked: false });
    state.alt = false;
    expect(painter.begin({ x: 50, y: 50, pressure: 1 })).toBe(true);
    painter.end();
    expect(pixel(50, 50)).toEqual([200, 0, 0, 255]);
  });

  it("refuses to paint without a layer, on a locked or a hidden layer", () => {
    const { editor, painter, state } = setup();
    const id = editor.activeLayer!.id;
    editor.drawing.updateLayer(id, { locked: true });
    expect(painter.begin({ x: 5, y: 5, pressure: 1 })).toBe(false);
    expect(state.message).toContain("locked");
    editor.drawing.updateLayer(id, { locked: false, visible: false });
    expect(painter.begin({ x: 5, y: 5, pressure: 1 })).toBe(false);
    expect(state.message).toContain("hidden");
    editor.commands.execute("layer.remove");
    expect(painter.begin({ x: 5, y: 5, pressure: 1 })).toBe(false);
    expect(state.message).toContain("No layer");
    expect(painter.active).toBe(false);
  });

  it("paints less with less pressure", () => {
    const coverage = (pressure: number) => {
      const { painter, editor } = setup();
      const points = line(100).map((p) => ({ ...p, pressure }));
      painter.begin(points[0]);
      painter.move(points.slice(1));
      painter.end();
      painter.drain();
      const all = { x: 0, y: 0, width: 200, height: 200 };
      return editor
        .activeLayer!.tiles.readRegion(all)
        .reduce((sum, v, i) => (i % 4 === 3 ? sum + v : sum), 0);
    };
    expect(coverage(0.1)).toBeLessThan(coverage(1) * 0.8);
  });

  it("leaves a mark on a tap, without movement", () => {
    const { painter, pixel, editor } = setup();
    painter.begin({ x: 100, y: 100, pressure: 0.8 });
    painter.end();
    painter.drain();
    // About as dense as a regular stroke (alpha around 80 for this brush), not a blob.
    expect(pixel(100, 100)[3]).toBeGreaterThan(40);
    expect(pixel(100, 100)[3]).toBeLessThan(160);
    expect(editor.history.steps).toBe(1);
  });

  it("waits for the brush engine", () => {
    const { painter, state } = setup("brush", false);
    expect(painter.begin({ x: 5, y: 5, pressure: 1 })).toBe(false);
    expect(state.message).toContain("loading");
  });

  it("cancels a stroke", () => {
    const { editor, painter } = setup();
    const before = capture(editor.drawing);
    painter.begin({ x: 50, y: 50, pressure: 1 });
    painter.flush();
    painter.cancel();
    expectSameState(capture(editor.drawing), before);
    expect(editor.history.steps).toBe(0);
  });

  it("does nothing on move or end without a stroke", () => {
    const { editor, painter } = setup();
    painter.move([{ x: 1, y: 1, pressure: 1 }]);
    painter.end();
    painter.drain();
    painter.cancel();
    expect(editor.history.steps).toBe(0);
  });
});

describe("samples with the same time", () => {
  it("are spread over time instead of producing an infinite speed", async () => {
    const run = (times: number[]) => {
      const { painter, editor } = setup();
      const points = times.map((time, i) => ({ x: 20 + i * 4, y: 100, pressure: 0.8, time }));
      painter.begin(points[0]);
      painter.move(points.slice(1));
      painter.end();
      painter.drain();
      return editor.activeLayer!.tiles.readRegion({ x: 0, y: 0, width: 200, height: 200 });
    };
    // Pairs of events sharing a timestamp, as with 1 ms resolution, every 8 ms.
    const paired = Array.from({ length: 30 }, (_, i) => Math.floor(i / 2) * 8);
    const even = Array.from({ length: 30 }, (_, i) => i * 4);
    const { firstDifference } = await import("#lib/core/testing/test-utils.js");
    expect(firstDifference(run(paired), run(even))).toBe(-1);
  });

  describe("queue", () => {
    /** A clock that moves 10 ms each time it is read: one sample per frame (budget 8 ms). */
    const slowClock = () => {
      let t = 0;
      return () => (t += 10);
    };
    const all = { x: 0, y: 0, width: 200, height: 200 };
    const timed = line(80).map((p, i) => ({ ...p, time: i * 8 }));

    it("paints one frame budget at a time, and ends once the queue is empty", () => {
      const { editor, painter } = setup("brush", true, slowClock());
      painter.begin(timed[0]);
      painter.move(timed.slice(1));
      painter.end();
      expect(painter.active).toBe(true);
      expect(painter.finishing).toBe(true);
      expect(editor.history.steps).toBe(0);
      let frames = 0;
      // Bounded, so that a stroke that never ends fails instead of hanging.
      while (painter.active && frames < 1000) {
        painter.flush();
        frames++;
      }
      expect(frames).toBe(timed.length);
      expect(painter.finishing).toBe(false);
      expect(editor.history.steps).toBe(1);
    });

    it("paints the same pixels, frame by frame or all at once", () => {
      const paint = (frameByFrame: boolean) => {
        const { editor, painter } = setup("brush", true, slowClock());
        painter.begin(timed[0]);
        for (const p of timed.slice(1)) {
          painter.move([p]);
          if (frameByFrame) {
            painter.flush();
          }
        }
        painter.end();
        if (frameByFrame) {
          for (let i = 0; painter.active && i < 1000; i++) {
            painter.flush();
          }
        } else {
          painter.drain();
        }
        return editor.activeLayer!.tiles.readRegion(all);
      };
      expect(paint(true)).toEqual(paint(false));
    });

    it("cancels a stroke that is still being painted", () => {
      const { editor, painter } = setup("brush", true, slowClock());
      const before = capture(editor.drawing);
      painter.begin(timed[0]);
      painter.move(timed.slice(1));
      painter.flush();
      painter.end();
      painter.cancel();
      expect(painter.active).toBe(false);
      painter.flush();
      expectSameState(capture(editor.drawing), before);
      expect(editor.history.steps).toBe(0);
    });

    it("finishes the previous stroke when a new one starts", () => {
      const { editor, painter } = setup("brush", true, slowClock());
      painter.begin(timed[0]);
      painter.move(timed.slice(1));
      painter.end();
      painter.begin({ x: 10, y: 150, pressure: 1 });
      expect(editor.history.steps).toBe(1);
      painter.end();
      painter.drain();
      expect(editor.history.steps).toBe(2);
    });
  });
});
