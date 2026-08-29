import { BAZI_RELATION_AUDIT_METHODOLOGY } from './relation-audit-methodology';
import type { BaziRelationAuditMethodology } from './relation-audit-types';

export function validateBaziRelationAuditMethodology(
  methodology: BaziRelationAuditMethodology = BAZI_RELATION_AUDIT_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (!methodology.version || !methodology.engineVersion) errors.push('方法版本和引擎版本不能为空');
  if (methodology.policy.pairScope !== 'cross_layer_only') errors.push('首版配对关系必须限定为跨层作用');
  if (methodology.policy.setRule !== 'full_members_required') errors.push('三字关系必须要求成员齐全');
  if (methodology.policy.transformationPolicy !== 'detected_not_transformed') errors.push('合关系必须明确只检测不判化');
  if (methodology.policy.scoringPolicy !== 'no_numeric_score_no_fortune_weight') errors.push('不得生成关系吉凶分数');
  const expected = {
    stemFiveCombine: 5, branchSixCombine: 6, branchClash: 6, branchHarm: 6,
    branchMutualPunishment: 1, branchSelfPunishment: 4,
    branchThreeHarmony: 4, branchThreeMeeting: 4, branchThreePunishment: 2,
  };
  for (const [key, count] of Object.entries(expected)) {
    if (methodology.relationSets[key]?.length !== count) errors.push(`${key} 关系集合不完整`);
  }
  if (!methodology.prohibitedClaims.some(item => item.includes('合化'))) errors.push('必须禁止从合关系直接宣告合化');
  if (!methodology.prohibitedClaims.some(item => item.includes('吉凶分数'))) errors.push('必须禁止关系计数评分');
  if (!methodology.sources.some(item => item.type === 'classical_text')) errors.push('至少需要一条古籍关系来源');
  if (!methodology.sources.some(item => item.type === 'project_methodology')) errors.push('必须绑定项目时间轴方法');
  return errors;
}

export function assertValidBaziRelationAuditMethodology(
  methodology: BaziRelationAuditMethodology = BAZI_RELATION_AUDIT_METHODOLOGY,
): void {
  const errors = validateBaziRelationAuditMethodology(methodology);
  if (errors.length) throw new Error(`八字关系审计方法配置无效：${errors.join('；')}`);
}
