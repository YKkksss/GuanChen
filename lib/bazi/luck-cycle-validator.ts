import { BAZI_LUCK_CYCLE_METHODOLOGY } from './luck-cycle-methodology';
import type { BaziLuckCycleMethodology } from './luck-cycle-types';

export function validateBaziLuckCycleMethodology(
  methodology: BaziLuckCycleMethodology = BAZI_LUCK_CYCLE_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (!methodology.version || !methodology.engineVersion) errors.push('方法版本和引擎版本不能为空');
  if (methodology.policy.directionRule !== 'year_stem_yin_yang_and_gender') errors.push('顺逆规则必须绑定年干阴阳和性别');
  if (methodology.policy.boundaryRule !== 'forward_next_jie_backward_previous_jie') errors.push('起运边界必须明确顺取下节、逆取上节');
  if (methodology.policy.boundaryScope !== 'jie_only_not_all_solar_terms') errors.push('起运边界必须限定为节，不能混用中气');
  if (methodology.policy.conversionRule !== 'minute_precision_three_days_one_year') errors.push('必须保存分钟精度三日一年折算法');
  const conversion = methodology.policy.conversionEquivalences;
  if (conversion.minutesPerYear !== 4320 || conversion.minutesPerMonth !== 360 || conversion.minutesPerDay !== 12 || conversion.hoursPerRemainingMinute !== 2) {
    errors.push('分钟折算常量不完整');
  }
  if (!methodology.policy.supportedTimezoneIds.includes('Asia/Shanghai')) errors.push('v1 必须声明支持 Asia/Shanghai');
  if (!methodology.prohibitedClaims.some(item => item.includes('时辰未知'))) errors.push('必须禁止未知时辰伪造交运日期');
  if (!methodology.prohibitedClaims.some(item => item.includes('吉凶事件'))) errors.push('必须禁止从排期直接推导吉凶事件');
  if (!methodology.sources.some(item => item.type === 'classical_text')) errors.push('至少需要一条古籍方法来源');
  if (!methodology.sources.some(item => item.type === 'official_implementation')) errors.push('至少需要一条官方实现来源');
  return errors;
}

export function assertValidBaziLuckCycleMethodology(
  methodology: BaziLuckCycleMethodology = BAZI_LUCK_CYCLE_METHODOLOGY,
): void {
  const errors = validateBaziLuckCycleMethodology(methodology);
  if (errors.length) throw new Error(`八字大运方法配置无效：${errors.join('；')}`);
}
