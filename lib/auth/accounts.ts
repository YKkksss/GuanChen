import Database from 'better-sqlite3';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { accountDataRoot, type AccountUser } from './scope';

export const SESSION_COOKIE = 'guanchen_session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
declare global { var __guanchenAccounts: Map<string, Database.Database> | undefined; }
type UserRow = { id: string; username: string; display_name: string; password_hash: string; role: 'admin' | 'user'; status: 'active' | 'disabled'; created_at: number };
export class AccountError extends Error { constructor(message: string, public status = 400) { super(message); } }

function accounts() {
  const root = accountDataRoot();
  const all = globalThis.__guanchenAccounts ??= new Map();
  if (all.has(root)) return all.get(root)!;
  mkdirSync(root, { recursive: true });
  const db = new Database(path.join(root, 'accounts.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','user')) DEFAULT 'user',
    status TEXT NOT NULL CHECK(status IN ('active','disabled')) DEFAULT 'active', created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);`);
  all.set(root, db);
  return db;
}
function publicUser(row: UserRow): AccountUser {
  return { id: row.id, username: row.username, displayName: row.display_name, role: row.role, status: row.status, createdAt: row.created_at };
}
function normalizeUsername(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{3,32}$/.test(value.trim())) throw new AccountError('用户名需为 3–32 位字母、数字、下划线、点或连字符');
  return value.trim().toLowerCase();
}
function validPassword(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) throw new AccountError('密码长度需为 10–128 个字符');
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
async function matches(password: string, encoded: string) {
  const [, salt, hex] = encoded.split(':');
  const actual = await derive(password, salt);
  const expected = Buffer.from(hex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
/** 限额持久化在账号库，应用重启不会重置；不依赖可伪造的代理 IP 头。 */
export function consumeAuthLimit(key: string, maximum: number, windowMs = 15 * 60_000) {
  const db = accounts();
  db.transaction(() => {
    const now = Date.now();
    db.prepare('DELETE FROM auth_limits WHERE reset_at <= ?').run(now);
    const row = db.prepare('SELECT count FROM auth_limits WHERE key = ?').get(key) as {count: number} | undefined;
    if (row && row.count >= maximum) throw new AccountError('尝试过于频繁，请稍后再试', 429);
    db.prepare(`INSERT INTO auth_limits(key,count,reset_at) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET count = count + 1`).run(key, now + windowMs);
  })();
}
export async function registerUser(input: { username?: unknown; password?: unknown; displayName?: unknown }) {
  const username = normalizeUsername(input.username);
  validPassword(input.password);
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : username;
  if (!displayName || displayName.length > 40) throw new AccountError('显示名称需为 1–40 个字符');
  consumeAuthLimit('register', 30);
  if (accounts().prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new AccountError('该用户名已被使用', 409);
  const hash = await passwordHash(input.password);
  const id = randomUUID();
  try {
    accounts().prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES (?,?,?,?,?)')
      .run(id, username, displayName, hash, Date.now());
  } catch (error) {
    if ((error as {code?: string}).code === 'SQLITE_CONSTRAINT_UNIQUE') throw new AccountError('该用户名已被使用', 409);
    throw error;
  }
  return getUserById(id)!;
}
export async function authenticate(usernameValue: unknown, password: unknown) {
  const username = normalizeUsername(usernameValue);
  if (typeof password !== 'string' || password.length > 128) throw new AccountError('用户名或密码错误', 401);
  consumeAuthLimit('login-global', 150);
  consumeAuthLimit(`login:${username}`, 10);
  const row = accounts().prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  // 未知账号也执行同样的密码派生，避免立即返回泄露账号存在性。
  const match = await matches(password, row?.password_hash ?? `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`);
  if (!row || !match || row.status !== 'active') throw new AccountError('用户名或密码错误，或账号已停用', 401);
  // 密码派生是异步操作，校验期间可能已改密或停用，不能用旧快照签发会话。
  const current = accounts().prepare('SELECT * FROM users WHERE id = ?').get(row.id) as UserRow | undefined;
  if (!current || current.password_hash !== row.password_hash || current.status !== 'active') throw new AccountError('用户名或密码错误，或账号已停用', 401);
  accounts().prepare('DELETE FROM auth_limits WHERE key = ?').run(`login:${username}`);
  return publicUser(current);
}
export function getUserById(id: string) {
  const row = accounts().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? publicUser(row) : null;
}
export function getUserByUsername(username: string) {
  const row = accounts().prepare('SELECT * FROM users WHERE username = ?').get(normalizeUsername(username)) as UserRow | undefined;
  return row ? publicUser(row) : null;
}
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function createSession(userId: string) {
  const db = accounts();
  const token = randomBytes(32).toString('hex');
  db.transaction(() => {
    if (getUserById(userId)?.status !== 'active') throw new AccountError('账号不可用', 401);
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(tokenHash(token), userId, Date.now() + SESSION_SECONDS * 1000, Date.now());
  })();
  return token;
}
export function userForSession(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = accounts().prepare(`SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`).get(tokenHash(token), Date.now()) as UserRow | undefined;
  return row ? publicUser(row) : null;
}
export function revokeSession(token?: string) { if (token) accounts().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token)); }
export async function changePassword(userId: string, oldPassword: unknown, newPassword: unknown) {
  validPassword(newPassword);
  consumeAuthLimit(`password:${userId}`, 10);
  const row = accounts().prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  if (!row || typeof oldPassword !== 'string' || oldPassword.length > 128 || !await matches(oldPassword, row.password_hash)) throw new AccountError('当前密码错误', 400);
  const hash = await passwordHash(newPassword);
  accounts().transaction(() => {
    const current = accounts().prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!current || current.status !== 'active' || current.password_hash !== row.password_hash) throw new AccountError('账号或密码已经变更，请重新登录', 401);
    accounts().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
    accounts().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  })();
}
export function listUsers(input: { query?: string; offset?: number; limit?: number } = {}) {
  const query = `%${(input.query ?? '').slice(0, 80)}%`;
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 20), 1), 100);
  const offset = Math.max(Math.trunc(input.offset ?? 0), 0);
  return (accounts().prepare('SELECT * FROM users WHERE username LIKE ? OR display_name LIKE ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?').all(query, query, limit, offset) as UserRow[]).map(publicUser);
}
export function countUsers(query = '') {
  const pattern = `%${query.slice(0, 80)}%`;
  return (accounts().prepare('SELECT COUNT(*) AS count FROM users WHERE username LIKE ? OR display_name LIKE ?').get(pattern, pattern) as { count: number }).count;
}
export function updateUser(actorId: string, id: string, input: { role?: unknown; status?: unknown }) {
  const db = accounts();
  return db.transaction(() => {
    const actor = getUserById(actorId);
    if (actor?.role !== 'admin' || actor.status !== 'active') throw new AccountError('需要管理员权限', 403);
    const user = getUserById(id);
    if (!user) throw new AccountError('账号不存在', 404);
    if (id === actorId) throw new AccountError('不能在用户管理中变更自己的权限或状态');
    if (input.role !== undefined && input.role !== 'user' && input.role !== 'admin') throw new AccountError('角色无效');
    if (input.status !== undefined && input.status !== 'active' && input.status !== 'disabled') throw new AccountError('账号状态无效');
    db.prepare('UPDATE users SET role = ?, status = ? WHERE id = ?').run(input.role ?? user.role, input.status ?? user.status, id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    return getUserById(id)!;
  })();
}
/** 管理员只能由部署者通过本机命令指定，开放注册不能抢占管理员或旧资料。 */
export function promoteLocalAdministrator(username: string) {
  const user = getUserByUsername(username);
  if (!user) throw new AccountError('请先注册该账号');
  accounts().transaction(() => {
    accounts().prepare("UPDATE users SET role = 'admin', status = 'active' WHERE id = ?").run(user.id);
    accounts().prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  })();
  return getUserById(user.id)!;
}

export function closeAccountConnections() {
  for (const db of globalThis.__guanchenAccounts?.values() ?? []) if (db.open) db.close();
  globalThis.__guanchenAccounts?.clear();
}
