import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";

/**
 * Downloads the official Node.js runtime for this platform into
 * src-tauri/binaries/, where tauri bundles it next to the app binary
 * (externalBin). This is what makes the packaged app self-contained —
 * users don't need Node installed.
 *
 * Tauri expects sidecar files suffixed with the Rust target triple.
 */

const NODE_VERSION = "22.14.0";

const TRIPLES = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "win32-x64": "x86_64-pc-windows-msvc",
};

const key = `${process.platform}-${process.arch}`;
const triple = process.env.NODE_TRIPLE_OVERRIDE || TRIPLES[key];
if (!triple) {
  console.error(`No target triple mapping for ${key}`);
  process.exit(1);
}

const isWindows = process.platform === "win32";
const dest = join("src-tauri", "binaries", `node-${triple}${isWindows ? ".exe" : ""}`);
if (existsSync(dest)) {
  console.log(`Bundled Node runtime already present: ${dest}`);
  process.exit(0);
}

const dist = isWindows
  ? `node-v${NODE_VERSION}-win-${process.arch}`
  : `node-v${NODE_VERSION}-${process.platform}-${process.arch}`;
const archive = `${dist}.${isWindows ? "zip" : "tar.gz"}`;
const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archive}`;

console.log(`Downloading ${url} …`);
const res = await fetch(url);
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}

const tmp = join("src-tauri", "binaries", ".tmp");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, archive), Buffer.from(await res.arrayBuffer()));

// tar handles .tar.gz everywhere and .zip on Windows (bsdtar).
execFileSync("tar", ["-xf", archive], { cwd: tmp });
cpSync(join(tmp, dist, isWindows ? "node.exe" : "bin/node"), dest);
if (!isWindows) chmodSync(dest, 0o755);
rmSync(tmp, { recursive: true, force: true });
console.log(`Bundled Node ${NODE_VERSION} → ${dest}`);
