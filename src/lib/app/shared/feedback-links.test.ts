import { describe, expect, it } from "vitest";
import {
  BUG_FORM,
  bugReportUrl,
  FEEDBACK_FORM,
  feedbackUrl,
  type EditorFacts,
} from "#lib/app/shared/feedback-links.js";

const web = { source: "web", browser: "firefox", os: "linux" };
const desktop = { source: "windows", browser: "", os: "windows" };
const facts: EditorFacts = {
  input: "pen",
  mode: "pixel",
  tool: "brush",
  doc: "64x64, 3 layers",
  screen: "1280x800@2",
  layout: "normal",
  error: "",
};

const fields = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe("feedback links", () => {
  it("tell the feedback form the version and where it runs", () => {
    const url = feedbackUrl("0.1.0-alpha.3", web);
    expect(url.startsWith(FEEDBACK_FORM)).toBe(true);
    expect(fields(url)).toEqual({ version: "0.1.0-alpha.3", source: "web", browser: "firefox" });
  });

  it("leave out what is unknown, e.g. the browser of the desktop app", () => {
    expect(fields(feedbackUrl("1.0.0", desktop))).toEqual({ version: "1.0.0", source: "windows" });
  });

  it("tell the bug form about the editor too", () => {
    const url = bugReportUrl("1.0.0", web, facts);
    expect(url.startsWith(BUG_FORM)).toBe(true);
    expect(fields(url)).toEqual({
      version: "1.0.0",
      source: "web",
      browser: "firefox",
      os: "linux",
      input: "pen",
      mode: "pixel",
      tool: "brush",
      doc: "64x64, 3 layers",
      screen: "1280x800@2",
      layout: "normal",
    });
  });

  it("encode the last error, cut if long", () => {
    const error = "Could not save “a & b.didi”: denied? " + "x".repeat(500);
    const told = fields(bugReportUrl("1.0.0", desktop, { ...facts, error })).error;
    expect(told).toBe(error.slice(0, 300));
  });
});
