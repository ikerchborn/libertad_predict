import type { NextConfig } from "next";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
const SAFE_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function resolveApiBaseUrl(): string {
  const configured =
    process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE_URL;

  try {
    const candidate = new URL(configured);
    const hostname = candidate.hostname.toLowerCase();
    if (candidate.protocol === "https:") {
      return candidate.origin;
    }
    if (candidate.protocol === "http:" && SAFE_LOCAL_HOSTS.has(hostname)) {
      return candidate.origin;
    }
    return DEFAULT_API_BASE_URL;
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "::1"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    const apiBaseUrl = resolveApiBaseUrl();
    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
