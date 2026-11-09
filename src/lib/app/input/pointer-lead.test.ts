import { describe, expect, it } from "vitest";
import { PointerLead } from "#lib/app/input/pointer-lead.js";

const at = (clientX: number, time: number, pen = true) => ({ clientX, clientY: 0, time, pen });

describe("PointerLead", () => {
  it("shows nothing before the first move", () => {
    expect(new PointerLead().frame(0, true)).toBeNull();
  });

  it("draws a moving pen ahead, in the direction it moves", () => {
    const lead = new PointerLead();
    for (let t = 0; t <= 100; t += 5) {
      lead.move(at(t, t));
    }
    const frame = lead.frame(100, true);
    expect(frame?.at.clientX).toBe(100);
    expect(frame?.ahead.clientX).toBeGreaterThan(100);
    expect(frame?.ahead.clientX).toBeLessThanOrEqual(160);
  });

  it("keeps the lead within its limit", () => {
    const lead = new PointerLead();
    for (let t = 0; t <= 100; t += 5) {
      lead.move(at(t * 100, t));
    }
    expect(lead.frame(100, true)?.ahead.clientX).toBeCloseTo(10060);
  });

  it("does not lead a mouse, nor when leading is not allowed", () => {
    const mouse = new PointerLead();
    const pen = new PointerLead();
    for (let t = 0; t <= 100; t += 5) {
      mouse.move(at(t, t, false));
      pen.move(at(t, t));
    }
    expect(mouse.frame(100, true)?.ahead.clientX).toBe(100);
    expect(pen.frame(100, false)?.ahead.clientX).toBe(100);
  });

  it("goes back under a pen that stopped, then shows nothing more", () => {
    const lead = new PointerLead();
    for (let t = 0; t <= 100; t += 5) {
      lead.move(at(t, t));
    }
    lead.frame(100, true);
    expect(lead.frame(200, true)?.ahead.clientX).toBe(100);
    expect(lead.frame(220, true)).toBeNull();
  });

  it("shows nothing once the pointer left", () => {
    const lead = new PointerLead();
    lead.move(at(10, 0));
    lead.leave();
    expect(lead.frame(0, true)).toBeNull();
  });
});
