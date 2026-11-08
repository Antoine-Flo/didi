// `npm run measure:brushes` measures every bundled brush (see brush-size.ts) and writes
// brush-sizes.json. Otherwise, checks that none is missing from it.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_BRUSHES, curvesSizeFactor } from "./brushes";
import MEASURED_SIZES from "./brush-sizes.json";
import { measureSizeFactor } from "./brush-size";
import { loadMyPaint } from "./engine";

const measuring = process.env.DIDI_MEASURE === "1";

describe("brush sizes", () => {
  it.runIf(measuring)(
    "measures every bundled brush",
    async () => {
      const mp = await loadMyPaint();
      const sizes: Record<string, number> = {};
      for (const b of BUNDLED_BRUSHES) {
        const factor = measureSizeFactor(mp, b.myb, curvesSizeFactor(b.myb));
        sizes[b.id] = Math.round(factor * 100) / 100;
      }
      writeFileSync(join(__dirname, "brush-sizes.json"), JSON.stringify(sizes, null, 2) + "\n");
    },
    600_000,
  );

  it.skipIf(measuring)("knows the size of every bundled brush", () => {
    const missing = BUNDLED_BRUSHES.filter((b) => !(b.id in MEASURED_SIZES)).map((b) => b.id);
    expect(missing, "run npm run measure:brushes").toEqual([]);
  });
});
