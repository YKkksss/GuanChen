import assert from 'node:assert/strict';
import { LIFE_EVENT_CATEGORIES } from '../lib/events/types';
import {
  RECTIFICATION_METHODOLOGY,
  RECTIFICATION_METHODOLOGY_VERSION,
  RECTIFICATION_TIME_POLICY_VERSION,
  getRectificationTimeSlot,
  getRectificationTopicMapping,
} from '../lib/rectification/methodology';
import type { RectificationMethodology } from '../lib/rectification/types';
import { RECTIFICATION_TIME_SLOT_KEYS } from '../lib/rectification/types';
import {
  assertValidRectificationMethodology,
  validateRectificationMethodology,
} from '../lib/rectification/validator';

function clone(): RectificationMethodology {
  return structuredClone(RECTIFICATION_METHODOLOGY);
}

function main() {
  assert.deepEqual(validateRectificationMethodology(RECTIFICATION_METHODOLOGY), []);
  assert.doesNotThrow(() => assertValidRectificationMethodology(RECTIFICATION_METHODOLOGY));
  assert.equal(RECTIFICATION_METHODOLOGY.version, RECTIFICATION_METHODOLOGY_VERSION);
  assert.equal(RECTIFICATION_METHODOLOGY.timePolicy.version, RECTIFICATION_TIME_POLICY_VERSION);
  assert.equal(RECTIFICATION_METHODOLOGY.status, 'provisional');
  assert.equal(RECTIFICATION_METHODOLOGY.scorePolicy.status, 'provisional-unvalidated');
  assert.equal(RECTIFICATION_METHODOLOGY.scorePolicy.displayLabel, '相对证据指数');
  assert.equal(RECTIFICATION_METHODOLOGY.scorePolicy.eventQualityWeights.unconfirmed, 0);
  assert.equal(RECTIFICATION_METHODOLOGY.scorePolicy.datePrecisionWeights.unknown, 0);
  assert.equal(RECTIFICATION_METHODOLOGY.scorePolicy.rangeYearDecayFloor, 0.35);
  assert.equal(RECTIFICATION_METHODOLOGY.scorePolicy.nonDiscriminatingEvidenceWeight, 0);

  assert.deepEqual(
    RECTIFICATION_METHODOLOGY.timePolicy.slots.map(item => item.key),
    [...RECTIFICATION_TIME_SLOT_KEYS],
  );
  assert.equal(getRectificationTimeSlot('early_zi').engineTimeIndex, 0);
  assert.equal(getRectificationTimeSlot('late_zi').engineTimeIndex, 12);
  assert.equal(getRectificationTimeSlot('late_zi').branchIndex, 0);

  assert.deepEqual(
    RECTIFICATION_METHODOLOGY.topicMappings.map(item => item.category).sort(),
    [...LIFE_EVENT_CATEGORIES].sort(),
  );
  assert.ok(getRectificationTopicMapping('career').primaryPalaces.includes('官禄宫'));
  assert.equal(getRectificationTopicMapping('custom').scoreable, false);

  for (const forbidden of ['发旋数量或位置', '出生姿势或婴儿睡姿', '仅凭性格描述匹配时辰']) {
    assert.ok(RECTIFICATION_METHODOLOGY.forbiddenEvidence.includes(forbidden));
  }
  assert.ok(RECTIFICATION_METHODOLOGY.rules.some(rule => rule.id === 'insufficient-event-guard'));
  assert.ok(RECTIFICATION_METHODOLOGY.rules.some(rule => rule.id === 'indistinguishable-candidate-guard'));
  assert.ok(RECTIFICATION_METHODOLOGY.sources.some(source => source.id === 'noaa-solar-equations'));
  assert.ok(RECTIFICATION_METHODOLOGY.sources.some(source => source.id === 'iana-tzdb'));
  assert.ok(RECTIFICATION_METHODOLOGY.sources.some(source => source.id === 'iztro-2.5.8'));

  const duplicateSlot = clone();
  duplicateSlot.timePolicy.slots[1].key = 'early_zi';
  assert.ok(validateRectificationMethodology(duplicateSlot).some(error => error.includes('时段键重复')));

  const invalidTimeIndex = clone();
  invalidTimeIndex.timePolicy.slots[0].engineTimeIndex = 13;
  assert.ok(validateRectificationMethodology(invalidTimeIndex).some(error => error.includes('引擎序号必须在 0-12')));

  const unknownPalace = clone();
  unknownPalace.topicMappings[0].primaryPalaces = ['不存在宫' as never];
  assert.ok(validateRectificationMethodology(unknownPalace).some(error => error.includes('未知宫位')));

  const customScoring = clone();
  customScoring.topicMappings.find(item => item.category === 'custom')!.scoreable = true;
  assert.ok(validateRectificationMethodology(customScoring).some(error => error.includes('自定义事件不能参与评分')));

  const fakeProbability = clone();
  fakeProbability.scorePolicy.displayLabel = '正确概率' as never;
  assert.ok(validateRectificationMethodology(fakeProbability).some(error => error.includes('相对证据指数')));

  const nonDiscriminatingScore = clone();
  nonDiscriminatingScore.scorePolicy.nonDiscriminatingEvidenceWeight = 0.5 as never;
  assert.ok(validateRectificationMethodology(nonDiscriminatingScore).some(error => error.includes('无区分度证据权重必须为 0')));

  const removedSafetyRule = clone();
  removedSafetyRule.rules = removedSafetyRule.rules.filter(rule => rule.id !== 'indistinguishable-candidate-guard');
  assert.ok(validateRectificationMethodology(removedSafetyRule).some(error => error.includes('缺少安全规则')));

  const forbiddenEvidence = clone();
  forbiddenEvidence.forbiddenEvidence = forbiddenEvidence.forbiddenEvidence.filter(item => item !== '发旋数量或位置');
  assert.ok(validateRectificationMethodology(forbiddenEvidence).some(error => error.includes('必须禁用：发旋数量或位置')));

  const invalidSource = clone();
  invalidSource.rules[0].sourceIds = ['not-found'];
  assert.ok(validateRectificationMethodology(invalidSource).some(error => error.includes('引用未知来源')));

  console.log('M5-0 校时方法论测试通过：时间策略、候选时段、事件映射、相对评分、安全边界和来源契约均正常。');
}

main();
