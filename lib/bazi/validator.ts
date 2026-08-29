import { BAZI_ELEMENTS, BAZI_LATE_ZI_POLICIES, BAZI_TIME_STANDARDS } from './types';
import type { BaziMethodology } from './types';

export function validateBaziMethodology(methodology: BaziMethodology): string[] {
  const errors: string[] = [];
  const policy = methodology.calculationPolicy;
  if (methodology.schemaVersion !== 1) errors.push('方法论结构版本必须为 1');
  if (!methodology.version.trim() || !methodology.engineVersion.trim()) errors.push('方法论和引擎版本不能为空');
  if (policy.yearBoundary !== 'exact_li_chun') errors.push('年柱必须以立春精确时刻为边界');
  if (policy.monthBoundary !== 'exact_jie') errors.push('月柱必须以交节精确时刻为边界');
  if (!policy.supportedTimeStandards.includes(policy.defaultTimeStandard)) errors.push('默认时间标准必须属于支持列表');
  if (!policy.supportedLateZiPolicies.includes(policy.defaultLateZiPolicy)) errors.push('默认晚子时规则必须属于支持列表');
  for (const standard of BAZI_TIME_STANDARDS) {
    if (!policy.supportedTimeStandards.includes(standard)) errors.push(`缺少时间标准：${standard}`);
  }
  for (const lateZiPolicy of BAZI_LATE_ZI_POLICIES) {
    if (!policy.supportedLateZiPolicies.includes(lateZiPolicy)) errors.push(`缺少晚子时规则：${lateZiPolicy}`);
  }
  if (!methodology.sources.some(source => source.id === 'lunar-javascript-official')) errors.push('缺少历法引擎官方来源');
  if (!methodology.sources.some(source => source.id === 'noaa-solar-equations')) errors.push('缺少真太阳时算法来源');
  for (const phrase of ['仅凭五行数量判断身强身弱', '未知时辰时伪造时柱']) {
    if (!methodology.prohibitedClaims.includes(phrase)) errors.push(`缺少安全限制：${phrase}`);
  }
  if (new Set(methodology.sources.map(source => source.id)).size !== methodology.sources.length) errors.push('来源编号不能重复');
  if (BAZI_ELEMENTS.length !== 5) errors.push('五行枚举必须保持五类');
  return errors;
}

export function assertValidBaziMethodology(methodology: BaziMethodology): void {
  const errors = validateBaziMethodology(methodology);
  if (errors.length) throw new Error(`八字方法论校验失败：${errors.join('；')}`);
}
