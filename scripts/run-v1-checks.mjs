import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// 每项检查单独运行，日志与兜底数据库置于独立临时目录，不读取正式档案。
const root = process.cwd();
const output = mkdtempSync(path.join(tmpdir(), 'guanchen-v1-checks-'));
const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const checks = Object.keys(scripts).filter(name => name.startsWith('test:') && name !== 'test:v1-all');
const results = [];
for (const name of checks) {
  const isolated = mkdtempSync(path.join(output, 'case-'));
  const started = Date.now();
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', name], {
    cwd: root, shell: process.platform === 'win32', encoding: 'utf8', timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env,
      SQLITE_PATH: path.join(isolated, 'fallback.sqlite'), REPORT_EXPORT_DIR: path.join(isolated, 'exports'),
      AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'local-test-only', DEEPSEEK_BASE_URL: 'http://127.0.0.1:39999',
    },
  });
  const log = path.join(output, `${name.replaceAll(':', '-')}.log`);
  writeFileSync(log, `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`);
  const item = { name, passed: result.status === 0, durationMs: Date.now() - started, log };
  results.push(item);
  console.log(`${item.passed ? '通过' : '失败'} ${name} (${item.durationMs}ms)`);
}
const summary = { completedAt: new Date().toISOString(), total: results.length, passed: results.filter(item => item.passed).length, results };
writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`结果：${summary.passed}/${summary.total}；日志目录：${output}`);
process.exitCode = summary.passed === summary.total ? 0 : 1;
