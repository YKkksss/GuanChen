/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['lunar-javascript'],
  serverExternalPackages: ['pdfkit'],
};

module.exports = nextConfig;
