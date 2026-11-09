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

function resolveTileOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_MAP_TILE_URL;
  if (!configured) return "https://tile.openstreetmap.org";

  try {
    const tileUrl = new URL(
      configured.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0")
    );
    return tileUrl.protocol === "https:" ? tileUrl.origin : "https://tile.openstreetmap.org";
  } catch {
    return "https://tile.openstreetmap.org";
  }
}

const tileOrigin = resolveTileOrigin();
const securityHeaders = [
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      `connect-src 'self' https://router.project-osrm.org ${tileOrigin}`,
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
