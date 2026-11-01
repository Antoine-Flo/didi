import { describe, expect, it } from "vitest";
import { takesText } from "./keyboard";

describe("takesText", () => {
  it("is true for fields where text is typed", () => {
    expect(takesText("INPUT", null)).toBe(true);
    expect(takesText("INPUT", "text")).toBe(true);
    expect(takesText("INPUT", "number")).toBe(true);
    expect(takesText("INPUT", "search")).toBe(true);
    expect(takesText("TEXTAREA", null)).toBe(true);
    expect(takesText("SELECT", null)).toBe(true);
  });

  it("is false for sliders, checkboxes and other inputs without text", () => {
    expect(takesText("INPUT", "range")).toBe(false);
    expect(takesText("INPUT", "checkbox")).toBe(false);
    expect(takesText("INPUT", "radio")).toBe(false);
    expect(takesText("INPUT", "color")).toBe(false);
    expect(takesText("INPUT", "file")).toBe(false);
  });

  it("reads tag names and types in any case, unknown types as text", () => {
    expect(takesText("input", "RANGE")).toBe(false);
    expect(takesText("INPUT", "unknown")).toBe(true);
  });
});
