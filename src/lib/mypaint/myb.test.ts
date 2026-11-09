import { describe, expect, it } from "vitest";
import { parseMyb } from "#lib/mypaint/myb.js";

describe("brush files", () => {
  it("rejects invalid brush files", () => {
    expect(() => parseMyb('{"version": 2, "settings": {}}')).toThrow();
    expect(() => parseMyb('{"version": 3}')).toThrow();
    expect(() => parseMyb('{"version": 3, "settings": {"x": {"base_value": 1}}}')).toThrow();
    expect(() =>
      parseMyb(
        '{"version": 3, "settings": {"x": {"base_value": 1, "inputs": {"pressure": [[0]]}}}}',
      ),
    ).toThrow();
  });
});
