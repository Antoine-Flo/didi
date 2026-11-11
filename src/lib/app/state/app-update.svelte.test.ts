import { describe, expect, it, vi } from "vitest";
import { AppUpdate, type UpdateHost } from "#lib/app/state/app-update.svelte.js";
import type { MessageAction, MessageLevel } from "#lib/app/state/messages.svelte.js";
import type { AvailableUpdate } from "#lib/platform/updater.js";

interface Shown {
  text: string;
  level: MessageLevel;
  action?: MessageAction;
}

function setup(update: AvailableUpdate | null, options: { start?: boolean; quit?: boolean } = {}) {
  const shown: Shown[] = [];
  let startScreen = options.start ?? false;
  const host: UpdateHost = {
    find: async () => update,
    startScreenOpen: () => startScreen,
    notify: (text, level, action) => shown.push({ text, level, action }),
    prepareToQuit: vi.fn(async () => options.quit ?? true),
    restart: vi.fn(async () => {}),
  };
  return {
    app: new AppUpdate(host),
    host,
    shown,
    closeStartScreen: () => (startScreen = false),
  };
}

function fakeUpdate(record: (busy: string | null) => void = () => {}, fail?: Error) {
  let app: AppUpdate | null = null;
  const update = {
    version: "0.1.0-alpha.3",
    currentVersion: "0.1.0-alpha.1",
    notes: JSON.stringify([
      { version: "0.1.0-alpha.3", date: "2026-11-11", notes: ["Three"] },
      { version: "0.1.0-alpha.2", date: "2026-11-10", notes: ["Two"] },
      { version: "0.1.0-alpha.1", date: "2026-11-09", notes: ["One"] },
    ]),
    download: vi.fn(async (onProgress: (done: number | null) => void) => {
      record(app!.busy);
      onProgress(0.5);
      record(app!.busy);
    }),
    install: vi.fn(async () => {
      record(app!.busy);
      if (fail) {
        throw fail;
      }
    }),
  } satisfies AvailableUpdate;
  return { update, follow: (a: AppUpdate) => (app = a) };
}

describe("AppUpdate", () => {
  it("offers nothing without a newer version, or when it can't check", async () => {
    const none = setup(null);
    await none.app.check();
    expect(none.app.offer).toBeNull();
    expect(none.shown).toEqual([]);

    const offline = setup(null);
    offline.host.find = async () => {
      throw new Error("offline");
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await offline.app.check();
    expect(offline.app.offer).toBeNull();
    expect(offline.shown).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("offers it in the start screen, with what changed since the version running", async () => {
    const t = setup(fakeUpdate().update, { start: true });
    await t.app.check();
    expect(t.app.offer).toEqual({
      version: "0.1.0-alpha.3",
      currentVersion: "0.1.0-alpha.1",
      releases: [
        { version: "0.1.0-alpha.3", date: "2026-11-11", notes: ["Three"] },
        { version: "0.1.0-alpha.2", date: "2026-11-10", notes: ["Two"] },
      ],
    });
    expect(t.shown).toEqual([]);
  });

  it("offers it in a message if the start screen is closed", async () => {
    const t = setup(fakeUpdate().update);
    await t.app.check();
    expect(t.shown).toHaveLength(1);
    expect(t.shown[0].text).toContain("0.1.0-alpha.3");
    expect(t.shown[0].action).toBeDefined();
  });

  it("downloads, installs and restarts", async () => {
    const busy: (string | null)[] = [];
    const { update, follow } = fakeUpdate((b) => busy.push(b));
    const t = setup(update, { start: true });
    follow(t.app);
    await t.app.check();
    await t.app.install();
    expect(busy).toEqual([
      "Downloading the update…",
      "Downloading the update… 50%",
      "Installing the update…",
    ]);
    expect(t.host.prepareToQuit).toHaveBeenCalledOnce();
    expect(update.install).toHaveBeenCalledOnce();
    expect(t.host.restart).toHaveBeenCalledOnce();
    expect(t.app.busy).toBeNull();
  });

  it("keeps it downloaded if the user cancels saving, and offers it again", async () => {
    const { update, follow } = fakeUpdate();
    const t = setup(update, { start: true, quit: false });
    follow(t.app);
    await t.app.check();
    t.closeStartScreen();
    await t.app.install();
    expect(update.install).not.toHaveBeenCalled();
    expect(t.shown).toHaveLength(1);
    t.host.prepareToQuit = vi.fn(async () => true);
    t.shown[0].action!.run();
    await vi.waitFor(() => expect(t.host.restart).toHaveBeenCalledOnce());
    expect(update.download).toHaveBeenCalledOnce();
  });

  it("shows an error if the update fails", async () => {
    const { update, follow } = fakeUpdate(() => {}, new Error("bad signature"));
    const t = setup(update, { start: true });
    follow(t.app);
    await t.app.check();
    await t.app.install();
    expect(t.shown.at(-1)).toMatchObject({ level: "error" });
    expect(t.shown.at(-1)!.text).toContain("bad signature");
    expect(t.host.restart).not.toHaveBeenCalled();
    expect(t.app.busy).toBeNull();
  });
});
