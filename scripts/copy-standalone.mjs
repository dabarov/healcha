import { cpSync, existsSync, lstatSync, readdirSync, readlinkSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";

// Next's standalone output omits static assets and non-traced folders; the
// desktop shell serves everything from .next/standalone, so complete it.
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
cpSync("drizzle", ".next/standalone/drizzle", { recursive: true });

// next build copies .env* into the standalone output. The desktop bundle is
// the only consumer of this folder and reads its config from the app-data
// dir — shipping the developer's real keys inside the app would be a leak.
for (const f of readdirSync(".next/standalone")) {
  if (f.startsWith(".env")) rmSync(`.next/standalone/${f}`);
}

// The tracer still pulls tsconfig.json copies out of src-tauri/target (the
// previous build's bundled resources) despite outputFileTracingExcludes,
// nesting one level deeper per local rebuild. Nothing under src-tauri is
// needed at runtime, so drop it outright.
rmSync(".next/standalone/src-tauri", { recursive: true, force: true });

// Turbopack externalizes native packages via alias symlinks (e.g.
// .next/node_modules/@libsql/client-<hash> -> node_modules/@libsql/client).
// Tauri's resource bundler drops symlinks, so materialize them as copies.
function materializeSymlinks(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = resolve(dirname(p), readlinkSync(p));
      rmSync(p);
      cpSync(target, p, { recursive: true });
      console.log(`Materialized symlink: ${p}`);
    } else if (entry.isDirectory()) {
      materializeSymlinks(p);
    }
  }
}
materializeSymlinks(".next/standalone");

console.log("Completed .next/standalone (static assets, drizzle migrations, no .env).");
