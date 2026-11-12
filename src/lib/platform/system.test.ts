import { describe, expect, it } from "vitest";
import { browserOf, osOf } from "#lib/platform/system.js";

const agents = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  webkitGtk: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)",
};

describe("system info", () => {
  it("names the system", () => {
    expect(osOf(agents.chromeWindows)).toBe("windows");
    expect(osOf(agents.firefoxLinux)).toBe("linux");
    expect(osOf(agents.safariMac)).toBe("macos");
    expect(osOf(agents.safariIphone)).toBe("ios");
    expect(osOf(agents.chromeAndroid)).toBe("android");
    expect(osOf(agents.webkitGtk)).toBe("linux");
    expect(osOf("")).toBe("");
  });

  it("names the browser, though most say Chrome and Safari", () => {
    expect(browserOf(agents.chromeWindows)).toBe("chrome");
    expect(browserOf(agents.edge)).toBe("edge");
    expect(browserOf(agents.firefoxLinux)).toBe("firefox");
    expect(browserOf(agents.safariMac)).toBe("safari");
    expect(browserOf(agents.safariIphone)).toBe("safari");
    expect(browserOf(agents.chromeAndroid)).toBe("chrome");
    expect(browserOf("")).toBe("");
  });
});
