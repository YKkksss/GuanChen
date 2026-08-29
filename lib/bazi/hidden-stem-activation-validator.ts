import { BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY } from './hidden-stem-activation-methodology';
import type { BaziHiddenStemActivationMethodology } from './hidden-stem-activation-types';

export function validateBaziHiddenStemActivationMethodology(
  methodology: BaziHiddenStemActivationMethodology = BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (methodology.schemaVersion !== 1) errors.push('藏干引动条件方法 schemaVersion 必须为 1');
  if (!methodology.version || !methodology.engineVersion) errors.push('藏干引动条件方法与引擎版本不能为空');
  if (methodology.policy.surfacePolicy !== 'exact_same_stem_dynamic_surface_in_same_segment') {
    errors.push('完全同干入口必须限定为同片段岁运表层');
  }
  if (methodology.policy.branchRepeatPolicy !== 'same_branch_distinct_node_with_dynamic_participant') {
    errors.push('同支重复必须来自不同节点且包含岁运参与者');
  }
  if (methodology.policy.relationPolicy !== 'explicit_branch_relation_evidence_with_adjudication_state') {
    errors.push('冲合刑害入口必须回指关系证据与条件状态');
  }
  if (methodology.policy.scoringPolicy !== 'no_activation_strength_effect_or_fortune_verdict') {
    errors.push('藏干引动条件不得输出发动、力量、作用或吉凶结论');
  }
  const required = ['发动', '力量', '具体事件'];
  for (const keyword of required) {
    if (!methodology.prohibitedClaims.some(item => item.includes(keyword))) errors.push(`禁止结论缺少“${keyword}”边界`);
  }
  return errors;
}

export function assertValidBaziHiddenStemActivationMethodology(
  methodology: BaziHiddenStemActivationMethodology = BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY,
): void {
  const errors = validateBaziHiddenStemActivationMethodology(methodology);
  if (errors.length) throw new Error(`藏干引动条件方法校验失败：${errors.join('；')}`);
}
