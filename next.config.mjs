/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-simple-maps ships modern ESM/d3 deps; transpile so the build is happy.
  transpilePackages: ["react-simple-maps"],
};
export default nextConfig;
