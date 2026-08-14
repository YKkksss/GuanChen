import assert from 'node:assert/strict';
import { HEMING_METHODOLOGY, getRelationshipDefinition } from '../lib/heming/methodology';
import type { HemingMethodology, PalaceName } from '../lib/heming/types';
import { RELATIONSHIP_TYPES } from '../lib/heming/types';
import { assertValidHemingMethodology, validateHemingMethodology } from '../lib/heming/validator';

function cloneMethodology(): HemingMethodology {
  return structuredClone(HEMING_METHODOLOGY);
}

function main() {
  assert.deepEqual(validateHemingMethodology(HEMING_METHODOLOGY), []);
  assert.doesNotThrow(() => assertValidHemingMethodology(HEMING_METHODOLOGY));
  assert.equal(HEMING_METHODOLOGY.version, 'heming-method-v1');
  assert.deepEqual(
    HEMING_METHODOLOGY.relationships.map(item => item.type).sort(),
    [...RELATIONSHIP_TYPES].sort(),
  );

  const romantic = getRelationshipDefinition('romantic');
  assert.equal(romantic.roles[0].owner, 'A');
  assert.equal(romantic.roles[1].owner, 'B');
  assert.ok(romantic.dimensions.some(item => item.id === 'relationship_needs'));
  assert.ok(romantic.dimensions.some(item => item.id === 'stage_timing' && item.includeAnnualTransit));

  const parentChild = getRelationshipDefinition('parent_child');
  assert.equal(parentChild.roles[0].label, '父母方');
  assert.equal(parentChild.roles[1].label, '子女方');
  assert.ok(parentChild.requiredRealityContext.includes('child_age'));

  assert.ok(HEMING_METHODOLOGY.schoolPolicy.forbiddenFacts.includes('palace_self_sihua'));
  assert.ok(HEMING_METHODOLOGY.schoolPolicy.forbiddenFacts.includes('cross_chart_flying_sihua'));
  assert.ok(HEMING_METHODOLOGY.schoolPolicy.forbiddenFacts.includes('single_global_compatibility_score'));
  assert.ok(!HEMING_METHODOLOGY.schoolPolicy.allowedFacts.includes('cross_chart_flying_sihua'));

  const mutualRule = HEMING_METHODOLOGY.rules.find(item => item.id === 'romantic-mutual-partner-archetype');
  assert.ok(mutualRule);
  assert.deepEqual(mutualRule.evidenceOwners, ['A', 'B', 'interaction']);
  assert.equal(mutualRule.effect, 'observe', '结构对应不得自动当作支持性或吉象');
  assert.ok(mutualRule.conflictsWith.includes('romantic-one-way-partner-archetype'));

  const unknownTimeRule = HEMING_METHODOLOGY.rules.find(item => item.id === 'unknown-time-confidence-guard');
  assert.equal(unknownTimeRule?.effect, 'insufficient');
  assert.equal(unknownTimeRule?.priority, 100);

  const invalidPalace = cloneMethodology();
  invalidPalace.relationships[0].dimensions[0].ownerAPalaces = ['不存在宫' as PalaceName];
  assert.ok(validateHemingMethodology(invalidPalace).some(error => error.includes('未知宫位')));

  const forbiddenPhrase = cloneMethodology();
  forbiddenPhrase.rules[0].conclusionTemplate = '双方天生不合';
  assert.ok(validateHemingMethodology(forbiddenPhrase).some(error => error.includes('禁用表达')));

  const mixedSchool = cloneMethodology();
  mixedSchool.schoolPolicy.allowedFacts.push('cross_chart_flying_sihua');
  assert.ok(validateHemingMethodology(mixedSchool).some(error => error.includes('同时允许和禁用')));

  const missingIdentityEvidence = cloneMethodology();
  missingIdentityEvidence.rules[0].evidenceOwners = ['A'];
  const identityErrors = validateHemingMethodology(missingIdentityEvidence);
  assert.ok(identityErrors.some(error => error.includes('必须包含 B 证据归属')));
  assert.ok(identityErrors.some(error => error.includes('必须包含 interaction 证据归属')));

  const invalidDimension = cloneMethodology();
  invalidDimension.rules[0].dimensionId = 'not_a_dimension';
  assert.ok(validateHemingMethodology(invalidDimension).some(error => error.includes('不属于关系')));

  const asymmetricConflict = cloneMethodology();
  asymmetricConflict.rules.find(item => item.id === 'romantic-one-way-partner-archetype')!.conflictsWith = [];
  assert.ok(validateHemingMethodology(asymmetricConflict).some(error => error.includes('冲突必须双向声明')));

  const ruleCopy = HEMING_METHODOLOGY.rules
    .map(rule => `${rule.name}\n${rule.conclusionTemplate}\n${rule.adviceTemplate}`)
    .join('\n');
  for (const phrase of HEMING_METHODOLOGY.prohibitedPhrases) {
    assert.ok(!ruleCopy.includes(phrase), `正式规则不得包含禁用表达：${phrase}`);
  }

  console.log('M4-0 合盘方法论测试通过：流派边界、关系定义、规则契约、身份证据、冲突声明和禁用措辞均正常。');
}

main();
