import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drizzle + libsql are used from server components and route handlers only.
  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;
