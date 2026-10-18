import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const failures = [];
const warnings = [];

function fail(message) { failures.push(message); }
function warn(message) { warnings.push(message); }

function read(relative) {
  try { return readFileSync(path.join(root, relative), 'utf8'); }
  catch { fail(`缺少文件：${relative}`); return ''; }
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  .split('\0').filter(Boolean);

const artifactPattern = /^(?:\.next|node_modules|data|output)\/|(?:^|\/)\.env(?!\.example$)|(?:^|\/)(?:[^/]+\.(?:sqlite|sqlite-wal|sqlite-shm|log))$|\.tsbuildinfo$|^next-start\./;
for (const file of tracked) if (artifactPattern.test(file)) fail(`不应跟踪的产物或私密文件：${file}`);

const required = [
  'README.md',
  '项目交接文档.md',
  'docs/V2_SCOPE.md',
  'docs/V2_PHASE_PLAN.md',
  'docs/V2_RELEASE_PLAN.md',
  'docs/V2_MODULE_ACCEPTANCE.md',
  'docs/V2_FREEZE_ASSESSMENT.md',
  'docs/V2_RELEASE_NOTES.md',
  'docs/V2_DEVICE_CHECK.md',
  'docs/GIT_WORKFLOW.md',
  'docs/P1_RELEASE_ENGINEERING.md',
  'docs/P2_DEPLOYMENT.md',
  'docs/P3_SECURITY_ACCOUNT.md',
  'docs/P4_QUALITY_EXPERIENCE.md',
  'docs/P5_AI_SMOKE.md',
  'docs/LOCAL_QUICKSTART.md',
  'docs/ACCOUNT_SERVICE.md',
  'docs/qa-evidence/2026-10-18-v2.0-p0-delivery.json',
];
for (const file of required) if (!tracked.includes(file)) fail(`必需文档未跟踪：${file}`);

const packageJson = JSON.parse(read('package.json') || '{}');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(packageJson.version))) fail(`package.json version 非法：${packageJson.version}`);
for (const script of ['test:v1-all', 'release:check', 'qa:production-readonly', 'test:bazi-month-intake']) {
  if (!packageJson.scripts?.[script]) fail(`缺少 npm script：${script}`);
}
if (!packageJson.allowScripts?.['better-sqlite3@12.4.1']) fail('allowScripts 未固定 better-sqlite3@12.4.1');

const client = read('lib/db/client.ts');
const migrations = [...client.matchAll(/applied\.has\((\d+)\)/g)].map(match => Number(match[1]));
const latestSchema = migrations.length ? Math.max(...migrations) : 0;
if (latestSchema !== 56) fail(`业务库迁移版本不是 56：${latestSchema}`);

const gitignore = read('.gitignore');
for (const rule of ['.next-*/', 'data/', 'output/', '*.log', '.playwright-mcp/']) {
  if (!gitignore.includes(rule)) fail(`.gitignore 缺少规则：${rule}`);
}

const secretPatterns = [
  /sk-[A-Za-z0-9]{20,}/,
  /gho_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const binary = /\.(?:png|jpe?g|webp|gif|ico|pdf|sqlite|woff2?|ttf|otf|zip|gz)$/i;
let scanned = 0, secretFindings = 0;
for (const file of tracked) {
  if (binary.test(file)) continue;
  try {
    if (statSync(path.join(root, file)).size > 2 * 1024 * 1024) { warn(`跳过大于 2MB 的文本：${file}`); continue; }
    const text = readFileSync(path.join(root, file), 'utf8');
    scanned++;
    if (secretPatterns.some(pattern => pattern.test(text))) { fail(`疑似密钥：${file}`); secretFindings++; }
  } catch {
    warn(`无法读取：${file}`);
  }
}

if (args.has('--require-clean')) {
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
  if (status) fail(`工作区不干净：\n${status}`);
}

const result = {
  passed: failures.length === 0,
  version: packageJson.version,
  schema: latestSchema,
  trackedFiles: tracked.length,
  scannedTextFiles: scanned,
  secretFindings,
  checks: {
    artifacts: failures.filter(item => item.includes('产物')).length === 0,
    requiredDocs: failures.filter(item => item.includes('必需文档')).length === 0,
    packageScripts: failures.filter(item => item.includes('npm script')).length === 0,
    allowScripts: failures.filter(item => item.includes('allowScripts')).length === 0,
    schema: latestSchema === 56,
    gitignore: failures.filter(item => item.includes('.gitignore')).length === 0,
    secrets: secretFindings === 0,
  },
  failures,
  warnings,
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.passed ? 0 : 1;
