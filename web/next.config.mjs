/** @type {import("next").NextConfig} */
const pages = process.env.GITHUB_PAGES === "1";

const nextConfig = {
  poweredByHeader: false,
  // GitHub project pages are static files under /CCG-Fullstack. The server app is unchanged.
  ...(pages
    ? { output: "export", basePath: "/CCG-Fullstack", images: { unoptimized: true } }
    : { output: "standalone" }),
};

export default nextConfig;
