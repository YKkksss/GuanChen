import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, createSession, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser, userDataDirectory } from '../lib/auth/scope';
import { closeDatabaseConnection } from '../lib/db/client';

/** 原业务回归通过真实账号/会话执行，不关闭服务端鉴权。 */
export async function runAccountTest(work: () => Promise<void>) {
  const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-account-regression-'));
  process.env.ACCOUNT_DATA_DIR = directory;
  const user = await registerUser({ username: 'regression-user', password: 'synthetic-test-password', displayName: '合成回归账号' });
  const token = createSession(user.id);
  const OriginalRequest = globalThis.Request;
  globalThis.Request = class extends OriginalRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init);
      if (['local', 'test', 'localhost', '127.0.0.1'].includes(new URL(this.url).hostname) && !this.headers.has('cookie')) this.headers.set('cookie', `${SESSION_COOKIE}=${token}`);
    }
  };
  try {
    await runAsUser(user, async () => {
      process.env.SQLITE_PATH = path.join(userDataDirectory()!, 'ziweidoushu.sqlite');
      process.env.REPORT_EXPORT_DIR = path.join(userDataDirectory()!, 'report-exports');
      try { await work(); } finally { closeDatabaseConnection(); }
    });
  } finally {
    globalThis.Request = OriginalRequest;
    closeAccountConnections();
    rmSync(directory, { recursive: true, force: true });
  }
}
