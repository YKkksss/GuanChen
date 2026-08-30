import { BAZI_MONTH_DAY_RELATION_METHODOLOGY } from './month-day-relation-methodology';
import type { BaziMonthDayRelationMethodology } from './month-day-relation-types';

export function validateBaziMonthDayRelationMethodology(
  methodology: BaziMonthDayRelationMethodology = BAZI_MONTH_DAY_RELATION_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (!methodology.version || !methodology.engineVersion) errors.push('方法版本和引擎版本不能为空');
  if (methodology.policy.layerPolicy !== 'natal_luck_annual_month_day') errors.push('必须同时声明原局、大运、流年、流月、流日五层');
  if (methodology.policy.datePolicy !== 'one_version_per_effective_date') errors.push('必须按有效日期独立版本化');
  if (methodology.policy.segmentPolicy !== 'audit_each_exact_day_segment') errors.push('必须逐流日精确片段审计');
  if (methodology.policy.evidencePolicy !== 'reuse_m9_6_and_require_month_or_day_participant') errors.push('必须复用 M9-6 且要求流月或流日参与');
  if (methodology.policy.scoringPolicy !== 'no_numeric_score_no_strength_or_fortune_weight') errors.push('不得生成数值评分或吉凶权重');
  if (!methodology.prohibitedClaims.some(item => item.includes('吉凶'))) errors.push('必须明确禁止流月流日吉凶结论');
  if (!methodology.sources.some(item => item.id.includes('m9-14'))) errors.push('必须声明 M9-14 精确时间片段来源');
  return errors;
}

export function assertValidBaziMonthDayRelationMethodology(
  methodology: BaziMonthDayRelationMethodology = BAZI_MONTH_DAY_RELATION_METHODOLOGY,
): void {
  const errors = validateBaziMonthDayRelationMethodology(methodology);
  if (errors.length) throw new Error(`八字流月流日动态关系方法配置无效：${errors.join('；')}`);
}
