/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the Dockerfile's minimal runtime stage (copies .next/standalone).
  output: 'standalone',
  reactStrictMode: true,
};

module.exports = nextConfig;
