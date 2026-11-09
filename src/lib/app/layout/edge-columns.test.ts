import { describe, expect, it } from "vitest";
import {
  columnTops,
  edgeOnSide,
  nearestSide,
  positionOnEdge,
  sideOfEdge,
} from "#lib/app/layout/edge-columns.js";

describe("columns along an edge", () => {
  it("puts a column where its place says, in whole pixels", () => {
    expect(columnTops(500, [{ height: 100, position: 0 }], 8)).toEqual([0]);
    expect(columnTops(500, [{ height: 100, position: 1 }], 8)).toEqual([400]);
    expect(columnTops(500, [{ height: 100, position: 0.3333 }], 8)).toEqual([133]);
  });

  it("leaves apart columns that do not overlap", () => {
    const columns = [
      { height: 100, position: 0 },
      { height: 100, position: 1 },
    ];
    expect(columnTops(500, columns, 8)).toEqual([0, 400]);
  });

  it("pushes the lower of two overlapping columns down", () => {
    const columns = [
      { height: 200, position: 0.5 },
      { height: 100, position: 0 },
    ];
    // The first wants 150, the second 0: the first starts below the second.
    expect(columnTops(500, columns, 8)).toEqual([150, 0]);
    expect(columnTops(500, [columns[1], { height: 200, position: 0 }], 8)).toEqual([0, 108]);
  });

  it("pushes them up from the bottom, inside the edge", () => {
    const columns = [
      { height: 200, position: 1 },
      { height: 200, position: 1 },
    ];
    expect(columnTops(500, columns, 8)).toEqual([92, 300]);
  });

  it("keeps the first at the top when they cannot fit", () => {
    const columns = [
      { height: 300, position: 0 },
      { height: 300, position: 1 },
    ];
    expect(columnTops(500, columns, 8)).toEqual([0, 200]);
  });

  it("tells the side and the place where a column is dropped", () => {
    const window = { left: 0, top: 0, width: 1000, height: 800 };
    expect(nearestSide({ left: 400, top: 0, width: 40, height: 200 }, window)).toBe("left");
    expect(nearestSide({ left: 600, top: 0, width: 40, height: 200 }, window)).toBe("right");
    const track = { left: 0, top: 100, width: 40, height: 600 };
    expect(positionOnEdge({ left: 0, top: 300, width: 40, height: 200 }, track)).toBe(0.5);
    expect(positionOnEdge({ left: 0, top: 0, width: 40, height: 200 }, track)).toBe(0);
    expect(positionOnEdge({ left: 0, top: 900, width: 40, height: 200 }, track)).toBe(1);
    expect(positionOnEdge({ left: 0, top: 300, width: 40, height: 700 }, track)).toBe(0);
  });

  it("names the edges from the side of the panels", () => {
    expect(edgeOnSide("left", true)).toBe("panels");
    expect(edgeOnSide("right", true)).toBe("opposite");
    expect(edgeOnSide("left", false)).toBe("opposite");
    expect(sideOfEdge("panels", false)).toBe("right");
    expect(sideOfEdge("opposite", false)).toBe("left");
  });
});
