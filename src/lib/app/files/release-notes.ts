// What changed in each version, as published by tools/build/release-alpha.mjs in the notes of
// alpha/latest.json: the latest versions as JSON, the newest first. An update shows those
// after the version running, so that skipping versions misses nothing.

export interface ReleaseNotes {
  version: string;
  /** When it was published, in ISO 8601. */
  date: string;
  /** One line per change. */
  notes: string[];
}

const isRelease = (value: unknown): value is ReleaseNotes => {
  const r = value as ReleaseNotes;
  return (
    typeof r === "object" &&
    r !== null &&
    typeof r.version === "string" &&
    typeof r.date === "string" &&
    Array.isArray(r.notes) &&
    r.notes.every((line) => typeof line === "string")
  );
};

/**
 * The versions after `current`, the newest first, read from the notes published. If the
 * running version is not among them (too old), all of them. Plain text notes (not from the
 * release script) are the latest version's.
 */
export function notesSince(text: string, latest: string, current: string): ReleaseNotes[] {
  let releases: ReleaseNotes[];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || !parsed.every(isRelease)) {
      throw new Error("not release notes");
    }
    releases = parsed;
  } catch {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length ? [{ version: latest, date: "", notes: lines }] : [];
  }
  const installed = releases.findIndex((release) => release.version === current);
  return (installed < 0 ? releases : releases.slice(0, installed)).filter(
    (release) => release.notes.length > 0,
  );
}
