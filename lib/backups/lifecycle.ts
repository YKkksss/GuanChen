import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { getDatabasePath } from '@/lib/db/client';
import {
  BackupValidationError,
  createLocalBackupArchive,
  inspectLocalBackupArchive,
} from './service';
import {
  LOCAL_BACKUP_DELETE_CONFIRMATION,
  LOCAL_BACKUP_EXTENSION,
} from './types';
import type {
  AutomaticBackupCheckResult,
  BackupLifecycleSummary,
  BackupPolicy,
  ManagedBackupHealth,
  ManagedBackupItem,
  ManagedBackupSource,
} from './types';

const POLICY_FILE_NAME = 'backup-policy.json';
const HEALTH_FILE_NAME = 'backup-health.json';
const MAX_MANAGED_ARCHIVE_BYTES = 128 * 1024 * 1024;
const PREFIXES: Record<ManagedBackupSource, string> = {
  scheduled: '定时自动备份-',
  manual: '手动保留备份-',
  pre_restore: '恢复前自动备份-',
};

type HealthEntry = {
  byteSize: number;
  modifiedAtMs: number;
  health: ManagedBackupHealth;
  lastVerifiedAt: string;
  healthMessage: string;
};

type HealthIndex = Record<string, HealthEntry>;

let automaticBackupRunning = false;
let managedBackupRunning = false;

export async function getBackupLifecycleSummary(): Promise<BackupLifecycleSummary> {
  const policy = await readBackupPolicy();
  return {
    policy,
    managedBackups: await listManagedBackups(),
    nextAutomaticBackupAt: resolveNextAutomaticBackupAt(policy),
  };
}

export async function readBackupPolicy(): Promise<BackupPolicy> {
  const fallback = defaultPolicy();
  const raw = await readFile(path.join(getBackupDirectory(), POLICY_FILE_NAME), 'utf8').catch(() => null);
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as Partial<BackupPolicy>;
    if (
      typeof value.enabled !== 'boolean'
      || !isValidInterval(value.intervalHours)
      || !isValidRetention(value.retentionCount)
      || (value.lastAutomaticBackupAt !== null && !isValidDate(value.lastAutomaticBackupAt))
      || !isValidDate(value.updatedAt)
    ) return fallback;
    return value as BackupPolicy;
  } catch {
    return fallback;
  }
}

export async function updateBackupPolicy(input: {
  enabled?: unknown;
  intervalHours?: unknown;
  retentionCount?: unknown;
}): Promise<BackupLifecycleSummary> {
  const current = await readBackupPolicy();
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new BackupValidationError('自动备份开关参数无效', 'BACKUP_POLICY_ENABLED_INVALID');
  }
  if (input.intervalHours !== undefined && !isValidInterval(input.intervalHours)) {
    throw new BackupValidationError('自动备份周期必须为 1 至 168 小时的整数', 'BACKUP_POLICY_INTERVAL_INVALID');
  }
  if (input.retentionCount !== undefined && !isValidRetention(input.retentionCount)) {
    throw new BackupValidationError('自动备份保留数量必须为 1 至 30 份', 'BACKUP_POLICY_RETENTION_INVALID');
  }
  const policy: BackupPolicy = {
    ...current,
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.intervalHours !== undefined ? { intervalHours: input.intervalHours } : {}),
    ...(input.retentionCount !== undefined ? { retentionCount: input.retentionCount } : {}),
    updatedAt: new Date().toISOString(),
  };
  await writeBackupPolicy(policy);
  await pruneScheduledBackups(policy.retentionCount);
  return getBackupLifecycleSummary();
}

export async function ensureAutomaticBackupDue(): Promise<AutomaticBackupCheckResult> {
  const policy = await readBackupPolicy();
  if (!policy.enabled) {
    return { status: 'disabled', createdFileName: null, nextAutomaticBackupAt: null, prunedFileNames: [] };
  }
  const nextAutomaticBackupAt = resolveNextAutomaticBackupAt(policy);
  if (nextAutomaticBackupAt && Date.parse(nextAutomaticBackupAt) > Date.now()) {
    return { status: 'not_due', createdFileName: null, nextAutomaticBackupAt, prunedFileNames: [] };
  }
  if (automaticBackupRunning || managedBackupRunning) {
    return { status: 'busy', createdFileName: null, nextAutomaticBackupAt, prunedFileNames: [] };
  }

  automaticBackupRunning = true;
  try {
    const item = await createManagedBackup('scheduled');
    const completedAt = new Date().toISOString();
    const latestPolicy = await readBackupPolicy();
    const nextPolicy: BackupPolicy = {
      ...latestPolicy,
      lastAutomaticBackupAt: completedAt,
      updatedAt: completedAt,
    };
    await writeBackupPolicy(nextPolicy);
    const prunedFileNames = await pruneScheduledBackups(nextPolicy.retentionCount);
    return {
      status: 'created',
      createdFileName: item.fileName,
      nextAutomaticBackupAt: resolveNextAutomaticBackupAt(nextPolicy),
      prunedFileNames,
    };
  } finally {
    automaticBackupRunning = false;
  }
}

export async function createManagedBackup(source: 'manual' | 'scheduled' = 'manual'): Promise<ManagedBackupItem> {
  if (managedBackupRunning) {
    throw new BackupValidationError('另一项本地备份正在生成，请稍后重试', 'BACKUP_CREATE_BUSY');
  }
  managedBackupRunning = true;
  try {
    const archive = await createLocalBackupArchive();
    const directory = getBackupDirectory();
    await mkdir(directory, { recursive: true });
    const createdAt = new Date().toISOString();
    const fileName = `${PREFIXES[source]}${fileTimestamp(createdAt)}-${randomUUID().slice(0, 8)}${LOCAL_BACKUP_EXTENSION}`;
    const target = resolveManagedBackupPath(fileName);
    await writeFile(target, archive.buffer, { flag: 'wx' });
    const info = await stat(target);
    return {
      fileName,
      source,
      byteSize: info.size,
      createdAt: info.mtime.toISOString(),
      health: 'unchecked',
      lastVerifiedAt: null,
      healthMessage: null,
    };
  } finally {
    managedBackupRunning = false;
  }
}

export async function listManagedBackups(): Promise<ManagedBackupItem[]> {
  const directory = getBackupDirectory();
  const [entries, healthIndex] = await Promise.all([
    readdir(directory, { withFileTypes: true }).catch(() => []),
    readHealthIndex(),
  ]);
  const results: ManagedBackupItem[] = [];
  for (const entry of entries) {
    const source = resolveManagedSource(entry.name);
    if (!entry.isFile() || !source) continue;
    const info = await stat(path.join(directory, entry.name)).catch(() => null);
    if (!info) continue;
    const health = healthIndex[entry.name];
    const healthStillApplies = health
      && health.byteSize === info.size
      && health.modifiedAtMs === info.mtimeMs;
    results.push({
      fileName: entry.name,
      source,
      byteSize: info.size,
      createdAt: info.mtime.toISOString(),
      health: healthStillApplies ? health.health : 'unchecked',
      lastVerifiedAt: healthStillApplies ? health.lastVerifiedAt : null,
      healthMessage: healthStillApplies ? health.healthMessage : null,
    });
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
}

export async function readManagedBackupArchive(fileName: string): Promise<Buffer> {
  const target = resolveManagedBackupPath(fileName);
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) throw new BackupValidationError('本地备份文件不存在', 'MANAGED_BACKUP_NOT_FOUND');
  if (info.size > MAX_MANAGED_ARCHIVE_BYTES) {
    throw new BackupValidationError('本地备份文件超过 128 MB 上限', 'MANAGED_BACKUP_TOO_LARGE');
  }
  return readFile(target);
}

export async function verifyManagedBackup(fileName: string): Promise<ManagedBackupItem> {
  const target = resolveManagedBackupPath(fileName);
  const buffer = await readManagedBackupArchive(fileName);
  const info = await stat(target);
  let health: ManagedBackupHealth = 'healthy';
  let healthMessage = '完整性、数据表、外键、附件与版本检查均已通过';
  try {
    const preview = await inspectLocalBackupArchive(buffer, fileName);
    if (!preview.compatible) {
      health = 'incompatible';
      healthMessage = `备份数据库为 v${preview.schemaVersion}，当前应用要求 v${preview.currentSchemaVersion}`;
    }
  } catch (error) {
    health = 'damaged';
    healthMessage = error instanceof Error ? error.message : '备份包无法通过完整性检查';
  }
  const verifiedAt = new Date().toISOString();
  const index = await readHealthIndex();
  index[fileName] = {
    byteSize: info.size,
    modifiedAtMs: info.mtimeMs,
    health,
    lastVerifiedAt: verifiedAt,
    healthMessage,
  };
  await writeHealthIndex(index);
  return {
    fileName,
    source: resolveManagedSource(fileName)!,
    byteSize: info.size,
    createdAt: info.mtime.toISOString(),
    health,
    lastVerifiedAt: verifiedAt,
    healthMessage,
  };
}

export async function deleteManagedBackup(fileName: string, confirmation: string): Promise<void> {
  if (confirmation !== LOCAL_BACKUP_DELETE_CONFIRMATION) {
    throw new BackupValidationError(`请输入“${LOCAL_BACKUP_DELETE_CONFIRMATION}”确认删除`, 'BACKUP_DELETE_CONFIRMATION_REQUIRED');
  }
  const target = resolveManagedBackupPath(fileName);
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) throw new BackupValidationError('本地备份文件不存在', 'MANAGED_BACKUP_NOT_FOUND');
  await rm(target);
  const index = await readHealthIndex();
  delete index[fileName];
  await writeHealthIndex(index);
}

async function pruneScheduledBackups(retentionCount: number): Promise<string[]> {
  const scheduled = (await listManagedBackups()).filter(item => item.source === 'scheduled');
  const removed = scheduled.slice(retentionCount);
  if (!removed.length) return [];
  const index = await readHealthIndex();
  for (const item of removed) {
    await rm(resolveManagedBackupPath(item.fileName), { force: true });
    delete index[item.fileName];
  }
  await writeHealthIndex(index);
  return removed.map(item => item.fileName);
}

function defaultPolicy(): BackupPolicy {
  return {
    enabled: true,
    intervalHours: 24,
    retentionCount: 7,
    lastAutomaticBackupAt: null,
    updatedAt: new Date(0).toISOString(),
  };
}

function resolveNextAutomaticBackupAt(policy: BackupPolicy): string | null {
  if (!policy.enabled) return null;
  if (!policy.lastAutomaticBackupAt) return new Date().toISOString();
  return new Date(Date.parse(policy.lastAutomaticBackupAt) + policy.intervalHours * 60 * 60 * 1_000).toISOString();
}

function resolveManagedSource(fileName: string): ManagedBackupSource | null {
  if (!fileName.endsWith(LOCAL_BACKUP_EXTENSION)) return null;
  const entry = Object.entries(PREFIXES).find(([, prefix]) => fileName.startsWith(prefix));
  return entry ? entry[0] as ManagedBackupSource : null;
}

function resolveManagedBackupPath(fileName: string): string {
  if (path.basename(fileName) !== fileName || !resolveManagedSource(fileName)) {
    throw new BackupValidationError('本地备份文件名无效', 'MANAGED_BACKUP_NAME_INVALID');
  }
  const directory = getBackupDirectory();
  const target = path.resolve(directory, fileName);
  if (!target.startsWith(`${path.resolve(directory)}${path.sep}`)) {
    throw new BackupValidationError('备份文件路径越过本地数据目录', 'MANAGED_BACKUP_PATH_INVALID');
  }
  return target;
}

function getBackupDirectory(): string {
  return path.join(path.dirname(getDatabasePath()), 'backups');
}

async function writeBackupPolicy(policy: BackupPolicy): Promise<void> {
  const directory = getBackupDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, POLICY_FILE_NAME), `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
}

async function readHealthIndex(): Promise<HealthIndex> {
  const raw = await readFile(path.join(getBackupDirectory(), HEALTH_FILE_NAME), 'utf8').catch(() => null);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as HealthIndex;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

async function writeHealthIndex(index: HealthIndex): Promise<void> {
  const directory = getBackupDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, HEALTH_FILE_NAME), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

function isValidInterval(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 168;
}

function isValidRetention(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 30;
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function fileTimestamp(value: string): string {
  return value.replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '');
}
