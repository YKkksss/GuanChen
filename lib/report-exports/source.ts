import { createHash } from 'node:crypto';
import { getConversation } from '@/lib/db/conversations';
import { getRectificationReportDetail } from '@/lib/db/rectification-reports';
import { getReportDetail } from '@/lib/db/reports';
import { getAnnualTransitReportById } from '@/lib/db/transit-reports';
import type { RectificationReportEvidence } from '@/lib/rectification/report-types';
import type { ReportEvidence } from '@/lib/reports/types';
import type {
  EnsureReportExportInput,
  ReportExportDocument,
  ReportExportEvidenceLine,
  ReportExportSection,
} from './types';

const CULTURE_DISCLAIMER = '本报告属于传统文化研究与自我观察参考，不构成医疗、投资、法律、婚姻或其他专业决策建议。';

export function resolveReportExportDocument(input: EnsureReportExportInput): ReportExportDocument {
  if (input.sourceKind === 'annual') return resolveAnnualDocument(input.reportId);
  if (input.sourceKind === 'rectification') return resolveRectificationDocument(input);
  return resolveTopicDocument(input);
}

function resolveTopicDocument(input: EnsureReportExportInput): ReportExportDocument {
  const detail = getReportDetail(input.reportId, input.version);
  if (!detail) throw new Error('报告不存在');
  if (input.version && !detail.version) throw new Error('报告版本不存在');
  const version = detail.version;
  if (!version || version.status !== 'completed' || !version.content) {
    throw new Error('只有已完成的报告版本可以导出 PDF');
  }
  const conversation = getConversation(detail.report.conversationId);
  if (!conversation) throw new Error('报告关联会话不存在');
  const expectedKind = conversation.type === 'heming' ? 'heming' : 'topic';
  if (expectedKind !== input.sourceKind) throw new Error('报告类型与导出类型不一致');

  const evidenceBySection = groupEvidence(detail.evidence);
  const sections = version.content.sections.map(section => ({
    key: section.key,
    title: section.title,
    content: section.content,
    basisLabel: section.basis === 'evidence'
      ? `${(evidenceBySection.get(section.key) ?? []).length} 条结构化依据`
      : '综合观察',
    evidence: (evidenceBySection.get(section.key) ?? []).map(summarizeReportEvidence),
  }));
  const sourceFingerprint = fingerprint({
    sourceKind: input.sourceKind,
    reportId: detail.report.id,
    version,
    evidence: detail.evidence,
  });
  return {
    sourceKind: input.sourceKind,
    sourceReportId: detail.report.id,
    sourceVersionId: version.id,
    sourceFingerprint,
    title: detail.report.title,
    categoryLabel: input.sourceKind === 'heming' ? '紫微斗数合盘关系报告' : '紫微斗数专题报告',
    versionLabel: `v${version.version}`,
    generatedAt: Date.now(),
    sourceCompletedAt: version.completedAt,
    metadata: [
      { label: '报告版本', value: `v${version.version}` },
      { label: '规则引擎', value: version.engineVersion },
      { label: '提示词版本', value: version.promptVersion },
      { label: '生成模型', value: `${version.provider} / ${version.model}` },
      { label: '结构化依据', value: `${detail.evidence.length} 条` },
    ],
    summary: version.content.summary,
    sections,
    actionItems: version.content.actionItems,
    openQuestions: version.content.openQuestions,
    disclaimer: version.content.disclaimer || CULTURE_DISCLAIMER,
  };
}

function resolveAnnualDocument(reportId: string): ReportExportDocument {
  const report = getAnnualTransitReportById(reportId);
  if (!report) throw new Error('年度报告不存在');
  if (report.status !== 'completed' || !report.content.trim()) {
    throw new Error('只有已完成的年度报告可以导出 PDF');
  }
  const conversation = getConversation(report.conversationId);
  if (!conversation || conversation.type !== 'chart') throw new Error('年度报告关联命盘不存在');
  const parsed = parseAnnualContent(report.content);
  const sourceFingerprint = fingerprint({
    sourceKind: 'annual',
    report,
  });
  const year = Number.parseInt(report.targetDate.slice(0, 4), 10);
  return {
    sourceKind: 'annual',
    sourceReportId: report.id,
    sourceVersionId: report.id,
    sourceFingerprint,
    title: `${year} 年度总结报告`,
    categoryLabel: '紫微斗数年度运势报告',
    versionLabel: report.engineVersion,
    generatedAt: Date.now(),
    sourceCompletedAt: report.completedAt,
    metadata: [
      { label: '分析年份', value: String(year) },
      { label: '规则引擎', value: report.engineVersion },
      { label: '提示词版本', value: report.promptVersion },
      { label: '生成模型', value: `${report.provider} / ${report.model}` },
      { label: '报告来源', value: '本地已保存命盘' },
    ],
    summary: parsed.summary,
    sections: parsed.sections,
    actionItems: [],
    openQuestions: [],
    disclaimer: CULTURE_DISCLAIMER,
  };
}

function resolveRectificationDocument(input: EnsureReportExportInput): ReportExportDocument {
  const detail = getRectificationReportDetail(input.reportId, input.version);
  if (!detail) throw new Error('校时报告不存在');
  if (input.version && !detail.version) throw new Error('校时报告版本不存在');
  const version = detail.version;
  if (!version || version.status !== 'completed' || !version.content) {
    throw new Error('只有已完成的校时报告版本可以导出 PDF');
  }
  const evidenceBySection = groupRectificationEvidence(detail.evidence);
  const sourceFingerprint = fingerprint({
    sourceKind: 'rectification',
    reportId: detail.report.id,
    version,
    evidence: detail.evidence,
  });
  return {
    sourceKind: 'rectification',
    sourceReportId: detail.report.id,
    sourceVersionId: version.id,
    sourceFingerprint,
    title: detail.report.title,
    categoryLabel: '紫微斗数出生时辰校正报告',
    versionLabel: `v${version.version}`,
    generatedAt: Date.now(),
    sourceCompletedAt: version.completedAt,
    metadata: [
      { label: '报告版本', value: `v${version.version}` },
      { label: '方法版本', value: version.methodologyVersion },
      { label: '评估引擎', value: version.evaluationEngineVersion },
      { label: '提示词版本', value: version.promptVersion },
      { label: '生成模型', value: `${version.provider} / ${version.model}` },
    ],
    summary: version.content.summary,
    sections: version.content.sections.map(section => ({
      key: section.key,
      title: section.title,
      content: section.content,
      basisLabel: (evidenceBySection.get(section.key) ?? []).length
        ? `${(evidenceBySection.get(section.key) ?? []).length} 条校时依据`
        : '综合观察',
      evidence: (evidenceBySection.get(section.key) ?? []).map(summarizeRectificationEvidence),
    })),
    actionItems: version.content.actionItems,
    openQuestions: version.content.openQuestions,
    disclaimer: version.content.disclaimer || CULTURE_DISCLAIMER,
  };
}

export function parseAnnualContent(content: string): {
  summary: string;
  sections: ReportExportSection[];
} {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const intro: string[] = [];
  const sections: ReportExportSection[] = [];
  let current: ReportExportSection | null = null;
  for (const rawLine of lines) {
    const line = stripInlineMarkdown(rawLine.trim());
    const heading = rawLine.trim().match(/^\*{0,2}【(.+?)】\*{0,2}$/);
    if (heading) {
      current = {
        key: `annual_${sections.length + 1}`,
        title: heading[1].trim(),
        content: '',
        basisLabel: '年度综合分析',
        evidence: [],
      };
      sections.push(current);
      continue;
    }
    if (!line) continue;
    if (current) current.content = [current.content, line].filter(Boolean).join('\n');
    else intro.push(line);
  }
  const nonEmptySections = sections.filter(section => section.content.trim());
  if (!nonEmptySections.length) {
    nonEmptySections.push({
      key: 'annual_summary',
      title: '年度综合分析',
      content: intro.join('\n') || stripInlineMarkdown(content.trim()),
      basisLabel: '年度综合分析',
      evidence: [],
    });
    return { summary: '', sections: nonEmptySections };
  }
  return { summary: intro.join('\n'), sections: nonEmptySections };
}

function groupEvidence(items: ReportEvidence[]) {
  const map = new Map<string, ReportEvidence[]>();
  for (const item of items) map.set(item.sectionKey, [...(map.get(item.sectionKey) ?? []), item]);
  return map;
}

function groupRectificationEvidence(items: RectificationReportEvidence[]) {
  const map = new Map<string, RectificationReportEvidence[]>();
  for (const item of items) map.set(item.sectionKey, [...(map.get(item.sectionKey) ?? []), item]);
  return map;
}

function summarizeReportEvidence(item: ReportEvidence): ReportExportEvidenceLine {
  if (item.kind === 'confirmed_event') {
    return line(item.label, `${String(item.facts.startDate ?? '时间未知')} · ${String(item.facts.description ?? '用户已确认')}`);
  }
  if (item.kind === 'daxian') {
    return line(item.label, `${String(item.facts.startAge ?? '')}-${String(item.facts.endAge ?? '')} 岁 · ${String(item.facts.palaceName ?? '')}`);
  }
  if (item.kind === 'heming_rule') {
    return line(item.label, `规则 ${String(item.facts.ruleId ?? '')} · ${String(item.facts.phase ?? '')} · ${String(item.facts.level ?? '')}`);
  }
  if (item.kind === 'heming_palace') {
    return line(item.label, `${String(item.facts.owner ?? '')}方 · ${String(item.facts.palace ?? '')}（${String(item.facts.branch ?? '')}）`);
  }
  if (item.kind === 'heming_stage') {
    return line(item.label, `${String(item.facts.owner ?? '')}方 · ${String(item.facts.startAge ?? '')}-${String(item.facts.endAge ?? '')} 岁`);
  }
  if (item.kind === 'pattern') {
    return line(item.label, String(item.facts.description ?? '程序识别结构'));
  }
  if (item.kind === 'palace') {
    const stars = Array.isArray(item.facts.stars)
      ? item.facts.stars.map(value => objectName(value)).filter(Boolean).join('、')
      : '';
    return line(item.label, stars ? `星曜：${stars}` : '命盘宫位结构');
  }
  return line(item.label, item.source === 'user_confirmed' ? '用户已确认事实' : '结构化命盘依据');
}

function summarizeRectificationEvidence(item: RectificationReportEvidence): ReportExportEvidenceLine {
  if (item.kind === 'candidate_summary') return line(item.label, `第 ${String(item.facts.rank)} 位 · 相对证据指数 ${String(item.facts.relativeEvidenceIndex)} · ${String(item.facts.confidence)} 置信度`);
  if (item.kind === 'rule_hit') return line(item.label, `${String(item.facts.ruleId ?? '')} · ${String(item.facts.outcome ?? '')} · 权重 ${String(item.facts.adjustedWeight ?? '')}`);
  if (item.kind === 'confirmed_event') return line(item.label, `${String(item.facts.startDate || '时间未知')} · ${String(item.facts.categoryLabel || '')} · 影响等级 ${String(item.facts.impactLevel ?? '')}`);
  if (item.kind === 'selection') return line(item.label, `人工选定 · 第 ${String(item.facts.rank ?? '')} 位 · ${String(item.facts.note || '未填写补充说明')}`);
  if (item.kind === 'stability') return line(item.label, `${item.facts.stable ? '稳定' : '尚不稳定'} · 顶部差距 ${String(item.facts.topMarginRatio ?? '无')}`);
  return line(item.label, '评估版本、证据就绪度与候选排序的不可变事实快照');
}

function line(label: string, detail: string): ReportExportEvidenceLine {
  return { label: label.trim(), detail: detail.trim() };
}

function objectName(value: unknown): string {
  return typeof value === 'object' && value !== null && 'name' in value
    ? String((value as { name?: unknown }).name ?? '')
    : '';
}

function stripInlineMarkdown(value: string): string {
  return value.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^[-*]\s+/, '').trim();
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
