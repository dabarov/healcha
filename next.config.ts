import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The desktop shell runs the built server from .next/standalone.
  // scripts/copy-standalone.mjs completes it (static assets + drizzle/).
  output: "standalone",
  // Drizzle + libsql are used from server components and route handlers only.
  serverExternalPackages: ["@libsql/client"],
  // cargo copies .next/standalone into src-tauri/target as bundle resources;
  // without this the next build traces files from there back into standalone.
  outputFileTracingExcludes: { "*": ["./src-tauri/**"] },
};

export default nextConfig;
