import { BAZI_STRENGTH_COMPOSITE_METHODOLOGY } from './strength-composite-methodology';
import type { BaziStrengthCompositeMethodology } from './strength-composite-types';

export function validateBaziStrengthCompositeMethodology(
  methodology: BaziStrengthCompositeMethodology = BAZI_STRENGTH_COMPOSITE_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (methodology.schemaVersion !== 1) errors.push('月令旺衰综合方法 schemaVersion 必须为 1');
  if (!methodology.version || !methodology.engineVersion) errors.push('月令旺衰综合方法与引擎版本不能为空');
  if (methodology.policy.baselinePolicy !== 'preserve_static_assessment_without_reclassification') {
    errors.push('综合审计必须保留 M9-3 静态标签，不得重新分类');
  }
  if (methodology.policy.hiddenPolicy !== 'position_or_touch_condition_only_no_activation') {
    errors.push('岁运藏干只能作为位置或触达条件，不得冒充发动力量');
  }
  if (methodology.policy.comparisonPolicy !== 'direction_comparison_not_final_strength') {
    errors.push('静态动态比较不得输出最终旺衰');
  }
  if (methodology.policy.scoringPolicy !== 'counts_for_traceability_only_no_numeric_strength_score') {
    errors.push('证据计数只能用于追溯，不得形成旺衰分数');
  }
  for (const keyword of ['旺衰分数', '月令', '用神']) {
    if (!methodology.prohibitedClaims.some(item => item.includes(keyword))) errors.push(`禁止结论缺少“${keyword}”边界`);
  }
  return errors;
}

export function assertValidBaziStrengthCompositeMethodology(
  methodology: BaziStrengthCompositeMethodology = BAZI_STRENGTH_COMPOSITE_METHODOLOGY,
): void {
  const errors = validateBaziStrengthCompositeMethodology(methodology);
  if (errors.length) throw new Error(`月令旺衰综合方法校验失败：${errors.join('；')}`);
}
