import { describe, expect, it } from "vitest";
import { MAX_RECENT, parseRecent, withRecent, type RecentFile } from "#lib/app/files/recent.js";

const file = (path: string, time = 1): RecentFile => ({ path, name: path, thumbnail: "", time });

describe("recent files", () => {
  it("puts the latest file first, once, and keeps at most MAX_RECENT", () => {
    let list: RecentFile[] = [];
    for (let i = 0; i < MAX_RECENT + 3; i++) {
      list = withRecent(list, file(`/f${i}`));
    }
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].path).toBe(`/f${MAX_RECENT + 2}`);
    list = withRecent(list, file("/f5", 99));
    expect(list[0]).toMatchObject({ path: "/f5", time: 99 });
    expect(list.filter((f) => f.path === "/f5")).toHaveLength(1);
  });

  it("reads saved lists, and ignores invalid ones", () => {
    const valid = JSON.stringify({ version: 1, files: [file("/a"), { path: 3 }, file("/b")] });
    expect(parseRecent(valid).map((f) => f.path)).toEqual(["/a", "/b"]);
    for (const text of ["", "{", "null", '{"version": 2, "files": []}', '{"version": 1}']) {
      expect(parseRecent(text)).toEqual([]);
    }
  });
});
