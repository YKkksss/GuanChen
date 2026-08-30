import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  claimReportExport,
  completeReportExport,
  failReportExport,
  getReportExport,
  listCompletedReportExportPaths,
} from '@/lib/db/report-exports';
import { REPORT_PDF_RENDERER_VERSION, renderReportPdf } from './pdf-renderer';
import { resolveReportExportDocument } from './source';
import type { EnsureReportExportInput, ReportExportRecord } from './types';

const EXPORT_STALE_MS = 2 * 60 * 1000;

export class ReportExportBusyError extends Error {
  constructor(public readonly exportId: string) {
    super('PDF 正在生成，请稍后重试');
    this.name = 'ReportExportBusyError';
  }
}

export async function ensureReportPdfExport(input: EnsureReportExportInput): Promise<{
  record: ReportExportRecord;
  reused: boolean;
}> {
  const document = resolveReportExportDocument(input);
  await pruneOrphanedReportExportFiles(EXPORT_STALE_MS);
  let claim = claimReportExport({
    sourceKind: document.sourceKind,
    sourceReportId: document.sourceReportId,
    sourceVersionId: document.sourceVersionId,
    sourceFingerprint: document.sourceFingerprint,
    rendererVersion: REPORT_PDF_RENDERER_VERSION,
    fileName: buildDownloadFileName(document.title, document.versionLabel),
    staleAfterMs: EXPORT_STALE_MS,
  });

  if (!claim.claimed && claim.record.status === 'completed') {
    try {
      await readReportExportFile(claim.record.id);
      return { record: claim.record, reused: true };
    } catch {
      failReportExport(claim.record.id, 'PDF_EXPORT_FILE_MISSING_OR_CORRUPTED');
      claim = claimReportExport({
        sourceKind: document.sourceKind,
        sourceReportId: document.sourceReportId,
        sourceVersionId: document.sourceVersionId,
        sourceFingerprint: document.sourceFingerprint,
        rendererVersion: REPORT_PDF_RENDERER_VERSION,
        fileName: buildDownloadFileName(document.title, document.versionLabel),
        staleAfterMs: 0,
      });
    }
  }
  if (!claim.claimed) throw new ReportExportBusyError(claim.record.id);

  const root = getReportExportRoot();
  const relativePath = `${claim.record.id}.pdf`;
  const finalPath = resolveInsideRoot(root, relativePath);
  const tempPath = resolveInsideRoot(root, `.${claim.record.id}.${randomUUID()}.tmp`);
  try {
    await mkdir(root, { recursive: true });
    const buffer = await renderReportPdf(document);
    await writeFile(tempPath, buffer, { flag: 'wx' });
    await rm(finalPath, { force: true });
    await rename(tempPath, finalPath);
    const sha256 = digest(buffer);
    const completed = completeReportExport({
      id: claim.record.id,
      relativePath,
      byteSize: buffer.length,
      sha256,
    });
    if (!completed) throw new Error('PDF_EXPORT_RECORD_LOST');
    return { record: completed, reused: false };
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    await rm(finalPath, { force: true }).catch(() => undefined);
    failReportExport(
      claim.record.id,
      error instanceof Error ? error.message : 'PDF_EXPORT_GENERATION_FAILED',
    );
    throw error;
  }
}

export async function readReportExportFile(exportId: string): Promise<{
  record: ReportExportRecord;
  buffer: Buffer;
}> {
  const record = getReportExport(exportId);
  if (!record || record.status !== 'completed' || !record.relativePath || !record.sha256 || !record.byteSize) {
    throw new Error('PDF 导出文件不存在或尚未完成');
  }
  const absolutePath = resolveInsideRoot(getReportExportRoot(), record.relativePath);
  const fileStat = await stat(absolutePath).catch(() => null);
  if (!fileStat?.isFile() || fileStat.size !== record.byteSize) {
    throw new Error('PDF 导出文件大小校验失败');
  }
  const buffer = await readFile(absolutePath);
  if (digest(buffer) !== record.sha256 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('PDF 导出文件完整性校验失败');
  }
  return { record, buffer };
}

export async function pruneOrphanedReportExportFiles(minimumAgeMs = 0): Promise<number> {
  const root = getReportExportRoot();
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  if (!entries.length) return 0;
  const retained = new Set(listCompletedReportExportPaths());
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const isPdf = /^[0-9a-f-]{36}\.pdf$/i.test(entry.name);
    const isTemporary = /^\.[0-9a-f-]{36}\.[0-9a-f-]{36}\.tmp$/i.test(entry.name);
    if ((!isPdf && !isTemporary) || (isPdf && retained.has(entry.name))) continue;
    const target = resolveInsideRoot(root, entry.name);
    const fileStat = await stat(target).catch(() => null);
    if (!fileStat || Date.now() - fileStat.mtimeMs < minimumAgeMs) continue;
    await rm(target, { force: true });
    removed += 1;
  }
  return removed;
}

export function getReportExportRoot(): string {
  return path.resolve(process.env.REPORT_EXPORT_DIR || path.join(process.cwd(), 'data', 'report-exports'));
}

function resolveInsideRoot(root: string, relativePath: string): string {
  const normalizedRoot = path.resolve(root);
  const target = path.resolve(normalizedRoot, relativePath);
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error('PDF_EXPORT_PATH_INVALID');
  }
  return target;
}

function buildDownloadFileName(title: string, versionLabel: string): string {
  const safeTitle = title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 72) || '分析报告';
  const safeVersion = versionLabel.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 24) || 'latest';
  return `${safeTitle}-${safeVersion}.pdf`;
}

function digest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
