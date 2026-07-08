/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i1.28hse.com"
      }
    ]
  },
  reactStrictMode: true
};

export default nextConfig;
