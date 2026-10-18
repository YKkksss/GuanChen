import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

function parseArgs(argv) {
  const result = { keep: 7, userBackups: true };
  for (const item of argv) {
    if (item === '--no-user-backups') { result.userBackups = false; continue; }
    const [key, ...rest] = item.split('=');
    const value = rest.join('=');
    if (key === '--source') result.source = value;
    else if (key === '--target') result.target = value;
    else if (key === '--keep') result.keep = Number(value);
    else if (key === '--label') result.label = value;
  }
  return result;
}

async function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file).on('data', chunk => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

async function copyDatabase(sourceFile, destinationFile) {
  await mkdir(path.dirname(destinationFile), { recursive: true });
  const db = new Database(sourceFile, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destinationFile);
  } finally {
    if (db.open) db.close();
  }
  const copy = new Database(destinationFile, { readonly: true, fileMustExist: true });
  try {
    const integrity = copy.prepare('PRAGMA integrity_check').get();
    if (!integrity || integrity.integrity_check !== 'ok') throw new Error(`备份完整性检查失败：${destinationFile}`);
  } finally {
    if (copy.open) copy.close();
  }
}

/** 通过 SQLite 在线备份 API 复制账号库与用户库；附件按目录复制。调用方应尽量在低写入窗口执行。 */
export async function backupAccountData(input) {
  const source = path.resolve(input.source ?? process.env.ACCOUNT_DATA_DIR ?? path.join(process.cwd(), 'data', 'accounts'));
  const targetRoot = path.resolve(input.target ?? process.env.ACCOUNT_DATA_BACKUP_DIR ?? path.join(path.dirname(source), 'operational-backups'));
  const keep = Number.isFinite(input.keep) ? Math.max(1, Math.trunc(input.keep)) : 7;
  const sourcePrefix = source.endsWith(path.sep) ? source : `${source}${path.sep}`;
  if (targetRoot === source || targetRoot.startsWith(sourcePrefix)) throw new Error('备份目标不能位于账号数据目录内部');
  await access(path.join(source, 'accounts.sqlite'));
  await mkdir(targetRoot, { recursive: true });
  const label = input.label || new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(targetRoot, `accounts-${label}`);
  await mkdir(destination, { recursive: true });

  const files = [];
  const copied = [];
  async function copyFile(relative) {
    const from = path.join(source, relative), to = path.join(destination, relative);
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to, { recursive: true, force: true });
    copied.push(relative);
  }

  await copyDatabase(path.join(source, 'accounts.sqlite'), path.join(destination, 'accounts.sqlite'));
  files.push({ path: 'accounts.sqlite', bytes: (await stat(path.join(destination, 'accounts.sqlite'))).size, sha256: await sha256(path.join(destination, 'accounts.sqlite')) });

  const usersRoot = path.join(source, 'users');
  let userDirectories = [];
  try { userDirectories = (await readdir(usersRoot, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name); }
  catch { userDirectories = []; }

  for (const user of userDirectories) {
    const relative = path.join('users', user, 'ziweidoushu.sqlite');
    try { await access(path.join(source, relative)); } catch { continue; }
    await copyDatabase(path.join(source, relative), path.join(destination, relative));
    files.push({ path: relative, bytes: (await stat(path.join(destination, relative))).size, sha256: await sha256(path.join(destination, relative)) });
    for (const folder of ['report-exports', ...(input.userBackups === false ? [] : ['backups'])]) {
      try { await access(path.join(source, 'users', user, folder)); await copyFile(path.join('users', user, folder)); }
      catch { /* 该用户没有此类附件 */ }
    }
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    source,
    destination,
    keep,
    includeUserBackups: input.userBackups !== false,
    databases: files,
    copiedDirectories: copied,
    totalBytes: files.reduce((sum, item) => sum + item.bytes, 0),
  };
  await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const entries = (await readdir(targetRoot, { withFileTypes: true })).filter(item => item.isDirectory() && item.name.startsWith('accounts-')).map(item => item.name).sort().reverse();
  for (const old of entries.slice(keep)) await rm(path.join(targetRoot, old), { recursive: true, force: true });

  return { ...manifest, retained: entries.slice(0, keep), pruned: entries.slice(keep) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  backupAccountData(args)
    .then(result => { console.log(JSON.stringify({ passed: true, ...result }, null, 2)); })
    .catch(error => { console.error(JSON.stringify({ passed: false, error: error instanceof Error ? error.message : String(error) }, null, 2)); process.exitCode = 1; });
}
