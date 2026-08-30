import { BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY } from './month-day-visibility-methodology';
import type { BaziMonthDayVisibilityMethodology } from './month-day-visibility-types';

export function validateBaziMonthDayVisibilityMethodology(
  methodology: BaziMonthDayVisibilityMethodology = BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (methodology.schemaVersion !== 1) errors.push('方法契约版本必须为 1');
  if (methodology.policy.upstreamPolicy !== 'consume_versioned_m9_15_exact_day_segments') errors.push('必须消费 M9-15 版本化精确流日片段');
  if (methodology.policy.focusPolicy !== 'require_month_or_day_participant_in_each_output') errors.push('每项输出必须包含流月或流日参与者');
  if (!methodology.policy.repeatPolicy.includes('m9_9')) errors.push('必须复用 M9-9 显隐重复规则');
  if (!methodology.policy.transparencyRootPolicy.includes('m9_10')) errors.push('必须复用 M9-10 透干通根规则');
  if (!methodology.policy.hiddenTouchPolicy.includes('m9_11')) errors.push('必须复用 M9-11 藏干触达规则');
  if (!methodology.prohibitedClaims.some(item => item.includes('旺衰'))) errors.push('必须禁止从条件计数推导旺衰');
  if (!methodology.prohibitedClaims.some(item => item.includes('事件'))) errors.push('必须禁止事件预测');
  if (methodology.sources.length < 4) errors.push('必须绑定 M9-9、M9-10、M9-11 和 M9-15 上游来源');
  return errors;
}

export function assertValidBaziMonthDayVisibilityMethodology(
  methodology: BaziMonthDayVisibilityMethodology = BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY,
): void {
  const errors = validateBaziMonthDayVisibilityMethodology(methodology);
  if (errors.length) throw new Error(`M9-16 方法契约无效：${errors.join('；')}`);
}
