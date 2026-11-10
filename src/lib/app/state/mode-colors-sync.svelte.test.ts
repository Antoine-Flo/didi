// @vitest-environment happy-dom
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RGB } from "#lib/core/color/color.js";
import type { ToolOptions } from "#lib/app/tools/tool.js";

const saved = { text: null as string | null };
vi.mock("#lib/platform/storage.js", () => ({
  readDataFile: async () => saved.text,
  writeDataFile: async (_name: string, text: string) => void (saved.text = text),
}));

const { ModeColors } = await import("#lib/app/prefs/mode-colors.svelte.js");
const { ModeColorsSync } = await import("#lib/app/state/mode-colors-sync.svelte.js");

const RED: RGB = [255, 0, 0];
const GREEN: RGB = [0, 255, 0];
const BLUE: RGB = [0, 0, 255];
const WHITE: RGB = [255, 255, 255];

let stop = () => {};
const mode = $state({ id: "pixel" });

/** Colors saved for the painting mode only; the options start black on white. */
function setup() {
  saved.text = JSON.stringify({
    version: 1,
    modes: { painting: { color: "#0000ff", secondary: "#00ff00", recent: [] } },
  });
  mode.id = "pixel";
  const colors = new ModeColors();
  const options: ToolOptions = $state({ color: [0, 0, 0], secondary: WHITE, tools: {} });
  let sync!: InstanceType<typeof ModeColorsSync>;
  stop = $effect.root(() => {
    sync = new ModeColorsSync(colors, options, () => mode.id);
  });
  flushSync();
  return { colors, options, sync };
}

afterEach(() => stop());

describe("ModeColorsSync", () => {
  it("keeps the mode's colors once loaded, and the options' own if it has none saved", async () => {
    const { colors, options, sync } = setup();
    await sync.load(() => {});
    expect(options.color).toEqual([0, 0, 0]);
    expect(colors.current("pixel")).toEqual({ color: [0, 0, 0], secondary: WHITE });
  });

  it("keeps the second color when only it changes", async () => {
    const { colors, options, sync } = setup();
    await sync.load(() => {});
    options.secondary = RED;
    flushSync();
    expect(colors.current("pixel")?.secondary).toEqual(RED);
  });

  it("takes the saved colors of the mode it starts in", async () => {
    const { options, sync } = setup();
    mode.id = "painting";
    flushSync();
    await sync.load(() => {});
    expect(options.color).toEqual(BLUE);
    expect(options.secondary).toEqual(GREEN);
  });

  it("keeps each mode's colors when switching, and takes the other mode's", async () => {
    const { colors, options, sync } = setup();
    await sync.load(() => {});
    options.color = RED;
    flushSync();
    expect(colors.current("pixel")?.color).toEqual(RED);
    mode.id = "painting";
    flushSync();
    expect(options.color).toEqual(BLUE);
    // The painting mode's colors change, not the pixel art mode's.
    options.color = GREEN;
    flushSync();
    expect(colors.current("painting")?.color).toEqual(GREEN);
    expect(colors.current("pixel")?.color).toEqual(RED);
    mode.id = "pixel";
    flushSync();
    expect(options.color).toEqual(RED);
  });

  it("keeps the colors of a mode without saved ones when switching to it", async () => {
    const { options, sync } = setup();
    mode.id = "painting";
    flushSync();
    await sync.load(() => {});
    mode.id = "animation";
    flushSync();
    expect(options.color).toEqual(BLUE);
  });
});
