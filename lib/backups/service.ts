import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  beginDatabaseMaintenance,
  closeDatabaseConnection,
  endDatabaseMaintenance,
  getDatabase,
  getDatabaseDuringMaintenance,
  getDatabasePath,
} from '@/lib/db/client';
import { getReportExportRoot } from '@/lib/report-exports/service';
import {
  LOCAL_BACKUP_CONFIRMATION,
  LOCAL_BACKUP_EXTENSION,
  LOCAL_BACKUP_FORMAT_VERSION,
  LOCAL_BACKUP_KIND,
} from './types';
import type {
  BackupArchiveResult,
  BackupAttachmentManifest,
  BackupContentSummary,
  BackupPreview,
  BackupTableCount,
  LocalBackupEnvelope,
  LocalDataSummary,
  RestoreBackupResult,
} from './types';

const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 2_000;
const REQUIRED_TABLES = ['schema_migrations', 'conversations', 'messages'] as const;
const AUTOMATIC_BACKUP_PREFIX = '恢复前自动备份-';
let restoring = false;

type ParsedBackup = {
  envelope: LocalBackupEnvelope;
  database: Buffer;
  attachments: Array<BackupAttachmentManifest & { buffer: Buffer }>;
  preview: BackupPreview;
};

export class BackupValidationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

export class BackupRestoreBusyError extends Error {
  constructor() {
    super('另一项恢复操作正在进行，请稍后重试');
    this.name = 'BackupRestoreBusyError';
  }
}

export async function createLocalBackupArchive(): Promise<BackupArchiveResult> {
  const workDirectory = await mkdtemp(path.join(tmpdir(), 'ziwei-backup-'));
  const snapshotPath = path.join(workDirectory, 'ziweidoushu.sqlite');
  try {
    await getDatabase().backup(snapshotPath);
    const database = await readFile(snapshotPath);
    const snapshot = openVerifiedDatabase(snapshotPath);
    let tableCounts: BackupTableCount[];
    let schemaVersion: number;
    try {
      tableCounts = readTableCounts(snapshot);
      schemaVersion = readSchemaVersion(snapshot);
    } finally {
      snapshot.close();
    }
    const attachments = await collectReportAttachments();
    const createdAt = new Date().toISOString();
    const envelope: LocalBackupEnvelope = {
      kind: LOCAL_BACKUP_KIND,
      formatVersion: LOCAL_BACKUP_FORMAT_VERSION,
      createdAt,
      schemaVersion,
      database: {
        fileName: 'ziweidoushu.sqlite',
        byteSize: database.length,
        sha256: digest(database),
        data: database.toString('base64'),
      },
      attachments,
      inventory: { tableCounts },
    };
    const buffer = gzipSync(Buffer.from(JSON.stringify(envelope)), { level: 9 });
    const fileName = `紫微命盘本地备份-${fileTimestamp(createdAt)}${LOCAL_BACKUP_EXTENSION}`;
    const preview = buildPreview(envelope, buffer.length, tableCounts, []);
    return { buffer, fileName, preview };
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

export async function inspectLocalBackupArchive(
  archive: Buffer,
  fileName = `本地备份${LOCAL_BACKUP_EXTENSION}`,
): Promise<BackupPreview> {
  return (await parseAndValidateArchive(archive, fileName)).preview;
}

export async function getLocalDataSummary(): Promise<LocalDataSummary> {
  const db = getDatabase();
  const databasePath = getDatabasePath();
  const databaseStat = await stat(databasePath).catch(() => null);
  const attachments = await collectReportAttachments();
  const tableCounts = readTableCounts(db);
  return {
    schemaVersion: readSchemaVersion(db),
    databaseBytes: databaseStat?.size ?? 0,
    attachmentCount: attachments.length,
    attachmentBytes: attachments.reduce((total, item) => total + item.byteSize, 0),
    content: summarizeContent(tableCounts),
    automaticBackups: await listAutomaticBackups(),
  };
}

export async function readAutomaticBackupArchive(fileName: string): Promise<Buffer> {
  if (
    path.basename(fileName) !== fileName
    || !fileName.startsWith(AUTOMATIC_BACKUP_PREFIX)
    || !fileName.endsWith(LOCAL_BACKUP_EXTENSION)
  ) {
    throw new BackupValidationError('自动备份文件名无效', 'AUTOMATIC_BACKUP_NAME_INVALID');
  }
  const directory = path.join(path.dirname(getDatabasePath()), 'backups');
  const target = resolveInsideRoot(directory, fileName);
  const buffer = await readFile(target).catch(() => null);
  if (!buffer) throw new BackupValidationError('自动备份文件不存在', 'AUTOMATIC_BACKUP_NOT_FOUND');
  return buffer;
}

export async function restoreLocalBackupArchive(input: {
  archive: Buffer;
  fileName?: string;
  confirmation: string;
}): Promise<RestoreBackupResult> {
  if (input.confirmation !== LOCAL_BACKUP_CONFIRMATION) {
    throw new BackupValidationError(`请输入“${LOCAL_BACKUP_CONFIRMATION}”确认整库替换`, 'CONFIRMATION_REQUIRED');
  }
  if (restoring) throw new BackupRestoreBusyError();
  restoring = true;

  const databasePath = getDatabasePath();
  const databaseDirectory = path.dirname(databasePath);
  const operationId = randomUUID();
  const candidatePath = path.join(databaseDirectory, `.restore-candidate-${operationId}.sqlite`);
  const retiredPath = path.join(databaseDirectory, `.restore-retired-${operationId}.sqlite`);
  const reportRoot = getReportExportRoot();
  const stagedReportRoot = `${reportRoot}.restore-stage-${operationId}`;
  const retiredReportRoot = `${reportRoot}.restore-retired-${operationId}`;
  let databaseRetired = false;
  let reportRootRetired = false;
  let replacementInstalled = false;
  let maintenanceToken: symbol | undefined;

  try {
    const parsed = await parseAndValidateArchive(
      input.archive,
      input.fileName || `本地备份${LOCAL_BACKUP_EXTENSION}`,
    );
    if (!parsed.preview.compatible) {
      throw new BackupValidationError(
        `备份数据库版本为 v${parsed.preview.schemaVersion}，当前应用要求 v${parsed.preview.currentSchemaVersion}，已阻止恢复`,
        'SCHEMA_VERSION_INCOMPATIBLE',
      );
    }

    await mkdir(databaseDirectory, { recursive: true });
    await writeFile(candidatePath, parsed.database, { flag: 'wx' });
    await stageReportAttachments(stagedReportRoot, parsed.attachments);

    const rollback = await createLocalBackupArchive();
    const automaticBackupDirectory = path.join(databaseDirectory, 'backups');
    await mkdir(automaticBackupDirectory, { recursive: true });
    const rollbackBackupFileName = `${AUTOMATIC_BACKUP_PREFIX}${fileTimestamp(new Date().toISOString())}-${operationId.slice(0, 8)}${LOCAL_BACKUP_EXTENSION}`;
    await writeFile(path.join(automaticBackupDirectory, rollbackBackupFileName), rollback.buffer, { flag: 'wx' });

    maintenanceToken = beginDatabaseMaintenance();
    const liveDatabase = getDatabaseDuringMaintenance(maintenanceToken);
    liveDatabase.pragma('wal_checkpoint(TRUNCATE)');
    closeDatabaseConnection();
    await removeWalSidecars(databasePath);
    await rename(databasePath, retiredPath);
    databaseRetired = true;
    await rename(candidatePath, databasePath);
    replacementInstalled = true;

    if (await isDirectory(reportRoot)) {
      await rename(reportRoot, retiredReportRoot);
      reportRootRetired = true;
    }
    await rename(stagedReportRoot, reportRoot);

    const restored = getDatabaseDuringMaintenance(maintenanceToken);
    assertDatabaseIntegrity(restored);
    if (readSchemaVersion(restored) !== parsed.preview.schemaVersion) {
      throw new BackupValidationError('恢复后数据库版本复核失败', 'RESTORED_SCHEMA_MISMATCH');
    }

    await rm(retiredPath, { force: true });
    await rm(retiredReportRoot, { recursive: true, force: true });
    return {
      restoredAt: new Date().toISOString(),
      preview: parsed.preview,
      rollbackBackupFileName,
    };
  } catch (error) {
    if (databaseRetired) {
      try {
        closeDatabaseConnection();
        await removeWalSidecars(databasePath);
        if (replacementInstalled) await rm(databasePath, { force: true });
        await rename(retiredPath, databasePath);
        if (await isDirectory(reportRoot)) await rm(reportRoot, { recursive: true, force: true });
        if (reportRootRetired) await rename(retiredReportRoot, reportRoot);
        if (!maintenanceToken) throw new Error('数据库维护令牌丢失');
        getDatabaseDuringMaintenance(maintenanceToken);
      } catch (rollbackError) {
        console.error('本地数据恢复回滚失败：', rollbackError);
        throw new BackupValidationError('恢复失败，且自动回滚未能完成，请保留 data/backups 中的自动备份并停止写入', 'ROLLBACK_FAILED');
      }
    }
    throw error;
  } finally {
    await rm(candidatePath, { force: true }).catch(() => undefined);
    await rm(stagedReportRoot, { recursive: true, force: true }).catch(() => undefined);
    if (!databaseRetired) await rm(retiredPath, { force: true }).catch(() => undefined);
    if (!reportRootRetired) await rm(retiredReportRoot, { recursive: true, force: true }).catch(() => undefined);
    if (maintenanceToken) endDatabaseMaintenance(maintenanceToken);
    restoring = false;
  }
}

async function parseAndValidateArchive(archive: Buffer, fileName: string): Promise<ParsedBackup> {
  if (!archive.length) throw new BackupValidationError('备份文件为空', 'ARCHIVE_EMPTY');
  if (archive.length > MAX_ARCHIVE_BYTES) {
    throw new BackupValidationError('备份文件超过 128 MB 上限', 'ARCHIVE_TOO_LARGE');
  }
  if (archive[0] !== 0x1f || archive[1] !== 0x8b) {
    throw new BackupValidationError('文件不是有效的 .ziweibackup 备份包', 'ARCHIVE_MAGIC_INVALID');
  }

  let raw: Buffer;
  try {
    raw = gunzipSync(archive, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
  } catch {
    throw new BackupValidationError('备份包无法解压或内容超过安全上限', 'ARCHIVE_DECOMPRESSION_FAILED');
  }
  let envelope: LocalBackupEnvelope;
  try {
    envelope = JSON.parse(raw.toString('utf8')) as LocalBackupEnvelope;
  } catch {
    throw new BackupValidationError('备份清单不是有效 JSON', 'MANIFEST_JSON_INVALID');
  }
  validateEnvelopeShape(envelope);

  const database = decodeAndVerify(
    envelope.database.data,
    envelope.database.byteSize,
    envelope.database.sha256,
    '数据库快照',
  );
  if (database.subarray(0, 16).toString('ascii') !== 'SQLite format 3\u0000') {
    throw new BackupValidationError('数据库快照缺少 SQLite 文件标识', 'DATABASE_MAGIC_INVALID');
  }

  const attachments = envelope.attachments.map(item => {
    validateAttachmentPath(item.relativePath);
    const buffer = decodeAndVerify(item.data, item.byteSize, item.sha256, `附件 ${item.relativePath}`);
    if (item.mimeType === 'application/pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BackupValidationError(`附件 ${item.relativePath} 不是有效 PDF`, 'ATTACHMENT_MAGIC_INVALID');
    }
    return { ...item, buffer };
  });

  const workDirectory = await mkdtemp(path.join(tmpdir(), 'ziwei-backup-inspect-'));
  const candidatePath = path.join(workDirectory, 'candidate.sqlite');
  try {
    await writeFile(candidatePath, database, { flag: 'wx' });
    const candidate = openVerifiedDatabase(candidatePath);
    let tableCounts: BackupTableCount[];
    let schemaVersion: number;
    let missingAttachmentCount = 0;
    try {
      tableCounts = readTableCounts(candidate);
      schemaVersion = readSchemaVersion(candidate);
      for (const required of REQUIRED_TABLES) {
        if (!tableCounts.some(item => item.name === required)) {
          throw new BackupValidationError(`数据库缺少必要数据表：${required}`, 'DATABASE_TABLE_MISSING');
        }
      }
      missingAttachmentCount = verifyAttachmentRecords(candidate, attachments);
    } finally {
      candidate.close();
    }
    if (schemaVersion !== envelope.schemaVersion) {
      throw new BackupValidationError('备份清单与数据库迁移版本不一致', 'SCHEMA_VERSION_MISMATCH');
    }
    assertInventoryMatches(envelope.inventory.tableCounts, tableCounts);
    const warnings = missingAttachmentCount > 0
      ? [`有 ${missingAttachmentCount} 份 PDF 在导出备份时已经缺失或损坏，报告正文仍可在恢复后重新导出。`]
      : [];
    return {
      envelope,
      database,
      attachments,
      preview: buildPreview(envelope, archive.length, tableCounts, warnings, fileName),
    };
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

function verifyAttachmentRecords(
  db: Database.Database,
  attachments: Array<BackupAttachmentManifest & { buffer: Buffer }>,
): number {
  const rows = db.prepare(`
    SELECT relative_path AS relativePath, mime_type AS mimeType, byte_size AS byteSize, sha256
    FROM report_exports
    WHERE status = 'completed' AND relative_path IS NOT NULL
  `).all() as Array<{ relativePath: string; mimeType: string; byteSize: number | null; sha256: string | null }>;
  const expected = new Map(rows.map(row => [`report-exports/${row.relativePath}`, row]));
  const included = new Set<string>();
  for (const attachment of attachments) {
    const record = expected.get(attachment.relativePath);
    if (!record) {
      throw new BackupValidationError(`附件 ${attachment.relativePath} 没有对应的数据库记录`, 'ATTACHMENT_RECORD_MISSING');
    }
    if (
      attachment.mimeType !== record.mimeType
      || attachment.byteSize !== record.byteSize
      || attachment.sha256 !== record.sha256
    ) {
      throw new BackupValidationError(`附件 ${attachment.relativePath} 与数据库记录不一致`, 'ATTACHMENT_RECORD_MISMATCH');
    }
    if (included.has(attachment.relativePath)) {
      throw new BackupValidationError(`附件 ${attachment.relativePath} 重复出现`, 'ATTACHMENT_DUPLICATED');
    }
    included.add(attachment.relativePath);
  }
  return Math.max(0, rows.length - included.size);
}

function validateEnvelopeShape(value: LocalBackupEnvelope): void {
  if (!value || typeof value !== 'object' || value.kind !== LOCAL_BACKUP_KIND) {
    throw new BackupValidationError('备份包类型不受支持', 'BACKUP_KIND_UNSUPPORTED');
  }
  if (value.formatVersion !== LOCAL_BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError(`备份格式版本 ${String(value.formatVersion)} 不受支持`, 'FORMAT_VERSION_INCOMPATIBLE');
  }
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
    throw new BackupValidationError('数据库迁移版本无效', 'SCHEMA_VERSION_INVALID');
  }
  if (!Number.isFinite(Date.parse(value.createdAt))) {
    throw new BackupValidationError('备份创建时间无效', 'CREATED_AT_INVALID');
  }
  if (!value.database || value.database.fileName !== 'ziweidoushu.sqlite') {
    throw new BackupValidationError('数据库快照清单无效', 'DATABASE_MANIFEST_INVALID');
  }
  if (!Array.isArray(value.attachments) || value.attachments.length > MAX_ATTACHMENT_COUNT) {
    throw new BackupValidationError('备份附件数量无效或超过安全上限', 'ATTACHMENT_COUNT_INVALID');
  }
  if (!value.inventory || !Array.isArray(value.inventory.tableCounts)) {
    throw new BackupValidationError('备份数据清单缺失', 'INVENTORY_MISSING');
  }
}

function decodeAndVerify(data: string, byteSize: number, sha256: string, label: string): Buffer {
  if (typeof data !== 'string' || !Number.isSafeInteger(byteSize) || byteSize < 0 || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new BackupValidationError(`${label}清单字段无效`, 'CONTENT_MANIFEST_INVALID');
  }
  const buffer = Buffer.from(data, 'base64');
  if (buffer.length !== byteSize) throw new BackupValidationError(`${label}大小校验失败`, 'CONTENT_SIZE_MISMATCH');
  if (digest(buffer) !== sha256) throw new BackupValidationError(`${label}指纹校验失败`, 'CONTENT_DIGEST_MISMATCH');
  return buffer;
}

function openVerifiedDatabase(databasePath: string): Database.Database {
  let db: Database.Database;
  try {
    db = new Database(databasePath, { readonly: true, fileMustExist: true });
  } catch {
    throw new BackupValidationError('数据库快照无法打开', 'DATABASE_OPEN_FAILED');
  }
  try {
    assertDatabaseIntegrity(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function assertDatabaseIntegrity(db: Database.Database): void {
  const integrity = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
    throw new BackupValidationError('数据库完整性检查失败', 'DATABASE_INTEGRITY_FAILED');
  }
  db.pragma('foreign_keys = ON');
  const foreignKeys = db.pragma('foreign_key_check') as unknown[];
  if (foreignKeys.length) {
    throw new BackupValidationError(`数据库存在 ${foreignKeys.length} 条外键异常`, 'DATABASE_FOREIGN_KEY_FAILED');
  }
}

function readSchemaVersion(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number | null };
  if (!Number.isInteger(row?.version) || (row.version ?? 0) < 1) {
    throw new BackupValidationError('数据库没有有效迁移版本', 'DATABASE_SCHEMA_MISSING');
  }
  return row.version!;
}

function readTableCounts(db: Database.Database): BackupTableCount[] {
  const names = (db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>).map(row => row.name);
  return names.map(name => ({
    name,
    rows: Number((db.prepare(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(name)}`).get() as { total: number }).total),
  }));
}

function assertInventoryMatches(expected: BackupTableCount[], actual: BackupTableCount[]): void {
  if (!Array.isArray(expected) || expected.length !== actual.length) {
    throw new BackupValidationError('备份数据表清单与数据库不一致', 'INVENTORY_TABLE_MISMATCH');
  }
  const actualMap = new Map(actual.map(item => [item.name, item.rows]));
  for (const item of expected) {
    if (typeof item?.name !== 'string' || !Number.isSafeInteger(item.rows) || actualMap.get(item.name) !== item.rows) {
      throw new BackupValidationError(`数据表 ${item?.name || '未知'} 的记录数校验失败`, 'INVENTORY_COUNT_MISMATCH');
    }
  }
}

function summarizeContent(tableCounts: BackupTableCount[]): BackupContentSummary {
  const counts = new Map(tableCounts.map(item => [item.name, item.rows]));
  const total = (...names: string[]) => names.reduce((sum, name) => sum + (counts.get(name) ?? 0), 0);
  return {
    conversations: total('conversations', 'bazi_conversations'),
    messages: total('messages', 'bazi_messages'),
    lifeEvents: total('life_events', 'life_event_candidates'),
    reports: total('reports', 'transit_reports', 'rectification_reports'),
    baziProfiles: total('bazi_birth_profiles'),
    learningRecords: total('learning_progress', 'learning_attempts', 'learning_practice_attempts', 'learning_open_practice_attempts', 'learning_notes'),
    reminders: total('reminder_rules', 'reminder_instances'),
  };
}

function buildPreview(
  envelope: LocalBackupEnvelope,
  archiveBytes: number,
  tableCounts: BackupTableCount[],
  warnings: string[],
  fileName = `本地备份${LOCAL_BACKUP_EXTENSION}`,
): BackupPreview {
  const currentSchemaVersion = readSchemaVersion(getDatabase());
  return {
    fileName,
    formatVersion: envelope.formatVersion,
    createdAt: envelope.createdAt,
    schemaVersion: envelope.schemaVersion,
    currentSchemaVersion,
    compatible: envelope.schemaVersion === currentSchemaVersion,
    databaseBytes: envelope.database.byteSize,
    archiveBytes,
    attachmentCount: envelope.attachments.length,
    attachmentBytes: envelope.attachments.reduce((total, item) => total + item.byteSize, 0),
    tableCount: tableCounts.length,
    content: summarizeContent(tableCounts),
    fingerprint: envelope.database.sha256.slice(0, 16),
    warnings,
  };
}

async function collectReportAttachments(): Promise<BackupAttachmentManifest[]> {
  const root = getReportExportRoot();
  const rows = getDatabase().prepare(`
    SELECT relative_path AS relativePath, mime_type AS mimeType, byte_size AS byteSize, sha256
    FROM report_exports
    WHERE status = 'completed' AND relative_path IS NOT NULL
    ORDER BY relative_path
  `).all() as Array<{ relativePath: string; mimeType: string; byteSize: number | null; sha256: string | null }>;
  const attachments: BackupAttachmentManifest[] = [];
  for (const row of rows) {
    const relativePath = `report-exports/${row.relativePath}`;
    validateAttachmentPath(relativePath);
    const target = resolveInsideRoot(root, row.relativePath);
    const buffer = await readFile(target).catch(() => null);
    if (!buffer || buffer.length !== row.byteSize || digest(buffer) !== row.sha256) continue;
    attachments.push({
      relativePath,
      mimeType: row.mimeType,
      byteSize: buffer.length,
      sha256: digest(buffer),
      data: buffer.toString('base64'),
    });
  }
  return attachments;
}

async function stageReportAttachments(
  stagedRoot: string,
  attachments: Array<BackupAttachmentManifest & { buffer: Buffer }>,
): Promise<void> {
  await mkdir(stagedRoot, { recursive: true });
  for (const attachment of attachments) {
    const fileName = attachment.relativePath.slice('report-exports/'.length);
    const target = resolveInsideRoot(stagedRoot, fileName);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, attachment.buffer, { flag: 'wx' });
  }
}

async function listAutomaticBackups(): Promise<LocalDataSummary['automaticBackups']> {
  const directory = path.join(path.dirname(getDatabasePath()), 'backups');
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const results: LocalDataSummary['automaticBackups'] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(AUTOMATIC_BACKUP_PREFIX) || !entry.name.endsWith(LOCAL_BACKUP_EXTENSION)) continue;
    const info = await stat(path.join(directory, entry.name)).catch(() => null);
    if (info) results.push({ fileName: entry.name, byteSize: info.size, createdAt: info.mtime.toISOString() });
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
}

async function removeWalSidecars(databasePath: string): Promise<void> {
  await rm(`${databasePath}-wal`, { force: true });
  await rm(`${databasePath}-shm`, { force: true });
}

async function isDirectory(target: string): Promise<boolean> {
  return Boolean((await stat(target).catch(() => null))?.isDirectory());
}

function validateAttachmentPath(relativePath: string): void {
  if (!/^report-exports\/[0-9a-f-]{36}\.pdf$/i.test(relativePath)) {
    throw new BackupValidationError('备份附件路径不在允许范围内', 'ATTACHMENT_PATH_INVALID');
  }
}

function resolveInsideRoot(root: string, relativePath: string): string {
  const normalizedRoot = path.resolve(root);
  const target = path.resolve(normalizedRoot, relativePath);
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new BackupValidationError('文件路径越过本地数据目录', 'PATH_TRAVERSAL_BLOCKED');
  }
  return target;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function digest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function fileTimestamp(value: string): string {
  return value.replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '');
}
