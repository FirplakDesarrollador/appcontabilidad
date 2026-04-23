import type { NextConfig } from "next";

// SAP Service Layer uses a self-signed certificate.
// This MUST be set at startup — setting it inside API routes is too late for Node v24 + Turbopack.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const nextConfig: any = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
