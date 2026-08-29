import { BAZI_ANNUAL_TIMELINE_METHODOLOGY } from './annual-timeline-methodology';
import type { BaziAnnualTimelineMethodology } from './annual-timeline-types';

export function validateBaziAnnualTimelineMethodology(
  methodology: BaziAnnualTimelineMethodology = BAZI_ANNUAL_TIMELINE_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (!methodology.version || !methodology.engineVersion) errors.push('方法版本和引擎版本不能为空');
  if (methodology.policy.annualBoundaryRule !== 'exact_li_chun_instant') errors.push('流年边界必须使用精确立春时刻');
  if (methodology.policy.intervalRule !== 'half_open_li_chun_to_next_li_chun') errors.push('流年必须使用前闭后开的立春区间');
  if (methodology.policy.luckCycleJoinRule !== 'exact_interval_intersection') errors.push('大运归属必须按区间交集计算');
  if (methodology.policy.crossCycleRule !== 'split_at_actual_luck_cycle_transition') errors.push('流年内交运必须按实际时刻拆段');
  if (!methodology.policy.supportedTimezoneIds.includes('Asia/Shanghai')) errors.push('v1 必须声明支持 Asia/Shanghai');
  if (methodology.policy.fallbackYears < 2) errors.push('降级流年序列至少需要两年');
  if (!methodology.prohibitedClaims.some(item => item.includes('吉凶'))) errors.push('必须禁止从时间轴直接推导流年吉凶');
  if (!methodology.sources.some(item => item.type === 'official_implementation')) errors.push('至少需要一条官方历法实现来源');
  if (!methodology.sources.some(item => item.type === 'classical_text')) errors.push('至少需要一条古籍概念来源');
  return errors;
}

export function assertValidBaziAnnualTimelineMethodology(
  methodology: BaziAnnualTimelineMethodology = BAZI_ANNUAL_TIMELINE_METHODOLOGY,
): void {
  const errors = validateBaziAnnualTimelineMethodology(methodology);
  if (errors.length) throw new Error(`八字流年时间轴方法配置无效：${errors.join('；')}`);
}
