import { BAZI_MONTH_DAY_STRENGTH_METHODOLOGY } from './month-day-strength-methodology';
import type { BaziMonthDayStrengthMethodology } from './month-day-strength-types';

export function validateBaziMonthDayStrengthMethodology(
  methodology: BaziMonthDayStrengthMethodology = BAZI_MONTH_DAY_STRENGTH_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (methodology.schemaVersion !== 1) errors.push('方法契约版本必须为 1');
  if (methodology.policy.upstreamPolicy !== 'consume_versioned_m9_3_m9_15_m9_16_evidence') errors.push('必须消费 M9-3、M9-15 和 M9-16 版本化证据');
  if (methodology.policy.surfacePolicy !== 'separate_inherited_and_month_day_visible_directions') errors.push('必须分开岁运与流月流日表层方向');
  if (methodology.policy.hiddenPolicy !== 'position_or_touch_context_only_no_strength_effect') errors.push('藏干只能进入位置或触达条件上下文');
  if (!methodology.policy.scoringPolicy.includes('no_numeric_score')) errors.push('必须禁止旺衰数值评分');
  if (!methodology.prohibitedClaims.some(item => item.includes('变强或变弱'))) errors.push('必须禁止把方向比较改写为旺衰变化');
  if (!methodology.prohibitedClaims.some(item => item.includes('具体事件'))) errors.push('必须禁止具体事件预测');
  if (methodology.sources.length < 4) errors.push('必须绑定 M9-3、M9-12、M9-15 和 M9-16 来源');
  return errors;
}

export function assertValidBaziMonthDayStrengthMethodology(
  methodology: BaziMonthDayStrengthMethodology = BAZI_MONTH_DAY_STRENGTH_METHODOLOGY,
): void {
  const errors = validateBaziMonthDayStrengthMethodology(methodology);
  if (errors.length) throw new Error(`M9-17 方法契约无效：${errors.join('；')}`);
}
