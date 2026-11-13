import type { NextConfig } from "next";

// Every page here depends on the session cookie and live vote data, so nothing is prerendered.
const nextConfig: NextConfig = {};

export default nextConfig;
