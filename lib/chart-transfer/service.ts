import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from '@/lib/db/client';
import {
  CHART_IMPORT_CONFIRMATION,
  CHART_PACKAGE_EXTENSION,
  CHART_PACKAGE_FORMAT_VERSION,
  CHART_PACKAGE_KIND,
} from './types';
import type {
  ChartPackageContentSummary,
  ChartPackageExportResult,
  ChartPackageFile,
  ChartPackageImportResult,
  ChartPackagePayload,
  ChartPackagePreview,
  PortableRow,
  PortableSqlValue,
} from './types';

const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
const MAX_PACKAGE_ROWS = 100_000;

/**
 * 仅迁移由单人命盘拥有、且能够在新会话下完整重建外键关系的数据。
 * 独立案例、校时工程、八字档案和 PDF 缓存保留在原数据库中。
 */
export const PORTABLE_CHART_TABLES = [
  'conversations',
  'messages',
  'memory_items',
  'context_runs',
  'transit_snapshots',
  'transit_reports',
  'transit_report_versions',
  'life_events',
  'event_transit_links',
  'reports',
  'report_versions',
  'report_evidence',
  'learning_notes',
  'learning_practice_attempts',
  'learning_open_practice_attempts',
  'life_event_extraction_runs',
  'life_event_candidates',
  'event_ai_analyses',
  'event_ai_analysis_versions',
  'event_ai_analysis_evidence',
  'reminder_rules',
  'reminder_instances',
  'monthly_reviews',
] as const;

const PACKAGE_BOUNDARIES = [
  '匿名案例属于独立学习资料，不随来源命盘复制。',
  '生时校正工程可能关联多份候选盘，不进入单命盘包。',
  '由命盘派生的八字档案使用独立版本链，不进入单命盘包。',
  'PDF 属于可重建缓存；报告正文和版本会迁移，PDF 可在导入后重新导出。',
] as const;

type PortableTable = typeof PORTABLE_CHART_TABLES[number];
type ColumnInfo = { name: string; type: string; notnull: 0 | 1; dflt_value: string | null; pk: number };
type ForeignKeyInfo = { table: string; from: string; to: string };
type TableSchema = { columns: ColumnInfo[]; foreignKeys: ForeignKeyInfo[] };

const SOFT_REFERENCES: Partial<Record<PortableTable, Partial<Record<string, PortableTable>>>> = {
  transit_reports: { active_version_id: 'transit_report_versions' },
  transit_report_versions: { base_version_id: 'transit_report_versions' },
  reports: { active_version_id: 'report_versions' },
  report_versions: { base_version_id: 'report_versions' },
  event_ai_analyses: { active_version_id: 'event_ai_analysis_versions' },
  event_ai_analysis_versions: { base_version_id: 'event_ai_analysis_versions' },
};

export class ChartPackageValidationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ChartPackageValidationError';
  }
}

export function createChartPackage(conversationId: string): ChartPackageExportResult {
  const db = getDatabase();
  const root = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as PortableRow | undefined;
  if (!root) throw new ChartPackageValidationError('要导出的命盘不存在', 'CONVERSATION_NOT_FOUND');
  if (root.type !== 'chart') throw new ChartPackageValidationError('单命盘迁移暂不支持合盘会话', 'CONVERSATION_TYPE_UNSUPPORTED');

  const schemas = readSchemas(db);
  const tables = collectConversationRows(db, schemas, root);
  const payload: ChartPackagePayload = { tables };
  const createdAt = new Date().toISOString();
  const inventoryTables = PORTABLE_CHART_TABLES
    .map(name => ({ name, rows: tables[name]?.length ?? 0 }))
    .filter(item => item.rows > 0);
  const totalRows = inventoryTables.reduce((total, item) => total + item.rows, 0);
  const source = {
    conversationId,
    title: String(root.title),
    type: 'chart' as const,
  };
  const inventory = { tables: inventoryTables, totalRows };
  const boundaries = [...PACKAGE_BOUNDARIES];
  const packageFile: ChartPackageFile = {
    kind: CHART_PACKAGE_KIND,
    formatVersion: CHART_PACKAGE_FORMAT_VERSION,
    createdAt,
    schemaVersion: readSchemaVersion(db),
    source,
    inventory,
    boundaries,
    contentSha256: digest(JSON.stringify({ source, inventory, boundaries, payload })),
    payload,
  };
  const buffer = Buffer.from(JSON.stringify(packageFile, null, 2));
  const fileName = `${safeFileName(String(root.title))}-${fileTimestamp(createdAt)}${CHART_PACKAGE_EXTENSION}`;
  return {
    buffer,
    fileName,
    preview: buildPreview(packageFile, buffer.length, fileName, db),
  };
}

export function inspectChartPackage(buffer: Buffer, fileName = `命盘数据包${CHART_PACKAGE_EXTENSION}`): ChartPackagePreview {
  const parsed = parseAndValidatePackage(buffer);
  return buildPreview(parsed, buffer.length, fileName, getDatabase());
}

export function importChartPackage(input: {
  buffer: Buffer;
  fileName?: string;
  confirmation: string;
  title?: string;
}): ChartPackageImportResult {
  if (input.confirmation !== CHART_IMPORT_CONFIRMATION) {
    throw new ChartPackageValidationError(`请输入“${CHART_IMPORT_CONFIRMATION}”确认创建新副本`, 'CONFIRMATION_REQUIRED');
  }
  const packageFile = parseAndValidatePackage(input.buffer);
  const db = getDatabase();
  const currentSchemaVersion = readSchemaVersion(db);
  if (packageFile.schemaVersion !== currentSchemaVersion) {
    throw new ChartPackageValidationError(
      `数据包数据库版本为 v${packageFile.schemaVersion}，当前应用要求 v${currentSchemaVersion}，已阻止导入`,
      'SCHEMA_VERSION_INCOMPATIBLE',
    );
  }

  const schemas = readSchemas(db);
  validateRowsAgainstCurrentSchema(packageFile, schemas);
  const sourceTitle = packageFile.source.title;
  const requestedTitle = input.title?.trim();
  if (requestedTitle && requestedTitle.length > 80) {
    throw new ChartPackageValidationError('导入后的命盘名称不能超过 80 个字符', 'TITLE_TOO_LONG');
  }
  const title = resolveAvailableTitle(db, requestedTitle || `${sourceTitle}（导入）`);
  const idMaps = createIdMaps(packageFile.payload.tables);
  const globalIdMap = createUnambiguousGlobalIdMap(idMaps);
  const now = Date.now();

  const importTransaction = db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    for (const table of PORTABLE_CHART_TABLES) {
      const rows = packageFile.payload.tables[table] ?? [];
      if (!rows.length) continue;
      const schema = schemas.get(table)!;
      const columnNames = schema.columns.map(column => column.name);
      const statement = db.prepare(`INSERT INTO ${quoteIdentifier(table)} (${columnNames.map(quoteIdentifier).join(', ')}) VALUES (${columnNames.map(() => '?').join(', ')})`);
      for (const sourceRow of rows) {
        const row = remapRow(table, sourceRow, schema, idMaps, globalIdMap);
        if (table === 'conversations') {
          row.title = title;
          row.status = 'active';
          row.updated_at = now;
        }
        statement.run(...columnNames.map(column => row[column]));
      }
    }
    const foreignKeyErrors = db.pragma('foreign_key_check') as unknown[];
    if (foreignKeyErrors.length) {
      throw new ChartPackageValidationError(`导入事务发现 ${foreignKeyErrors.length} 条外键异常`, 'IMPORT_FOREIGN_KEY_FAILED');
    }
  });

  try {
    importTransaction();
  } catch (error) {
    if (error instanceof ChartPackageValidationError) throw error;
    const message = error instanceof Error ? error.message : '未知数据库错误';
    throw new ChartPackageValidationError(`命盘导入事务已回滚：${message.slice(0, 180)}`, 'IMPORT_TRANSACTION_FAILED');
  }

  const sourceConversationId = packageFile.source.conversationId;
  const conversationId = idMaps.get('conversations')?.get(sourceConversationId);
  if (!conversationId) throw new ChartPackageValidationError('导入后命盘编号映射丢失', 'IMPORTED_ID_MISSING');
  return {
    conversationId,
    title,
    importedAt: new Date().toISOString(),
    importedRows: packageFile.inventory.totalRows,
    remappedIds: [...idMaps.values()].reduce((total, map) => total + map.size, 0),
  };
}

function collectConversationRows(
  db: Database.Database,
  schemas: Map<PortableTable, TableSchema>,
  root: PortableRow,
): Record<string, PortableRow[]> {
  const selected = new Map<PortableTable, Map<string, PortableRow>>();
  for (const table of PORTABLE_CHART_TABLES) selected.set(table, new Map());
  selected.get('conversations')!.set(String(root.id), clonePortableRow(root));

  let changed = true;
  while (changed) {
    changed = false;
    for (const table of PORTABLE_CHART_TABLES) {
      if (table === 'conversations') continue;
      const schema = schemas.get(table)!;
      const tableRows = selected.get(table)!;
      for (const foreignKey of schema.foreignKeys) {
        if (!isPortableTable(foreignKey.table)) continue;
        const parentIds = [...selected.get(foreignKey.table)!.keys()];
        for (const batch of chunks(parentIds, 400)) {
          if (!batch.length) continue;
          const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(foreignKey.from)} IN (${batch.map(() => '?').join(', ')})`).all(...batch) as PortableRow[];
          for (const row of rows) {
            const id = String(row.id);
            if (!tableRows.has(id)) {
              tableRows.set(id, clonePortableRow(row));
              changed = true;
            }
          }
        }
      }
    }
  }

  const result: Record<string, PortableRow[]> = {};
  for (const table of PORTABLE_CHART_TABLES) {
    const schema = schemas.get(table)!;
    const rows = [...selected.get(table)!.values()];
    for (const row of rows) {
      for (const foreignKey of schema.foreignKeys) {
        const value = row[foreignKey.from];
        if (value === null || value === undefined) continue;
        const parentSelected = isPortableTable(foreignKey.table)
          && selected.get(foreignKey.table)!.has(String(value));
        if (parentSelected) continue;
        const column = schema.columns.find(item => item.name === foreignKey.from);
        if (column?.notnull) {
          throw new ChartPackageValidationError(
            `${table}.${foreignKey.from} 存在无法迁移的必要外部依赖`,
            'REQUIRED_EXTERNAL_DEPENDENCY',
          );
        }
        row[foreignKey.from] = null;
      }
      for (const [columnName, parentTable] of Object.entries(SOFT_REFERENCES[table] ?? {})) {
        const value = row[columnName];
        if (value !== null && value !== undefined && parentTable && !selected.get(parentTable)!.has(String(value))) {
          row[columnName] = null;
        }
      }
    }
    result[table] = rows.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  }
  return result;
}

function parseAndValidatePackage(buffer: Buffer): ChartPackageFile {
  if (!buffer.length) throw new ChartPackageValidationError('命盘数据包为空', 'PACKAGE_EMPTY');
  if (buffer.length > MAX_PACKAGE_BYTES) throw new ChartPackageValidationError('命盘数据包超过 64 MB 上限', 'PACKAGE_TOO_LARGE');
  let packageFile: ChartPackageFile;
  try {
    packageFile = JSON.parse(buffer.toString('utf8')) as ChartPackageFile;
  } catch {
    throw new ChartPackageValidationError('命盘数据包不是有效 JSON', 'PACKAGE_JSON_INVALID');
  }
  if (!packageFile || packageFile.kind !== CHART_PACKAGE_KIND) {
    throw new ChartPackageValidationError('文件不是紫微单命盘数据包', 'PACKAGE_KIND_UNSUPPORTED');
  }
  if (packageFile.formatVersion !== CHART_PACKAGE_FORMAT_VERSION) {
    throw new ChartPackageValidationError(`命盘数据包格式版本 ${String(packageFile.formatVersion)} 不受支持`, 'FORMAT_VERSION_INCOMPATIBLE');
  }
  if (!Number.isFinite(Date.parse(packageFile.createdAt))) {
    throw new ChartPackageValidationError('数据包创建时间无效', 'CREATED_AT_INVALID');
  }
  if (!Number.isInteger(packageFile.schemaVersion) || packageFile.schemaVersion < 1) {
    throw new ChartPackageValidationError('数据包数据库版本无效', 'SCHEMA_VERSION_INVALID');
  }
  if (
    !packageFile.source
    || packageFile.source.type !== 'chart'
    || typeof packageFile.source.conversationId !== 'string'
    || typeof packageFile.source.title !== 'string'
  ) {
    throw new ChartPackageValidationError('数据包命盘来源信息无效', 'SOURCE_INVALID');
  }
  if (!packageFile.payload || !isPlainObject(packageFile.payload.tables)) {
    throw new ChartPackageValidationError('数据包业务数据缺失', 'PAYLOAD_MISSING');
  }
  if (digest(JSON.stringify({
    source: packageFile.source,
    inventory: packageFile.inventory,
    boundaries: packageFile.boundaries,
    payload: packageFile.payload,
  })) !== packageFile.contentSha256) {
    throw new ChartPackageValidationError('命盘数据包指纹校验失败', 'CONTENT_DIGEST_MISMATCH');
  }
  const unknownTables = Object.keys(packageFile.payload.tables).filter(name => !isPortableTable(name));
  if (unknownTables.length) {
    throw new ChartPackageValidationError(`数据包包含未授权数据表：${unknownTables.join('、')}`, 'TABLE_NOT_ALLOWED');
  }
  for (const table of PORTABLE_CHART_TABLES) {
    if (!Array.isArray(packageFile.payload.tables[table])) {
      throw new ChartPackageValidationError(`数据包缺少 ${table} 数据清单`, 'TABLE_PAYLOAD_MISSING');
    }
  }
  const calculatedInventory = PORTABLE_CHART_TABLES
    .map(name => ({ name, rows: packageFile.payload.tables[name].length }))
    .filter(item => item.rows > 0);
  const totalRows = calculatedInventory.reduce((total, item) => total + item.rows, 0);
  if (totalRows > MAX_PACKAGE_ROWS) throw new ChartPackageValidationError('命盘数据包记录数超过 100,000 条上限', 'ROW_LIMIT_EXCEEDED');
  if (
    !packageFile.inventory
    || packageFile.inventory.totalRows !== totalRows
    || JSON.stringify(packageFile.inventory.tables) !== JSON.stringify(calculatedInventory)
  ) {
    throw new ChartPackageValidationError('数据包记录清单与实际内容不一致', 'INVENTORY_MISMATCH');
  }
  if (!Array.isArray(packageFile.boundaries) || packageFile.boundaries.some(item => typeof item !== 'string')) {
    throw new ChartPackageValidationError('数据包迁移边界说明无效', 'BOUNDARIES_INVALID');
  }

  const db = getDatabase();
  const schemas = readSchemas(db);
  validateRowsAgainstCurrentSchema(packageFile, schemas);
  validatePackageRelations(packageFile, schemas);
  return packageFile;
}

function validateRowsAgainstCurrentSchema(
  packageFile: ChartPackageFile,
  schemas: Map<PortableTable, TableSchema>,
): void {
  for (const table of PORTABLE_CHART_TABLES) {
    const schema = schemas.get(table)!;
    const expectedColumns = schema.columns.map(column => column.name).sort();
    const seen = new Set<string>();
    for (const row of packageFile.payload.tables[table]) {
      if (!isPlainObject(row)) throw new ChartPackageValidationError(`${table} 包含无效记录`, 'ROW_INVALID');
      const rowColumns = Object.keys(row).sort();
      if (JSON.stringify(rowColumns) !== JSON.stringify(expectedColumns)) {
        throw new ChartPackageValidationError(`${table} 的字段结构与当前数据库不一致`, 'ROW_SCHEMA_MISMATCH');
      }
      for (const column of schema.columns) {
        const value = row[column.name];
        if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
          throw new ChartPackageValidationError(`${table}.${column.name} 包含不支持的数据类型`, 'VALUE_TYPE_INVALID');
        }
        if (typeof value === 'number' && (!Number.isFinite(value) || (column.type.toUpperCase().includes('INT') && !Number.isInteger(value)))) {
          throw new ChartPackageValidationError(`${table}.${column.name} 的数值格式无效`, 'NUMBER_FORMAT_INVALID');
        }
        if (value === null && column.notnull && column.dflt_value === null) {
          throw new ChartPackageValidationError(`${table}.${column.name} 不能为空`, 'REQUIRED_VALUE_MISSING');
        }
      }
      const id = row.id;
      if (typeof id !== 'string' || !id) throw new ChartPackageValidationError(`${table} 的主键无效`, 'PRIMARY_KEY_INVALID');
      if (seen.has(id)) throw new ChartPackageValidationError(`${table} 包含重复主键`, 'PRIMARY_KEY_DUPLICATED');
      seen.add(id);
    }
  }
  const conversations = packageFile.payload.tables.conversations;
  if (conversations.length !== 1 || conversations[0].id !== packageFile.source.conversationId || conversations[0].type !== 'chart') {
    throw new ChartPackageValidationError('数据包必须且只能包含一份来源单人命盘', 'ROOT_CONVERSATION_INVALID');
  }
}

function validatePackageRelations(
  packageFile: ChartPackageFile,
  schemas: Map<PortableTable, TableSchema>,
): void {
  const ids = new Map<PortableTable, Set<string>>();
  for (const table of PORTABLE_CHART_TABLES) {
    ids.set(table, new Set(packageFile.payload.tables[table].map(row => String(row.id))));
  }
  for (const table of PORTABLE_CHART_TABLES) {
    for (const row of packageFile.payload.tables[table]) {
      for (const foreignKey of schemas.get(table)!.foreignKeys) {
        const value = row[foreignKey.from];
        if (value === null || value === undefined) continue;
        if (!isPortableTable(foreignKey.table) || !ids.get(foreignKey.table)!.has(String(value))) {
          throw new ChartPackageValidationError(`${table}.${foreignKey.from} 引用了数据包外部记录`, 'RELATION_OUTSIDE_PACKAGE');
        }
      }
      for (const [columnName, parentTable] of Object.entries(SOFT_REFERENCES[table] ?? {})) {
        const value = row[columnName];
        if (value !== null && value !== undefined && parentTable && !ids.get(parentTable)!.has(String(value))) {
          throw new ChartPackageValidationError(`${table}.${columnName} 引用了数据包外部版本`, 'SOFT_RELATION_OUTSIDE_PACKAGE');
        }
      }
    }
  }
}

function buildPreview(
  packageFile: ChartPackageFile,
  packageBytes: number,
  fileName: string,
  db: Database.Database,
): ChartPackagePreview {
  const currentSchemaVersion = readSchemaVersion(db);
  return {
    fileName,
    createdAt: packageFile.createdAt,
    sourceConversationId: packageFile.source.conversationId,
    sourceTitle: packageFile.source.title,
    suggestedTitle: resolveAvailableTitle(db, `${packageFile.source.title}（导入）`),
    schemaVersion: packageFile.schemaVersion,
    currentSchemaVersion,
    compatible: packageFile.schemaVersion === currentSchemaVersion,
    packageBytes,
    tableCount: packageFile.inventory.tables.length,
    totalRows: packageFile.inventory.totalRows,
    idConflictCount: countIdConflicts(db, packageFile.payload.tables),
    strategy: 'create_copy',
    content: summarizeContent(packageFile.payload.tables),
    boundaries: packageFile.boundaries,
    fingerprint: packageFile.contentSha256.slice(0, 16),
  };
}

function countIdConflicts(db: Database.Database, tables: Record<string, PortableRow[]>): number {
  let total = 0;
  for (const table of PORTABLE_CHART_TABLES) {
    const ids = tables[table].map(row => String(row.id));
    for (const batch of chunks(ids, 400)) {
      if (!batch.length) continue;
      const row = db.prepare(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(table)} WHERE id IN (${batch.map(() => '?').join(', ')})`).get(...batch) as { total: number };
      total += row.total;
    }
  }
  return total;
}

function createIdMaps(tables: Record<string, PortableRow[]>): Map<PortableTable, Map<string, string>> {
  const result = new Map<PortableTable, Map<string, string>>();
  for (const table of PORTABLE_CHART_TABLES) {
    result.set(table, new Map(tables[table].map(row => [String(row.id), randomUUID()])));
  }
  return result;
}

function createUnambiguousGlobalIdMap(
  idMaps: Map<PortableTable, Map<string, string>>,
): Map<string, string> {
  const result = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const tableMap of idMaps.values()) {
    for (const [source, target] of tableMap) {
      if (result.has(source)) ambiguous.add(source);
      else result.set(source, target);
    }
  }
  for (const source of ambiguous) result.delete(source);
  return result;
}

function remapRow(
  table: PortableTable,
  source: PortableRow,
  schema: TableSchema,
  idMaps: Map<PortableTable, Map<string, string>>,
  globalIdMap: Map<string, string>,
): PortableRow {
  const row = { ...source };
  row.id = idMaps.get(table)!.get(String(source.id))!;
  for (const foreignKey of schema.foreignKeys) {
    const value = row[foreignKey.from];
    if (value === null || value === undefined || !isPortableTable(foreignKey.table)) continue;
    const mapped = idMaps.get(foreignKey.table)!.get(String(value));
    if (!mapped) throw new ChartPackageValidationError(`${table}.${foreignKey.from} 无法重新映射`, 'FOREIGN_KEY_REMAP_FAILED');
    row[foreignKey.from] = mapped;
  }
  for (const [columnName, parentTable] of Object.entries(SOFT_REFERENCES[table] ?? {})) {
    const value = row[columnName];
    if (value === null || value === undefined || !parentTable) continue;
    const mapped = idMaps.get(parentTable)!.get(String(value));
    if (!mapped) throw new ChartPackageValidationError(`${table}.${columnName} 无法重新映射`, 'SOFT_REFERENCE_REMAP_FAILED');
    row[columnName] = mapped;
  }
  for (const column of schema.columns) {
    if (isJsonColumn(column.name) && typeof row[column.name] === 'string') {
      row[column.name] = remapJsonString(String(row[column.name]), globalIdMap);
    }
  }
  return row;
}

function remapJsonString(value: string, idMap: Map<string, string>): string {
  try {
    return JSON.stringify(deepRemap(JSON.parse(value) as unknown, idMap));
  } catch {
    return value;
  }
}

function deepRemap(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === 'string') return idMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map(item => deepRemap(item, idMap));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepRemap(item, idMap)]));
  }
  return value;
}

function summarizeContent(tables: Record<string, PortableRow[]>): ChartPackageContentSummary {
  const count = (...names: string[]) => names.reduce((total, name) => total + (tables[name]?.length ?? 0), 0);
  return {
    messages: count('messages', 'context_runs'),
    memories: count('memory_items'),
    transitRecords: count('transit_snapshots', 'transit_reports', 'transit_report_versions'),
    events: count('life_events', 'life_event_candidates', 'event_ai_analysis_versions'),
    reports: count('reports', 'report_versions', 'transit_reports', 'transit_report_versions'),
    learningRecords: count('learning_notes', 'learning_practice_attempts', 'learning_open_practice_attempts'),
    reminders: count('reminder_rules', 'reminder_instances'),
    monthlyReviews: count('monthly_reviews'),
  };
}

function readSchemas(db: Database.Database): Map<PortableTable, TableSchema> {
  const result = new Map<PortableTable, TableSchema>();
  for (const table of PORTABLE_CHART_TABLES) {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as ColumnInfo[];
    if (!columns.length) throw new ChartPackageValidationError(`当前数据库缺少 ${table} 数据表`, 'CURRENT_SCHEMA_TABLE_MISSING');
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all() as ForeignKeyInfo[];
    result.set(table, { columns, foreignKeys });
  }
  return result;
}

function readSchemaVersion(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number | null };
  if (!Number.isInteger(row.version) || (row.version ?? 0) < 1) {
    throw new ChartPackageValidationError('当前数据库迁移版本无效', 'CURRENT_SCHEMA_INVALID');
  }
  return row.version!;
}

function resolveAvailableTitle(db: Database.Database, base: string): string {
  const normalizedBase = base.trim().slice(0, 80) || '导入命盘';
  let candidate = normalizedBase;
  let sequence = 2;
  while (db.prepare('SELECT 1 FROM conversations WHERE title = ? LIMIT 1').get(candidate)) {
    const suffix = ` ${sequence}`;
    candidate = `${normalizedBase.slice(0, 80 - suffix.length)}${suffix}`;
    sequence += 1;
  }
  return candidate;
}

function clonePortableRow(row: PortableRow): PortableRow {
  const result: PortableRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
      throw new ChartPackageValidationError(`字段 ${key} 使用了单命盘包不支持的数据类型`, 'UNSUPPORTED_SQLITE_VALUE');
    }
    result[key] = value as PortableSqlValue;
  }
  return result;
}

function isPortableTable(value: string): value is PortableTable {
  return (PORTABLE_CHART_TABLES as readonly string[]).includes(value);
}

function isJsonColumn(name: string): boolean {
  return name.endsWith('_json') || name === 'content_json';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim().slice(0, 64) || '紫微命盘';
}

function fileTimestamp(value: string): string {
  return value.replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '');
}
