import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const checkOnly = args.has('--check');
const port = Number(process.env.PORT || 30001);
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

function fail(message) {
  console.error(`\n[local] ${message}\n`);
  process.exit(1);
}

function lanAddresses() {
  const result = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.') || entry.address.startsWith('198.18.') || entry.address.startsWith('198.19.')) continue;
      result.push(entry.address);
    }
  }
  return [...new Set(result)];
}

function portAvailable() {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', error => resolve(error.code !== 'EADDRINUSE'));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '0.0.0.0');
  });
}

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) fail(`Node.js ${process.versions.node} 过低，请使用 Node 24（最低 22）。`);
  if (!existsSync(nextBin)) fail('未安装依赖：请先运行 npm ci。');
  if (!(await portAvailable())) fail(`端口 ${port} 已被占用。可设置 PORT=30002 npm run local，或先停止旧服务。`);

  if (!existsSync(path.join(root, '.env.local'))) {
    copyFileSync(path.join(root, '.env.example'), path.join(root, '.env.local'));
    console.log('[local] 已从 .env.example 创建 .env.local；AI 功能需要填入自己的供应商密钥。');
  }
  mkdirSync(path.join(root, 'data'), { recursive: true });

  if (!dev && !existsSync(path.join(root, '.next', 'BUILD_ID'))) {
    if (checkOnly) fail('没有生产构建：请先运行 npm run build，或去掉 --check 让脚本自动构建。');
    console.log('[local] 没有生产构建，开始执行 npm run build（首次会稍慢）…');
    const build = spawnSync(process.execPath, [nextBin, 'build'], { cwd: root, stdio: 'inherit', env: process.env });
    if (build.status !== 0) fail('构建失败，请查看上方输出。');
  }

  const local = `http://127.0.0.1:${port}`;
  const lan = lanAddresses().map(address => `http://${address}:${port}`);
  console.log('\n[local] 观辰已准备启动');
  console.log(`  本机：   ${local}`);
  if (lan.length) for (const address of lan) console.log(`  局域网： ${address}`);
  else console.log('  局域网： 未检测到非回环 IPv4 地址');
  if (lan.length > 1) console.log('  提示：    有多个网卡，请选择与手机同一网段的地址。');
  console.log('  首次使用先打开 /register 注册；AI 需要 .env.local 中的供应商密钥。');
  console.log('  按 Ctrl+C 停止。\n');

  if (checkOnly) return;
  const command = dev
    ? [nextBin, 'dev', '--turbopack', '-H', '0.0.0.0', '-p', String(port)]
    : [nextBin, 'start', '-H', '0.0.0.0', '-p', String(port)];
  const child = spawn(process.execPath, command, { cwd: root, stdio: 'inherit', env: process.env });
  const stop = () => { if (!child.killed) child.kill(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', code => { process.exitCode = code ?? 0; });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
