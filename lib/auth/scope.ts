import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';

export type AccountUser = { id: string; username: string; displayName: string; role: 'admin' | 'user'; status: 'active' | 'disabled'; createdAt: number };
declare global { var __guanchenUserScope: AsyncLocalStorage<AccountUser> | undefined; }
const storage = globalThis.__guanchenUserScope ??= new AsyncLocalStorage<AccountUser>();

export function currentUser() { return storage.getStore(); }
export function runAsUser<T>(user: AccountUser, work: () => T): T { return storage.run(user, work); }
export function accountDataRoot() {
  return path.resolve(process.env.ACCOUNT_DATA_DIR || path.join(process.cwd(), 'data', 'accounts'));
}
export function userDataDirectory(user = currentUser()) {
  if (!user) return undefined;
  if (!/^[0-9a-f-]{36}$/.test(user.id)) throw new Error('用户标识无效');
  return path.join(accountDataRoot(), 'users', user.id);
}
/** 事件回调可能由另一请求或流取消触发，显式保留创建时的用户空间。 */
export function bindUserScope<A extends unknown[], T>(callback: (...args: A) => T) {
  const user = currentUser();
  return (...args: A): T => user ? runAsUser(user, () => callback(...args)) : callback(...args);
}
