import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Dev only: `next dev` blocks its scripts for any host but localhost, so a
  // phone opening http://<pc-ip>:8081 got the page shell but no data. List
  // extra hosts in DEV_ALLOWED_ORIGINS, comma-separated; one wildcard label
  // is allowed, e.g. "192.168.1.*" for a whole home network.
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  poweredByHeader: false,
  // Hardening for a publicly reachable instance. Posters come from Jellylens
  // itself and image.tmdb.org, so no script/img CSP is set; framing is shut
  // off entirely (clickjacking). HSTS only takes effect over HTTPS.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
