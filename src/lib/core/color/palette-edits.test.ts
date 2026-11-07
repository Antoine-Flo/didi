import { describe, expect, it } from "vitest";
import type { RGB } from "./color";
import { Drawing } from "../document/drawing";
import { History } from "../history/history";
import { PaletteLibrary } from "./palette";
import { addPaletteColor, changePaletteColor, removePaletteColor } from "./palette-edits";

const red: RGB = [255, 0, 0];
const green: RGB = [0, 255, 0];
const blue: RGB = [0, 0, 255];

function setup() {
  const library = new PaletteLibrary(
    [
      { name: "A", colors: [red, green] },
      { name: "B", colors: [] },
    ],
    null,
    [],
  );
  return { library, history: new History(new Drawing(8, 8)) };
}

describe("palette edits", () => {
  it("adds, removes and changes colors, undone and redone", () => {
    const { library, history } = setup();
    history.push(removePaletteColor(library, 0));
    history.push(addPaletteColor(library, blue));
    history.push(changePaletteColor(library, library.active!, 0, green, red));
    expect(library.active!.colors).toEqual([red, blue]);
    history.undo();
    expect(library.active!.colors).toEqual([green, blue]);
    history.undo();
    history.undo();
    expect(library.active!.colors).toEqual([red, green]);
    history.redo();
    expect(library.active!.colors).toEqual([green]);
    expect(history.marker).toBeNull();
  });

  it("shows the palette changed by undo, and skips deleted palettes", () => {
    const { library, history } = setup();
    history.push(removePaletteColor(library, 1));
    library.select(1);
    history.undo();
    expect(library.activeIndex).toBe(0);
    expect(library.active!.colors).toEqual([red, green]);
    history.redo();
    library.remove(0);
    expect(() => history.undo()).not.toThrow();
    expect(library.palettes.map((p) => p.name)).toEqual(["B"]);
  });
});
