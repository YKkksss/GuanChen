import { BAZI_PATTERN_CONDITION_METHODOLOGY } from './pattern-condition-methodology';
import type { BaziPatternConditionMethodology } from './pattern-condition-types';

export function validateBaziPatternConditionMethodology(
  methodology: BaziPatternConditionMethodology = BAZI_PATTERN_CONDITION_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (methodology.schemaVersion !== 1) errors.push('格局条件审计 schemaVersion 必须为 1');
  if (!methodology.version || !methodology.engineVersion) errors.push('格局条件方法与引擎版本不能为空');
  if (methodology.policy.candidatePolicy !== 'preserve_every_month_command_candidate_without_ranking') {
    errors.push('必须保留全部月令候选且不得排序');
  }
  if (methodology.policy.layerPolicy !== 'natal_chart_only') errors.push('M9-13 必须限定在原局层');
  if (methodology.policy.verdictPolicy !== 'condition_evidence_only_no_pattern_success_failure') {
    errors.push('只能输出条件证据，不得裁决格局成败');
  }
  if (methodology.policy.scoringPolicy !== 'counts_for_traceability_only_no_pattern_score') {
    errors.push('条件计数只能用于追溯，不得形成格局分数');
  }
  for (const keyword of ['成格', '破格', '救应', '分数']) {
    if (!methodology.prohibitedClaims.some(item => item.includes(keyword))) errors.push(`禁止结论缺少“${keyword}”边界`);
  }
  return errors;
}

export function assertValidBaziPatternConditionMethodology(
  methodology: BaziPatternConditionMethodology = BAZI_PATTERN_CONDITION_METHODOLOGY,
): void {
  const errors = validateBaziPatternConditionMethodology(methodology);
  if (errors.length) throw new Error(`格局条件审计方法校验失败：${errors.join('；')}`);
}
