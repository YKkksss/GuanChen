/** @type {import('next').NextConfig} */
const configuredDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const privateLanDevOrigins = [
  '10.*.*.*',
  '192.168.*.*',
  ...Array.from({ length: 16 }, (_, index) => `172.${index + 16}.*.*`),
];

const nextConfig = {
  transpilePackages: ['lunar-javascript'],
  serverExternalPackages: ['pdfkit'],
  // 允许同一局域网内的手机和平板加载开发资源；额外域名可通过环境变量补充。
  allowedDevOrigins: [...privateLanDevOrigins, ...configuredDevOrigins],
};

module.exports = nextConfig;
