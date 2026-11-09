// Compares Didi's brush engine with MyPaint's own code, on the same stroke events.
//
// Runs only with `npm run compare:brushes` and MyPaint installed as a system package
// (tools/brush-compare/mypaint_render.py drives its Python library). Writes a side by side
// sheet (Didi | MyPaint | difference) to tools/brush-compare/out/sheet.png.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { Drawing } from "#lib/core/document/drawing.js";
import { bundledBrush } from "./brushes";
import { loadMyPaint, MyPaintStroke } from "./engine";

const ROOT = resolve(__dirname, "../../..");
const TOOL = join(ROOT, "tools/brush-compare");
const enabled = process.env.DIDI_COMPARE === "1" && existsSync("/usr/lib64/mypaint/lib");

type RGBA = [number, number, number, number];
/** [dtime, x, y, pressure, xtilt, ytilt, viewzoom, viewrotation], like MyPaint's strokes. */
type Event = [number, number, number, number, number, number, number, number];

interface Case {
  label: string;
  brush: string;
  brushFile: string;
  color: [number, number, number];
  size?: number;
  width: number;
  height: number;
  background?: RGBA;
  backgroundRight?: RGBA;
  events: Event[];
}

const W = 320;
const H = 90;

/** A wavy stroke across the cell, sampled at 200 Hz, with the given pressure profile. */
function wave(pressure: (t: number) => number): Event[] {
  const events: Event[] = [[10, 20, H / 2, 0, 0, 0, 1, 0]];
  const n = 140;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    events.push([
      0.005,
      20 + t * (W - 40),
      H / 2 + Math.sin(t * Math.PI * 2) * 18,
      pressure(t),
      0,
      0,
      1,
      0,
    ]);
  }
  return events;
}

const PRESSURES: [string, (t: number) => number][] = [
  ["0.25", () => 0.25],
  ["0.6", () => 0.6],
  ["1.0", () => 1],
  ["0→1→0", (t) => Math.sin(t * Math.PI)],
];

function cases(): Case[] {
  const list: Case[] = [];
  const add = (brush: string, extra: Partial<Case> = {}) => {
    for (const [name, p] of PRESSURES) {
      list.push({
        label: `${brush} p=${name}`,
        brush,
        brushFile: join(ROOT, `src/lib/mypaint/brushes/${brush}.myb`),
        color: [30, 30, 40],
        width: W,
        height: H,
        events: wave(p),
        ...extra,
      });
    }
  };
  add("classic/pencil");
  add("deevad/2B_pencil");
  add("classic/charcoal");
  add("deevad/basic_digital_brush");
  add("deevad/liner");
  add("deevad/blending", { background: [220, 30, 30, 255], backgroundRight: [30, 40, 200, 255] });
  add("deevad/watercolor_glazing", { background: [255, 255, 255, 255] });
  return list;
}

async function renderDidi(c: Case): Promise<Uint8ClampedArray> {
  const mp = await loadMyPaint();
  const drawing = new Drawing(c.width, c.height);
  const layer = drawing.createLayer();
  drawing.addLayer(layer);
  if (c.background) {
    for (const [x, color] of [
      [0, c.background],
      [c.width / 2, c.backgroundRight ?? c.background],
    ] as const) {
      const rect = { x, y: 0, width: c.width / 2, height: c.height };
      const data = new Uint8ClampedArray(rect.width * rect.height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data.set(color, i);
      }
      drawing.writePixels(layer.id, rect, data);
    }
  }
  const brush = mp.createBrush(bundledBrush(c.brush).myb);
  if (c.size) {
    brush.size = c.size;
  }
  brush.setColor(c.color);
  const stroke = new MyPaintStroke(mp, brush, drawing, layer.id);
  for (const [dtime, x, y, pressure, xtilt, ytilt, zoom, rotation] of c.events) {
    stroke.view = { zoom, rotation };
    stroke.strokeTo(x, y, pressure, xtilt * 90, ytilt * 90, dtime);
  }
  stroke.finish("x");
  brush.destroy();
  return drawing
    .getLayer(layer.id)
    .tiles.readRegion({ x: 0, y: 0, width: c.width, height: c.height });
}

/** Total opacity ("ink") of an image, to compare how much each engine painted. */
function ink(rgba: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    sum += rgba[i];
  }
  return sum / 255;
}

describe.runIf(enabled)("Didi vs MyPaint", () => {
  it("renders the same strokes", { timeout: 120000 }, async () => {
    const list = cases();
    const dir = mkdtempSync(join(tmpdir(), "didi-compare-"));
    writeFileSync(join(dir, "cases.json"), JSON.stringify(list));
    execFileSync("python3", ["-I", join(TOOL, "mypaint_render.py"), join(dir, "cases.json"), dir]);

    const rows: Uint8ClampedArray[] = [];
    const report: string[] = [];
    for (const [i, c] of list.entries()) {
      const ours = await renderDidi(c);
      const theirs = new Uint8ClampedArray(readFileSync(join(dir, `${i}.rgba`)));
      let maxDiff = 0;
      let sumDiff = 0;
      const diff = new Uint8ClampedArray(ours.length);
      for (let p = 0; p < ours.length; p += 4) {
        let d = 0;
        for (let k = 0; k < 4; k++) {
          d = Math.max(d, Math.abs(ours[p + k] - theirs[p + k]));
        }
        maxDiff = Math.max(maxDiff, d);
        sumDiff += d;
        diff.set([255, 0, 0, Math.min(255, d * 4)], p);
      }
      const ratio = ink(ours) / Math.max(1, ink(theirs));
      report.push(
        `${c.label.padEnd(40)} ink Didi/MyPaint ${ratio.toFixed(2)}  max diff ${String(maxDiff).padStart(3)}  mean ${(sumDiff / (ours.length / 4)).toFixed(2)}`,
      );
      rows.push(sheetRow(c, [ours, theirs, diff]));
    }
    mkdirSync(join(TOOL, "out"), { recursive: true });
    writeFileSync(join(TOOL, "out/sheet.png"), png(W * 3, H * list.length, concatRows(rows)));
    console.log("COMPARE\n" + report.join("\n"));
    expect(rows.length).toBe(list.length);
  });
});

/** One row of the sheet: the three images side by side, over white, with separators. */
function sheetRow(c: Case, images: Uint8ClampedArray[]): Uint8ClampedArray {
  const row = new Uint8ClampedArray(W * 3 * H * 4);
  images.forEach((img, col) => {
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const s = (y * c.width + x) * 4;
        const o = (y * W * 3 + col * W + x) * 4;
        const a = img[s + 3] / 255;
        for (let k = 0; k < 3; k++) {
          row[o + k] = img[s + k] + 255 * (1 - a);
        }
        row[o + 3] = 255;
        if (x === 0 || y === 0) {
          row.set([180, 180, 180, 255], o);
        }
      }
    }
  });
  return row;
}

function concatRows(rows: Uint8ClampedArray[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rows.reduce((n, r) => n + r.length, 0));
  let offset = 0;
  for (const r of rows) {
    out.set(r, offset);
    offset += r.length;
  }
  return out;
}

function png(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) {
      c = table[(c ^ x) & 255] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
      raw,
      y * (width * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
