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
};

export default nextConfig;
