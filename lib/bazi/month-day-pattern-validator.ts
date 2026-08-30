import { BAZI_MONTH_DAY_PATTERN_METHODOLOGY } from './month-day-pattern-methodology';
import type { BaziMonthDayPatternMethodology } from './month-day-pattern-types';

export function validateBaziMonthDayPatternMethodology(
  methodology: BaziMonthDayPatternMethodology = BAZI_MONTH_DAY_PATTERN_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (methodology.schemaVersion !== 1) errors.push('方法契约版本必须为 1');
  if (methodology.policy.upstreamPolicy !== 'consume_versioned_m9_13_m9_15_m9_16_m9_17_evidence') errors.push('必须消费 M9-13、M9-15、M9-16 和 M9-17 版本化证据');
  if (methodology.policy.candidatePolicy !== 'preserve_m9_13_candidates_checks_and_static_statuses') errors.push('必须原样保留 M9-13 候选、检查与静态状态');
  if (methodology.policy.layerPolicy !== 'separate_static_inherited_and_month_day_condition_entries') errors.push('必须分开静态、岁运既有和流月流日新增条件');
  if (methodology.policy.hiddenPolicy !== 'm9_16_position_or_touch_context_only') errors.push('M9-16 藏干只能作为位置或触达上下文');
  if (!methodology.policy.verdictPolicy.includes('no_pattern_success_failure')) errors.push('必须禁止格局成败裁决');
  if (!methodology.prohibitedClaims.some(item => item.includes('救应'))) errors.push('必须禁止宣告救应完成');
  if (!methodology.prohibitedClaims.some(item => item.includes('分数'))) errors.push('必须禁止格局数值评分');
  if (methodology.sources.length < 4) errors.push('必须绑定 M9-13、M9-15、M9-16 和 M9-17 来源');
  return errors;
}

export function assertValidBaziMonthDayPatternMethodology(
  methodology: BaziMonthDayPatternMethodology = BAZI_MONTH_DAY_PATTERN_METHODOLOGY,
): void {
  const errors = validateBaziMonthDayPatternMethodology(methodology);
  if (errors.length) throw new Error(`M9-18 方法契约无效：${errors.join('；')}`);
}
