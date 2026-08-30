import { getConversation } from '@/lib/db/conversations';
import { getRectificationReportDetail } from '@/lib/db/rectification-reports';
import { getReportDetail } from '@/lib/db/reports';
import { getAnnualTransitReportDetail } from '@/lib/db/transit-reports';
import { getTransitSnapshotById } from '@/lib/db/transits';
import type { RectificationReportEvidence } from '@/lib/rectification/report-types';
import { REPORT_GENERATION_REASON_LABELS, type ReportEvidence, type ReportGenerationReason } from '@/lib/reports/types';
import type {
  ReportComparisonSourceKind,
  ReportComparisonVersion,
  ReportEvidenceDifference,
  ReportListDifference,
  ReportMetadataDifference,
  ReportSectionDifference,
  ReportVersionComparison,
} from './types';

interface ComparableSection {
  key: string;
  title: string;
  content: string;
}

interface ComparableEvidence {
  sectionKey: string;
  evidenceKey: string;
  label: string;
  facts: Record<string, unknown>;
}

interface ComparableReportVersion {
  reportTitle: string;
  version: ReportComparisonVersion;
  metadata: Record<string, string>;
  summary: string;
  sections: ComparableSection[];
  evidence: ComparableEvidence[];
  actionItems: string[];
  openQuestions: string[];
}

const METADATA_LABELS: Record<string, string> = {
  engineVersion: '规则引擎',
  methodologyVersion: '方法版本',
  evaluationEngineVersion: '评估引擎',
  evaluationId: '评估版本',
  snapshotId: '运限事实快照',
  promptVersion: '提示词模板',
  provider: '模型供应商',
  model: '生成模型',
  generationReason: '生成原因',
  inputTokens: '输入 Token',
  outputTokens: '输出 Token',
};

export function compareReportVersions(input: {
  sourceKind: ReportComparisonSourceKind;
  reportId: string;
  baseVersion: number;
  targetVersion: number;
}): ReportVersionComparison {
  if (input.baseVersion === input.targetVersion) throw new Error('请选择两个不同的报告版本');
  const base = loadComparableVersion(input.sourceKind, input.reportId, input.baseVersion);
  const target = loadComparableVersion(input.sourceKind, input.reportId, input.targetVersion);
  const evidence = compareEvidence(base.evidence, target.evidence);
  const changedEvidenceSections = new Set(
    evidence.filter(item => item.kind !== 'unchanged').map(item => item.sectionKey),
  );
  const sections = compareSections(base.sections, target.sections, changedEvidenceSections);
  const metadata = compareMetadata(base.metadata, target.metadata);
  const summaryText = {
    before: base.summary,
    after: target.summary,
    changed: normalizeText(base.summary) !== normalizeText(target.summary),
  };
  const actionItems = compareList(base.actionItems, target.actionItems);
  const openQuestions = compareList(base.openQuestions, target.openQuestions);
  const changedSections = sections.filter(item => item.kind !== 'unchanged').length;
  const expressionChangedSections = sections.filter(item => item.textChanged).length;
  const evidenceChangedSections = sections.filter(item => item.evidenceChanged).length;
  const changedMetadata = metadata.filter(item => item.changed).length;
  const evidenceChanged = evidence.some(item => item.kind !== 'unchanged');
  const expressionChanged = summaryText.changed
    || expressionChangedSections > 0
    || actionItems.added.length > 0
    || actionItems.removed.length > 0
    || openQuestions.added.length > 0
    || openQuestions.removed.length > 0;

  return {
    sourceKind: input.sourceKind,
    reportId: input.reportId,
    reportTitle: target.reportTitle,
    base: base.version,
    target: target.version,
    summary: {
      classification: evidenceChanged
        ? 'evidence_changed'
        : expressionChanged
          ? 'expression_only'
          : changedMetadata > 0
            ? 'generation_metadata_only'
            : 'no_change',
      changedSections,
      expressionChangedSections,
      evidenceChangedSections,
      addedEvidence: evidence.filter(item => item.kind === 'added').length,
      removedEvidence: evidence.filter(item => item.kind === 'removed').length,
      changedEvidence: evidence.filter(item => item.kind === 'changed').length,
      changedMetadata,
    },
    metadata,
    summaryText,
    sections,
    evidence,
    actionItems,
    openQuestions,
  };
}

function loadComparableVersion(
  sourceKind: ReportComparisonSourceKind,
  reportId: string,
  versionNumber: number,
): ComparableReportVersion {
  if (sourceKind === 'annual') return loadAnnualVersion(reportId, versionNumber);
  if (sourceKind === 'rectification') return loadRectificationVersion(reportId, versionNumber);
  return loadTopicVersion(sourceKind, reportId, versionNumber);
}

function loadTopicVersion(
  sourceKind: 'topic' | 'heming',
  reportId: string,
  versionNumber: number,
): ComparableReportVersion {
  const detail = getReportDetail(reportId, versionNumber);
  if (!detail?.version) throw new Error(`报告 v${versionNumber} 不存在`);
  const conversation = getConversation(detail.report.conversationId);
  if (!conversation) throw new Error('报告关联会话不存在');
  const expectedKind = conversation.type === 'heming' ? 'heming' : 'topic';
  if (sourceKind !== expectedKind) throw new Error('报告类型与对比类型不一致');
  if (detail.version.status !== 'completed' || !detail.version.content) {
    throw new Error(`报告 v${versionNumber} 尚未完成，不能参与对比`);
  }
  return {
    reportTitle: detail.report.title,
    version: versionMeta(detail.version),
    metadata: {
      engineVersion: detail.version.engineVersion,
      promptVersion: detail.version.promptVersion,
      provider: detail.version.provider,
      model: detail.version.model,
      generationReason: REPORT_GENERATION_REASON_LABELS[detail.version.generationReason],
      inputTokens: formatNumber(detail.version.inputTokens),
      outputTokens: formatNumber(detail.version.outputTokens),
    },
    summary: detail.version.content.summary,
    sections: detail.version.content.sections.map(section => ({
      key: section.key,
      title: section.title,
      content: section.content,
    })),
    evidence: detail.evidence.map(mapReportEvidence),
    actionItems: detail.version.content.actionItems,
    openQuestions: detail.version.content.openQuestions,
  };
}

function loadRectificationVersion(reportId: string, versionNumber: number): ComparableReportVersion {
  const detail = getRectificationReportDetail(reportId, versionNumber);
  if (!detail?.version) throw new Error(`校时报告 v${versionNumber} 不存在`);
  if (detail.version.status !== 'completed' || !detail.version.content) {
    throw new Error(`校时报告 v${versionNumber} 尚未完成，不能参与对比`);
  }
  return {
    reportTitle: detail.report.title,
    version: versionMeta(detail.version),
    metadata: {
      methodologyVersion: detail.version.methodologyVersion,
      evaluationEngineVersion: detail.version.evaluationEngineVersion,
      evaluationId: detail.version.evaluationId,
      promptVersion: detail.version.promptVersion,
      provider: detail.version.provider,
      model: detail.version.model,
      generationReason: REPORT_GENERATION_REASON_LABELS[detail.version.generationReason],
      inputTokens: formatNumber(detail.version.inputTokens),
      outputTokens: formatNumber(detail.version.outputTokens),
    },
    summary: detail.version.content.summary,
    sections: detail.version.content.sections.map(section => ({
      key: section.key,
      title: section.title,
      content: section.content,
    })),
    evidence: detail.evidence.map(mapRectificationEvidence),
    actionItems: detail.version.content.actionItems,
    openQuestions: detail.version.content.openQuestions,
  };
}

function loadAnnualVersion(reportId: string, versionNumber: number): ComparableReportVersion {
  const detail = getAnnualTransitReportDetail(reportId, versionNumber);
  if (!detail?.report.versionId || detail.report.version !== versionNumber) {
    throw new Error(`年度报告 v${versionNumber} 不存在`);
  }
  const report = detail.report;
  const versionId = report.versionId;
  if (!versionId) throw new Error(`年度报告 v${versionNumber} 不存在`);
  if (report.status !== 'completed' || !report.content.trim()) {
    throw new Error(`年度报告 v${versionNumber} 尚未完成，不能参与对比`);
  }
  const snapshot = getTransitSnapshotById(report.snapshotId);
  const parsed = parseAnnualContent(report.content);
  return {
    reportTitle: `${report.targetDate} 年度总结报告`,
    version: {
      id: versionId,
      version: versionNumber,
      status: 'completed',
      generationReason: report.generationReason,
      baseVersionId: report.baseVersionId,
      completedAt: report.completedAt,
    },
    metadata: {
      engineVersion: report.engineVersion,
      snapshotId: report.snapshotId,
      promptVersion: report.promptVersion,
      provider: report.provider,
      model: report.model,
      generationReason: REPORT_GENERATION_REASON_LABELS[report.generationReason],
      inputTokens: formatNumber(report.inputTokens),
      outputTokens: formatNumber(report.outputTokens),
    },
    summary: parsed.sections[0]?.content ?? '',
    sections: parsed.sections,
    evidence: [{
      sectionKey: 'annual_source',
      evidenceKey: 'annual_transit_snapshot',
      label: `${report.targetDate} 年确定性运限事实`,
      facts: snapshot?.snapshot as unknown as Record<string, unknown> ?? {
        snapshotId: report.snapshotId,
        engineVersion: report.engineVersion,
      },
    }],
    actionItems: parsed.sections.find(item => item.key === '年度行动建议')
      ?.content.split(/\n|(?:^|。)\s*\d+[.、]/).map(item => item.trim()).filter(Boolean) ?? [],
    openQuestions: [],
  };
}

function versionMeta(version: {
  id: string;
  version: number;
  generationReason: ReportGenerationReason;
  baseVersionId: string | null;
  completedAt: number | null;
}): ReportComparisonVersion {
  return {
    id: version.id,
    version: version.version,
    status: 'completed',
    generationReason: version.generationReason,
    baseVersionId: version.baseVersionId,
    completedAt: version.completedAt,
  };
}

function mapReportEvidence(item: ReportEvidence): ComparableEvidence {
  return {
    sectionKey: item.sectionKey,
    evidenceKey: item.evidenceKey,
    label: item.label,
    facts: item.facts,
  };
}

function mapRectificationEvidence(item: RectificationReportEvidence): ComparableEvidence {
  return {
    sectionKey: item.sectionKey,
    evidenceKey: item.evidenceKey,
    label: item.label,
    facts: item.facts,
  };
}

function compareMetadata(
  before: Record<string, string>,
  after: Record<string, string>,
): ReportMetadataDifference[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.map(key => ({
    key,
    label: METADATA_LABELS[key] ?? key,
    before: before[key] ?? '-',
    after: after[key] ?? '-',
    changed: (before[key] ?? '') !== (after[key] ?? ''),
  }));
}

function compareSections(
  before: ComparableSection[],
  after: ComparableSection[],
  changedEvidenceSections: Set<string>,
): ReportSectionDifference[] {
  const beforeMap = new Map(before.map(item => [item.key, item]));
  const afterMap = new Map(after.map(item => [item.key, item]));
  const keys = [...new Set([...before.map(item => item.key), ...after.map(item => item.key)])];
  const annualEvidenceChanged = changedEvidenceSections.has('annual_source');
  return keys.map(key => {
    const previous = beforeMap.get(key);
    const next = afterMap.get(key);
    const textChanged = normalizeText(previous?.content ?? '') !== normalizeText(next?.content ?? '');
    const evidenceChanged = changedEvidenceSections.has(key) || annualEvidenceChanged;
    const kind = !previous
      ? 'added'
      : !next
        ? 'removed'
        : textChanged && evidenceChanged
          ? 'evidence_and_expression_changed'
          : evidenceChanged
            ? 'evidence_changed'
            : textChanged
              ? 'expression_changed'
              : 'unchanged';
    return {
      key,
      title: next?.title ?? previous?.title ?? key,
      kind,
      before: previous?.content ?? null,
      after: next?.content ?? null,
      textChanged,
      evidenceChanged,
    };
  });
}

function compareEvidence(
  before: ComparableEvidence[],
  after: ComparableEvidence[],
): ReportEvidenceDifference[] {
  const identify = (item: ComparableEvidence) => `${item.sectionKey}::${item.evidenceKey}`;
  const beforeMap = new Map(before.map(item => [identify(item), item]));
  const afterMap = new Map(after.map(item => [identify(item), item]));
  const identities = [...new Set([...beforeMap.keys(), ...afterMap.keys()])];
  return identities.map(identity => {
    const previous = beforeMap.get(identity);
    const next = afterMap.get(identity);
    const kind = !previous
      ? 'added'
      : !next
        ? 'removed'
        : stableStringify(previous.facts) !== stableStringify(next.facts)
          || previous.label !== next.label
          ? 'changed'
          : 'unchanged';
    return {
      identity,
      sectionKey: next?.sectionKey ?? previous?.sectionKey ?? '',
      evidenceKey: next?.evidenceKey ?? previous?.evidenceKey ?? '',
      label: next?.label ?? previous?.label ?? '',
      kind,
      beforeFacts: previous?.facts ?? null,
      afterFacts: next?.facts ?? null,
    };
  });
}

function compareList(before: string[], after: string[]): ReportListDifference {
  const normalizedBefore = new Map(before.map(item => [normalizeText(item), item]));
  const normalizedAfter = new Map(after.map(item => [normalizeText(item), item]));
  return {
    added: after.filter(item => !normalizedBefore.has(normalizeText(item))),
    removed: before.filter(item => !normalizedAfter.has(normalizeText(item))),
    unchanged: after.filter(item => normalizedBefore.has(normalizeText(item))),
  };
}

function parseAnnualContent(content: string): { sections: ComparableSection[] } {
  const sections: ComparableSection[] = [];
  let current: ComparableSection | null = null;
  for (const rawLine of content.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    const heading = line.match(/^\*\*【(.+?)】\*\*$/) ?? line.match(/^【(.+?)】$/);
    if (heading) {
      current = { key: heading[1], title: heading[1], content: '' };
      sections.push(current);
    } else if (line) {
      if (!current) {
        current = { key: '年度总览', title: '年度总览', content: '' };
        sections.push(current);
      }
      current.content = [current.content, line].filter(Boolean).join('\n');
    }
  }
  return { sections };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function formatNumber(value: number | null): string {
  return typeof value === 'number' ? String(value) : '-';
}
