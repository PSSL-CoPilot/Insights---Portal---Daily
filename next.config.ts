import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The workbook is read from disk with `fs` on the server, so keep xlsx out of the bundle.
  serverExternalPackages: ["xlsx"],
  reactStrictMode: true,
  // Static export for GitHub Pages; the workbook is read at build time.
  output: "export",
  basePath: process.env.BASE_PATH || "",
  trailingSlash: true,
};

export default nextConfig;
