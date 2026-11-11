// The page listing the testers' builds (alpha/index.html), from alpha/releases.json: a list
// per platform, the newest first. Plain HTML: written by release-alpha.mjs at each release.

const PLATFORMS = [
  { name: "Linux", test: (file) => file.endsWith(".AppImage") },
  { name: "Windows", test: (file) => file.endsWith(".exe") },
];

/** The processor a build is for, from its name (Tauri's: _amd64, _x64, _aarch64, _arm64). */
const arch = (file) => (/_(aarch64|arm64)[._-]/.test(file) ? "ARM64" : "x64");

const escape = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const day = (date) => new Date(date).toLocaleString("en-US", { dateStyle: "medium" });

function platform({ name, test }, releases) {
  const items = releases.flatMap((release, i) =>
    release.files.filter(test).map((file) => {
      const latest = i === 0 ? ' <span class="tag">Latest</span>' : "";
      const link = `<a href="${escape(file)}">${escape(release.version)}</a>`;
      return `<li>${link} ${arch(file)} · ${day(release.date)}${latest}</li>`;
    }),
  );
  return items.length ? `<h2>${name}</h2>\n<ul>\n${items.join("\n")}\n</ul>` : "";
}

/** The page, for `releases` (the newest first). */
export function releasesPage(releases) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Didi releases</title>
<style>
  body { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; font: 15px/1.6 system-ui, sans-serif; color: #d4d4d4; background: #1c1c1c; }
  a { color: #7a9cc6; }
  li { color: #9a9a9a; }
  .tag { margin-left: 0.4rem; padding: 0 0.4rem; font-size: 0.8em; color: #7a9cc6; border: 1px solid #7a9cc6; border-radius: 4px; }
</style>
</head>
<body>
<h1>Didi releases</h1>
${PLATFORMS.map((p) => platform(p, releases)).join("\n")}
</body>
</html>
`;
}
