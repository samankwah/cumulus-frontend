/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The bulletin reads the district list on the server; ship the file with its functions.
    outputFileTracingIncludes: {
      "/bulletin": ["./public/data/ghana_district_polygons_simplified.geojson"],
      "/bulletin/[district]": ["./public/data/ghana_district_polygons_simplified.geojson"],
    },
  },
};

export default nextConfig;
