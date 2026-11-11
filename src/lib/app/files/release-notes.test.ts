import { describe, expect, it } from "vitest";
import { notesSince } from "#lib/app/files/release-notes.js";

const releases = [
  { version: "0.1.0-alpha.4", date: "2026-11-12", notes: ["Four"] },
  { version: "0.1.0-alpha.3", date: "2026-11-11", notes: [] },
  { version: "0.1.0-alpha.2", date: "2026-11-10", notes: ["Two"] },
  { version: "0.1.0-alpha.1", date: "2026-11-09", notes: ["One"] },
];
const text = JSON.stringify(releases);

describe("notesSince", () => {
  it("keeps the versions after the one running, with notes", () => {
    expect(notesSince(text, "0.1.0-alpha.4", "0.1.0-alpha.2")).toEqual([releases[0]]);
    expect(notesSince(text, "0.1.0-alpha.4", "0.1.0-alpha.1")).toEqual([releases[0], releases[2]]);
  });

  it("keeps them all if the version running is older than those published", () => {
    expect(notesSince(text, "0.1.0-alpha.4", "0.0.9")).toEqual([
      releases[0],
      releases[2],
      releases[3],
    ]);
  });

  it("reads plain text as the latest version's notes, one per line", () => {
    expect(notesSince("Fix the fill tool\n\n Faster brushes ", "0.2.0", "0.1.0")).toEqual([
      { version: "0.2.0", date: "", notes: ["Fix the fill tool", "Faster brushes"] },
    ]);
    expect(notesSince("", "0.2.0", "0.1.0")).toEqual([]);
    expect(notesSince('[{"version": 1}]', "0.2.0", "0.1.0")).toEqual([
      { version: "0.2.0", date: "", notes: ['[{"version": 1}]'] },
    ]);
  });
});
