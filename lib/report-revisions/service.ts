import { getConversation } from '@/lib/db/conversations';
import { getRectificationReportDetail } from '@/lib/db/rectification-reports';
import { getReportDetail } from '@/lib/db/reports';
import { getAnnualTransitReportById } from '@/lib/db/transit-reports';
import type { ReportContent } from '@/lib/reports/types';
import type {
  ReportEditableContent,
  ReportRevisionSourceKind,
  ResolvedReportRevisionSource,
} from './types';

const MAX_TEXT_LENGTH = 80_000;
const MAX_LIST_ITEMS = 30;

export function resolveReportRevisionSource(input: {
  sourceKind: ReportRevisionSourceKind;
  reportId: string;
  version?: number;
}): ResolvedReportRevisionSource {
  if (input.sourceKind === 'annual') return resolveAnnual(input.reportId, input.version);
  if (input.sourceKind === 'rectification') return resolveRectification(input.reportId, input.version);
  return resolveStructured(input.sourceKind, input.reportId, input.version);
}

export function normalizeEditedContent(
  original: ReportEditableContent,
  candidate: unknown,
): ReportEditableContent | null {
  if (candidate === null) return null;
  if (!candidate || typeof candidate !== 'object') throw new Error('人工修订内容无效');
  const value = candidate as { format?: unknown; content?: unknown };

  if (original.format === 'plain_text') {
    if (value.format !== 'plain_text' || typeof value.content !== 'string') {
      throw new Error('年度报告修订内容格式无效');
    }
    const content = cleanText(value.content, MAX_TEXT_LENGTH, '年度报告修订内容');
    if (!content) throw new Error('年度报告修订内容不能为空');
    return { format: 'plain_text', content };
  }

  if (value.format !== 'structured' || !value.content || typeof value.content !== 'object') {
    throw new Error('结构化报告修订内容格式无效');
  }
  const submitted = value.content as Partial<ReportContent>;
  const originalContent = original.content;
  const submittedSections = Array.isArray(submitted.sections) ? submitted.sections : [];
  const byKey = new Map(submittedSections.map(section => [section?.key, section]));
  const content: ReportContent = {
    ...originalContent,
    summary: cleanText(submitted.summary, MAX_TEXT_LENGTH, '报告摘要'),
    sections: originalContent.sections.map(section => ({
      ...section,
      content: cleanText(byKey.get(section.key)?.content, MAX_TEXT_LENGTH, `“${section.title}”正文`),
    })),
    actionItems: cleanStringList(submitted.actionItems, '执行清单'),
    openQuestions: cleanStringList(submitted.openQuestions, '待确认问题'),
    // 免责声明、章节标识和证据映射属于系统审计边界，不允许人工覆盖。
    disclaimer: originalContent.disclaimer,
  };
  return { format: 'structured', content };
}

function resolveStructured(
  sourceKind: 'topic' | 'heming',
  reportId: string,
  version?: number,
): ResolvedReportRevisionSource {
  const detail = getReportDetail(reportId, version);
  if (!detail) throw new Error('报告不存在');
  const reportVersion = detail.version;
  if (!reportVersion || reportVersion.status !== 'completed' || !reportVersion.content) {
    throw new Error('只有已完成的报告版本可以确认或修订');
  }
  const conversation = getConversation(detail.report.conversationId);
  const expectedKind = conversation?.type === 'heming' ? 'heming' : 'topic';
  if (!conversation || expectedKind !== sourceKind) throw new Error('报告类型与来源类型不一致');
  return {
    sourceKind,
    reportId,
    versionId: reportVersion.id,
    version: reportVersion.version,
    originalContent: { format: 'structured', content: reportVersion.content },
  };
}

function resolveAnnual(reportId: string, version?: number): ResolvedReportRevisionSource {
  const report = getAnnualTransitReportById(reportId, version);
  if (!report) throw new Error('年度报告不存在');
  if (report.status !== 'completed' || !report.versionId || !report.version || !report.content.trim()) {
    throw new Error('只有已完成的年度报告版本可以确认或修订');
  }
  return {
    sourceKind: 'annual',
    reportId,
    versionId: report.versionId,
    version: report.version,
    originalContent: { format: 'plain_text', content: report.content },
  };
}

function resolveRectification(reportId: string, version?: number): ResolvedReportRevisionSource {
  const detail = getRectificationReportDetail(reportId, version);
  if (!detail) throw new Error('校时报告不存在');
  const reportVersion = detail.version;
  if (!reportVersion || reportVersion.status !== 'completed' || !reportVersion.content) {
    throw new Error('只有已完成的校时报告版本可以确认或修订');
  }
  return {
    sourceKind: 'rectification',
    reportId,
    versionId: reportVersion.id,
    version: reportVersion.version,
    originalContent: { format: 'structured', content: reportVersion.content },
  };
}

function cleanText(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label}格式无效`);
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (normalized.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符`);
  return normalized;
}

function cleanStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}格式无效`);
  if (value.length > MAX_LIST_ITEMS) throw new Error(`${label}不能超过 ${MAX_LIST_ITEMS} 项`);
  return value.map((item, index) => cleanText(item, 2_000, `${label}第 ${index + 1} 项`)).filter(Boolean);
}
