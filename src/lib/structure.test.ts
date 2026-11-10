// The code's layout rules (see doc/DEVELOPPEMENT.md, Organisation), checked on every file of
// src/: one kind of file per folder, components only in ui/ folders, at most 400 lines per
// source file, imports through #lib.

import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");
const MAX_LINES = 400;
/** Generated or data: not code written here. */
const SKIPPED = ["lib/paraglide", "lib/mypaint/brushes"];
/** Kept as they are: the compiled libmypaint, and its types beside it. */
const NOT_CODE = ["lib/mypaint/wasm/libmypaint.mjs", "lib/mypaint/wasm/libmypaint.d.mts"];

/** Every file under src/, by folder (relative to src/). */
function folders(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const walk = (dir: string) => {
    const rel = relative(SRC, dir);
    if (SKIPPED.includes(rel)) {
      return;
    }
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name));
      } else {
        files.push(entry.name);
      }
    }
    found.set(rel, files);
  };
  walk(SRC);
  return found;
}

/** A file's kind: its extension, a test or a runes module being TypeScript too. */
function kind(name: string): string {
  if (name.endsWith(".d.mts")) {
    return ".mjs";
  }
  return extname(name);
}

const all = folders();
const files = [...all].flatMap(([folder, names]) => names.map((name) => join(folder, name)));
const isUi = (folder: string) => /(^|\/)ui(\/|$)/.test(folder);

describe("the code's layout", () => {
  it("has one kind of file per folder in src/lib", () => {
    const mixed = [...all]
      .filter(([folder]) => folder.startsWith("lib"))
      .map(([folder, names]) => [folder, [...new Set(names.map(kind))].sort()] as const)
      .filter(([, kinds]) => kinds.length > 1)
      .map(([folder, kinds]) => `${folder}: ${kinds.join(" ")}`);
    expect(mixed).toEqual([]);
  });

  it("has components only in ui/ folders, and no TypeScript in them", () => {
    const misplaced = files.filter((file) => {
      if (!file.startsWith("lib/")) {
        return false;
      }
      const folder = file.slice(0, file.lastIndexOf("/"));
      return file.endsWith(".svelte") ? !isUi(folder) : isUi(folder);
    });
    expect(misplaced).toEqual([]);
  });

  it(`has at most ${MAX_LINES} lines per source file, tests aside`, () => {
    const long = files
      .filter((file) => /\.(ts|svelte|js|mjs|css)$/.test(file) && !file.endsWith(".test.ts"))
      .filter((file) => !NOT_CODE.includes(file))
      .map((file) => [file, readFileSync(join(SRC, file), "utf8").split("\n").length - 1] as const)
      .filter(([, lines]) => lines > MAX_LINES)
      .map(([file, lines]) => `${file}: ${lines}`);
    expect(long).toEqual([]);
  });

  it("imports through #lib, never by a relative path", () => {
    const relativeImport = /(?:from|import)\s*\(?\s*"\.{1,2}\//;
    const found = files
      .filter((file) => /\.(ts|svelte)$/.test(file))
      .filter((file) => relativeImport.test(readFileSync(join(SRC, file), "utf8")));
    expect(found).toEqual([]);
  });
});
