import { describe, expect, it } from "vitest";
import { createToolRegistry } from "#lib/app/tools/builtin.js";
import { createModeRegistry } from "./builtin";
import { DEFAULT_MODE } from "./mode";

describe("modes", () => {
  const modes = createModeRegistry();
  const tools = createToolRegistry();

  it("only name registered tools", () => {
    for (const mode of modes.list()) {
      expect(mode.tools.length, mode.id).toBeGreaterThan(0);
      for (const id of [...mode.tools, mode.eraserTool]) expect(tools.has(id), id).toBe(true);
    }
  });

  it("fall back to the default mode for unknown or missing ids", () => {
    expect(modes.resolve("pixel").id).toBe("pixel");
    expect(modes.resolve("from-a-missing-plugin").id).toBe(DEFAULT_MODE);
    expect(modes.resolve(null).id).toBe(DEFAULT_MODE);
  });
});
