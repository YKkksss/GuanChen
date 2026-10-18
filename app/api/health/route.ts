import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, readFile, statfs } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { NextResponse } from 'next/server';
import { accountDataRoot } from '@/lib/auth/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_FREE_BYTES = 100 * 1024 * 1024;

async function dataDirectoryStatus(root: string): Promise<'ok' | 'not_initialized' | 'unavailable'> {
  try {
    await access(root, constants.W_OK);
    return 'ok';
  } catch {
    try {
      await access(path.dirname(root), constants.W_OK);
      return 'not_initialized';
    } catch {
      return 'unavailable';
    }
  }
}

/** 只读打开账号库，不执行迁移、不创建目录，避免健康检查产生写入副作用。 */
async function databaseStatus(root: string): Promise<'ok' | 'not_initialized' | 'error'> {
  const file = path.join(root, 'accounts.sqlite');
  try {
    await access(file, constants.R_OK);
  } catch {
    return 'not_initialized';
  }
  let database: Database.Database | null = null;
  try {
    database = new Database(file, { readonly: true, fileMustExist: true });
    database.prepare('SELECT 1').get();
    return 'ok';
  } catch {
    return 'error';
  } finally {
    if (database?.open) database.close();
  }
}

async function diskStatus(root: string): Promise<{ status: 'ok' | 'low' | 'unknown'; freeMb?: number }> {
  for (const target of [root, path.dirname(root)]) {
    try {
      const info = await statfs(target);
      const free = Number(info.bavail) * Number(info.bsize);
      return { status: free >= MIN_FREE_BYTES ? 'ok' : 'low', freeMb: Math.round(free / 1024 / 1024) };
    } catch {
      continue;
    }
  }
  return { status: 'unknown' };
}

export async function GET(request: Request) {
  const root = accountDataRoot();
  const [dataDir, database, disk] = await Promise.all([
    dataDirectoryStatus(root),
    databaseStatus(root),
    diskStatus(root),
  ]);
  let version = 'unknown';
  try {
    version = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    version = 'unknown';
  }
  const degraded = database === 'error' || dataDir === 'unavailable' || disk.status === 'low' || disk.status === 'unknown';
  const payload = {
    status: degraded ? 'degraded' : 'ok',
    service: 'guanchen',
    version,
    time: new Date().toISOString(),
    checks: {
      process: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) },
      dataDir: { status: dataDir },
      database: { status: database },
      disk,
    },
  };
  return NextResponse.json(payload, {
    status: degraded ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store',
      'x-request-id': request.headers.get('x-request-id')?.match(/^[A-Za-z0-9._-]{1,64}$/)?.[0] || randomUUID(),
    },
  });
}
