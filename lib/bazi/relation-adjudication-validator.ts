import { BAZI_RELATION_ADJUDICATION_METHODOLOGY } from './relation-adjudication-methodology';
import type { BaziRelationAdjudicationMethodology } from './relation-adjudication-types';

export function validateBaziRelationAdjudicationMethodology(
  methodology: BaziRelationAdjudicationMethodology = BAZI_RELATION_ADJUDICATION_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (!methodology.version || !methodology.engineVersion) errors.push('方法版本和引擎版本不能为空');
  if (methodology.policy.upstreamPolicy !== 'consume_versioned_relation_evidence') errors.push('必须消费版本化的 M9-6 关系证据');
  if (methodology.policy.partialSetPolicy !== 'record_two_of_three_as_missing_condition') errors.push('三字缺一必须记录为条件缺失');
  if (methodology.policy.transformationPolicy !== 'review_gate_only_no_transformation_verdict') errors.push('条件审计不得自动给出合化结论');
  if (methodology.policy.conflictPolicy !== 'coexistence_without_priority_verdict') errors.push('关系并见不得自动裁决优先级');
  if (methodology.policy.scoringPolicy !== 'no_numeric_score_no_fortune_weight') errors.push('不得生成条件或关系吉凶分数');
  if (methodology.stemTransformationGates.length !== 5) errors.push('五组天干化气入口条件必须完整');
  if (methodology.stemTransformationGates.some(item => item.supportingMonths.length < 4 || !item.competingStem)) errors.push('五合月支支持或妒合干配置不完整');
  const expected = { branchThreeHarmony: 4, branchThreeMeeting: 4, branchThreePunishment: 2 };
  for (const [key, count] of Object.entries(expected)) {
    if (methodology.threeMemberSets[key]?.length !== count) errors.push(`${key} 三字集合不完整`);
  }
  if (!methodology.prohibitedClaims.some(item => item.includes('合化成功'))) errors.push('必须禁止条件齐备直接等同合化成功');
  if (!methodology.prohibitedClaims.some(item => item.includes('优先'))) errors.push('必须禁止自动裁决关系优先级');
  if (!methodology.sources.some(item => item.type === 'classical_text')) errors.push('至少需要一条古籍条件来源');
  if (!methodology.sources.some(item => item.id.includes('m9-6'))) errors.push('必须绑定 M9-6 关系证据方法');
  return errors;
}

export function assertValidBaziRelationAdjudicationMethodology(
  methodology: BaziRelationAdjudicationMethodology = BAZI_RELATION_ADJUDICATION_METHODOLOGY,
): void {
  const errors = validateBaziRelationAdjudicationMethodology(methodology);
  if (errors.length) throw new Error(`八字关系条件与冲突审计方法配置无效：${errors.join('；')}`);
}
