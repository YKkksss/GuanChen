import type { ReportEvidenceDraft } from './types';

export const REPORT_SCOPE_SECTION = '__report_scope__';
type Evidence = Pick<ReportEvidenceDraft, 'kind' | 'source' | 'facts'>;
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean).join('、') : '';

export function evidenceSourceLabel(source: Evidence['source']): string {
  return { chart_snapshot: '命盘事实', rule_engine: '程序规则', user_confirmed: '用户确认记录' }[source];
}

/** 网页和 PDF 共用，仅展示该版本保存的事实，不读取当前档案。 */
export function describeReportEvidence(evidence: Evidence): string {
  const f = evidence.facts;
  const stars = Array.isArray(f.stars) ? f.stars.map(value => {
    const star = object(value);
    const brightness = { bright: '亮度较强', normal: '亮度常规', dim: '亮度较弱' }[text(star.brightness)];
    return [text(star.name), star.siHua ? `化${text(star.siHua)}` : '', brightness ?? ''].filter(Boolean).join('·');
  }).filter(Boolean).join('、') : '';
  if (evidence.kind === 'confirmed_event') {
    const precision = text(f.datePrecision);
    const precisionLabel: Record<string, string> = { year: '仅知年份', month: '仅知月份', day: '精确到日', range: '日期区间', unknown: '日期未知' };
    const date = precision === 'unknown' ? '时间未知' : [text(f.startDate), text(f.endDate)].filter(Boolean).join(' 至 ') || '时间未知';
    return [`时间：${date}${precisionLabel[precision] ? `（${precisionLabel[precision]}）` : '（旧记录未标注精度）'}`,
      text(f.description) || '未填写事件说明',
      '用户确认的是事件记录，不代表已确认报告中的命理解释。'].join('\n');
  }
  if (evidence.kind === 'palace' || evidence.kind === 'heming_palace') {
    return [f.owner ? `${text(f.owner)}方` : '',
      `${text(f.palace)}${f.branch ? `（${text(f.branch)}）` : ''}`,
      stars ? `星曜：${stars}` : '未保存星曜明细',
      f.isEmpty ? '本宫无主星' : '',
      strings(f.borrowedStars) ? `借对宫主星：${strings(f.borrowedStars)}` : ''].filter(Boolean).join('\n');
  }
  if (evidence.kind === 'daxian' || evidence.kind === 'heming_stage') {
    const period = object(f.period);
    return [f.owner ? `${text(f.owner)}方` : '',
      `阶段：${text(f.startAge)}-${text(f.endAge)} 岁 · ${text(f.palaceName) || text(f.palace)}`,
      text(f.ageConvention),
      period.startDate && period.endDate ? `阶段范围：${text(period.startDate)} 至 ${text(period.endDate)}` : '',
      f.asOfDate ? `分析日期：${text(f.asOfDate)}` : '', stars ? `星曜：${stars}` : ''].filter(Boolean).join('\n');
  }
  if (evidence.kind === 'pattern') return [text(f.description) || '程序识别格局', strings(f.palaces) ? `涉及宫位：${strings(f.palaces)}` : ''].filter(Boolean).join('\n');
  if (evidence.kind === 'heming_rule') return `规则 ${text(f.ruleId)} · ${text(f.phase)} · ${text(f.level)}${f.confidence ? ` · ${text(f.confidence)}置信度` : ''}`;
  if (evidence.kind === 'heming_context') {
    const roles = object(f.roles);
    return `${text(f.relationshipLabel)} · 甲方：${text(roles.A)} · 乙方：${text(roles.B)}`;
  }
  return [`五行局：${text(f.wuxingJu) || '未记录'} · 命宫：${text(f.mingGongBranch) || '未记录'}`,
    f.birthTimeConfidence === 'unknown' ? '出生时辰未知，当前为试排' : '',
    f.asOfDate ? `分析日期：${text(f.asOfDate)} · ${text(f.ageConvention)}` : '',
    f.currentAge !== undefined ? `分析时年龄：${text(f.currentAge)} 岁` : ''].filter(Boolean).join('\n');
}

export function reportScopeLines(evidence: Array<Evidence>): string[] {
  const core = evidence.find(item => item.kind === 'chart_core' && item.facts.eventSelection);
  if (!core) return ['此版本未保存完整分析范围，无法确认当时筛选了多少事件；不会使用当前档案补写历史。'];
  const f = core.facts;
  const selection = object(f.eventSelection);
  const count = (key: string) => typeof selection[key] === 'number' ? String(selection[key]) : '未记录';
  const period = object(selection.period);
  return [
    `分析日期：${text(f.asOfDate) || '未记录'} · ${text(f.ageConvention) || '年龄口径未记录'}`,
    `已确认 ${count('confirmedCount')} 条 · 匹配 ${count('matchedCount')} 条 · 选入 ${count('selectedCount')} 条 · 未选入 ${count('omittedCount')} 条`,
    `因数量上限截取：${count('truncatedCount')} 条。选入表示提供给模型参考，不表示每条都被正文引用。`,
    text(selection.policy),
    period.startDate && period.endDate ? `事件筛选阶段：${text(period.startDate)} 至 ${text(period.endDate)}` : '',
    selection.selectedCount === 0 ? '本次没有选入已确认事件，现实经历依据不足；不代表没有发生相关经历。' : '',
    f.birthTimeConfidence === 'unknown' ? '出生时辰未知，本报告基于试排，相关结论需进一步核对。' : '',
    text(f.stageStatus),
    text(selection.notice),
  ].filter(Boolean);
}
