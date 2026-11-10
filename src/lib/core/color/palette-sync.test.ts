import { describe, expect, it } from "vitest";
import type { RGB } from "#lib/core/color/color.js";
import { Drawing } from "#lib/core/document/drawing.js";
import { History } from "#lib/core/history/history.js";
import { PaletteLibrary } from "#lib/core/color/palette.js";
import { PaletteColorSync } from "#lib/core/color/palette-sync.js";

const red: RGB = [255, 0, 0];
const green: RGB = [0, 255, 0];
const blue: RGB = [0, 0, 255];

function setup(locked: boolean) {
  const library = new PaletteLibrary([{ name: "A", colors: [red, green] }], null, []);
  library.locked = locked;
  const history = new History(new Drawing(8, 8));
  return {
    library,
    history,
    sync: new PaletteColorSync(
      () => library,
      () => history,
    ),
  };
}

describe("PaletteColorSync", () => {
  it("changes the palette color live while dragging, as one undo step", () => {
    const { library, history, sync } = setup(false);
    library.pick(1);
    sync.start(green);
    sync.change(green, [0, 200, 0]);
    expect(library.active!.colors[1]).toEqual([0, 200, 0]);
    // Through another palette color: still the same one that changes.
    sync.change([0, 200, 0], red);
    sync.change(red, blue);
    sync.end();
    expect(library.active!.colors).toEqual([red, blue]);
    expect(history.steps).toBe(1);
    history.undo();
    expect(library.active!.colors).toEqual([red, green]);
  });

  it("changes it in one step from the hex code, and leaves no step for a click", () => {
    const { library, history, sync } = setup(false);
    library.pick(0);
    sync.start(red);
    sync.end();
    expect(history.steps).toBe(0);
    sync.change(red, blue);
    expect(library.active!.colors).toEqual([blue, green]);
    expect(history.steps).toBe(1);
  });

  it("does nothing when locked, or for a color not in the palette", () => {
    const locked = setup(true);
    locked.library.pick(0);
    locked.sync.start(red);
    locked.sync.change(red, blue);
    locked.sync.end();
    locked.sync.change(red, blue);
    expect(locked.library.active!.colors).toEqual([red, green]);

    const other = setup(false);
    other.library.pick(0);
    other.sync.change(blue, red);
    expect(other.library.active!.colors).toEqual([red, green]);
    expect(other.history.steps).toBe(0);
  });

  it("follows the color clicked, not one merely equal to it", () => {
    const { library, sync } = setup(false);
    // None clicked: a color of the palette is left alone.
    sync.change(red, blue);
    sync.start(green);
    sync.change(green, blue);
    sync.end();
    expect(library.active!.colors).toEqual([red, green]);
    // The same color twice: only the one clicked changes.
    library.addColor(red);
    library.pick(2);
    sync.change(red, blue);
    expect(library.active!.colors).toEqual([red, green, blue]);
  });
});
