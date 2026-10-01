/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["postgres"],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;