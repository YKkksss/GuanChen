import { BAZI_MONTH_DAY_TIMELINE_METHODOLOGY } from './month-day-timeline-methodology';
import type { BaziMonthDayTimelineMethodology } from './month-day-timeline-types';

export function validateBaziMonthDayTimelineMethodology(
  methodology: BaziMonthDayTimelineMethodology = BAZI_MONTH_DAY_TIMELINE_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (!methodology.version || !methodology.engineVersion) errors.push('方法版本和引擎版本不能为空');
  if (methodology.policy.monthBoundaryRule !== 'exact_jie_instant') errors.push('流月边界必须使用精确节交接时刻');
  if (methodology.policy.monthIntervalRule !== 'half_open_jie_to_next_jie') errors.push('流月必须使用前闭后开的节界区间');
  if (methodology.policy.dayBoundaryRule !== 'inherit_chart_late_zi_policy') errors.push('流日边界必须继承命盘晚子时策略');
  if (methodology.policy.annualJoinRule !== 'clip_to_selected_annual_interval') errors.push('流月流日必须裁剪到所选流年区间');
  if (methodology.policy.luckCycleJoinRule !== 'inherit_annual_luck_segments') errors.push('大运归属必须继承流年已审计分段');
  if (!methodology.policy.supportedTimezoneIds.includes('Asia/Shanghai')) errors.push('v1 必须声明支持 Asia/Shanghai');
  if (!methodology.prohibitedClaims.some(item => item.includes('吉凶'))) errors.push('必须禁止从时间轴直接推导吉凶');
  if (!methodology.sources.some(item => item.type === 'official_implementation')) errors.push('至少需要一条官方历法实现来源');
  return errors;
}

export function assertValidBaziMonthDayTimelineMethodology(
  methodology: BaziMonthDayTimelineMethodology = BAZI_MONTH_DAY_TIMELINE_METHODOLOGY,
): void {
  const errors = validateBaziMonthDayTimelineMethodology(methodology);
  if (errors.length) throw new Error(`八字流月流日时间轴方法配置无效：${errors.join('；')}`);
}
