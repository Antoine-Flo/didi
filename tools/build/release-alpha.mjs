// Publishes a testers' build: the next alpha version (0.1.0-alpha.1, .2…, after the version in
// tauri.conf.json), built with the updater, signed, uploaded to the R2 bucket served at
// releases.didipaint.com, then announced in alpha/latest.json, which the installed apps read
// at start.
//
// The last 10 versions stay downloadable, listed in alpha/releases.json (the newest first);
// older ones are removed. Their notes go with the update, so that the app shows what changed
// since the version it runs. They are also listed in alpha/index.html, the page given to the
// testers (see releases-page.mjs).
//
//   npm run release:alpha                      notes: the commits since the last release
//   npm run release:alpha -- "What changed"    notes written instead (one per line)
//   npm run release:alpha -- --page            only writes the page again, no release
//
// The key is read from ~/.tauri/didi.key. Linux only for now (the AppImage).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { releasesPage } from "./releases-page.mjs";

const ROOT = join(import.meta.dirname, "../..");
const BUCKET = "didi-r2";
const BASE_URL = "https://releases.didipaint.com/alpha";
const KEY_FILE = join(homedir(), ".tauri/didi.key");
const KEEP = 10;

const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: ROOT, stdio: "inherit", ...options });
const git = (...args) => execFileSync("git", args, { cwd: ROOT }).toString().trim();

const r2 = {
  /** An object's text, or null if there is none. */
  get(key) {
    try {
      return execFileSync(
        "npx",
        ["wrangler", "r2", "object", "get", `${BUCKET}/${key}`, "--pipe", "--remote"],
        { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] },
      ).toString();
    } catch {
      return null;
    }
  },
  putFile(key, file) {
    run("npx", [
      "wrangler",
      "r2",
      "object",
      "put",
      `${BUCKET}/${key}`,
      "--file",
      file,
      "--content-type",
      "application/octet-stream",
      "--remote",
    ]);
  },
  putJson(key, value) {
    this.putText(key, JSON.stringify(value, null, 2), "application/json");
  },
  putText(key, text, type) {
    run(
      "npx",
      [
        "wrangler",
        "r2",
        "object",
        "put",
        `${BUCKET}/${key}`,
        "--pipe",
        "--content-type",
        type,
        "--cache-control",
        "no-cache",
        "--remote",
      ],
      { input: text, stdio: ["pipe", "inherit", "inherit"] },
    );
  },
  delete(key) {
    run("npx", ["wrangler", "r2", "object", "delete", `${BUCKET}/${key}`, "--remote"]);
  },
};

/**
 * The versions published, the newest first: { version, date, commit, notes, files }. Before
 * releases.json existed, only the one in latest.json.
 */
function published() {
  const history = r2.get("alpha/releases.json");
  if (history) {
    return JSON.parse(history);
  }
  const latest = JSON.parse(r2.get("alpha/latest.json") ?? "null");
  if (!latest) {
    return [];
  }
  const files = Object.values(latest.platforms).map(({ url }) => url.slice(BASE_URL.length + 1));
  return [{ version: latest.version, date: latest.pub_date, commit: null, notes: [], files }];
}

/** The alpha after `previous`, on the version of tauri.conf.json. */
function nextVersion(previous) {
  const config = JSON.parse(readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
  const base = config.version.split("-")[0];
  const match = previous?.match(/^(.+)-alpha\.(\d+)$/);
  const n = match && match[1] === base ? Number(match[2]) + 1 : 1;
  return `${base}-alpha.${n}`;
}

/** The notes given, or the commits since the previous release. */
function releaseNotes(given, previousCommit) {
  if (given !== undefined) {
    return given
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (git("status", "--porcelain")) {
    console.warn("Uncommitted changes: they are released, but not in the notes.");
  }
  if (!previousCommit) {
    return [];
  }
  const log = git("log", "--no-merges", "--format=%s", `${previousCommit}..HEAD`);
  return log ? log.split("\n") : [];
}

async function signingKey() {
  const env = { ...process.env };
  if (!env.TAURI_SIGNING_PRIVATE_KEY) {
    if (!existsSync(KEY_FILE)) {
      throw new Error(`No signing key: set TAURI_SIGNING_PRIVATE_KEY or create ${KEY_FILE}`);
    }
    env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(KEY_FILE, "utf8");
  }
  if (env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = await prompt.question(
      "Signing key password (empty if none): ",
    );
    prompt.close();
  }
  return env;
}

const putPage = (releases) =>
  r2.putText("alpha/index.html", releasesPage(releases), "text/html; charset=utf-8");

if (process.argv[2] === "--page") {
  putPage(published());
  console.log(`\nPage written: ${BASE_URL}/index.html`);
  process.exit(0);
}

const env = await signingKey();
const history = published();
const version = nextVersion(history[0]?.version);
const notes = releaseNotes(process.argv[2], history[0]?.commit);
console.log(`Releasing ${version} (published: ${history[0]?.version ?? "none"})`);
console.log(notes.length ? notes.map((line) => `  - ${line}`).join("\n") : "  (no notes)");

run("tools/build/linux.sh", ["--updater", "--config", JSON.stringify({ version })], { env });

const bundle = join(ROOT, "src-tauri/target/container/release/bundle/appimage");
const appImage = `didi_${version}_amd64.AppImage`;
r2.putFile(`alpha/${appImage}`, join(bundle, appImage));

const release = {
  version,
  date: new Date().toISOString(),
  commit: git("rev-parse", "HEAD"),
  notes,
  files: [appImage],
};
const kept = [release, ...history].slice(0, KEEP);
const dropped = [release, ...history].slice(KEEP);

// The notes of the versions kept go with the update: see src/lib/app/files/release-notes.ts.
r2.putJson("alpha/releases.json", kept);
r2.putJson("alpha/latest.json", {
  version,
  notes: JSON.stringify(kept.map(({ version, date, notes }) => ({ version, date, notes }))),
  pub_date: release.date,
  platforms: {
    "linux-x86_64": {
      signature: readFileSync(join(bundle, `${appImage}.sig`), "utf8"),
      url: `${BASE_URL}/${appImage}`,
    },
  },
});

putPage(kept);

for (const old of dropped) {
  for (const file of old.files) {
    r2.delete(`alpha/${file}`);
  }
}

console.log(`\nPublished ${version}: ${BASE_URL}/index.html`);
