import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Palace, Star, ZiweiChart } from '../lib/ziwei/types';
import type { HemingRelationshipContext, PalaceName } from '../lib/heming/types';

const PALACES: PalaceName[] = [
  '命宫', '兄弟宫', '夫妻宫', '子女宫', '财帛宫', '疾厄宫',
  '迁移宫', '交友宫', '官禄宫', '田宅宫', '福德宫', '父母宫',
];

function star(name: string, type: Star['type'] = 'major', siHua?: Star['siHua']): Star {
  return { name, type, siHua };
}

function createChart(
  owner: 'A' | 'B',
  options: { unknownTime?: boolean; stagePalace?: PalaceName } = {},
): ZiweiChart {
  const starsByPalace: Partial<Record<PalaceName, Star[]>> = owner === 'A'
    ? {
        命宫: [star('天同')],
        兄弟宫: [star('文昌', 'minor')],
        夫妻宫: [star('紫微')],
        财帛宫: [star('太阴', 'major', '禄')],
        官禄宫: [star('武曲')],
        福德宫: [star('擎羊', 'sha'), star('陀罗', 'sha')],
      }
    : {
        命宫: [star('紫微')],
        夫妻宫: [star('天同')],
        官禄宫: [star('武曲')],
        福德宫: [star('火星', 'sha'), star('铃星', 'sha')],
      };
  const palaces = PALACES.map((name, branch) => {
    const stars = starsByPalace[name] ?? [star(`${owner}${name}主星`)];
    return {
      branch,
      stem: branch % 10,
      name,
      stars,
      isEmpty: !stars.some(item => item.type === 'major'),
      selfSihua: name === '命宫' ? [{ starName: '测试自化', siHua: '忌' as const }] : undefined,
    } satisfies Palace;
  });
  const stagePalace = options.stagePalace ?? (owner === 'A' ? '夫妻宫' : '官禄宫');
  const stageBranch = PALACES.indexOf(stagePalace);

  return {
    birthInfo: {
      year: owner === 'A' ? 1990 : 1992,
      month: 6,
      day: 15,
      hour: options.unknownTime ? 0 : 4,
      gender: owner === 'A' ? 'male' : 'female',
      name: `${owner}方测试`,
      unknownTime: options.unknownTime ?? false,
    },
    lunarInfo: {
      lunarYear: 1990,
      lunarMonth: 5,
      lunarDay: 23,
      yearStem: 6,
      yearBranch: 6,
      isLeapMonth: false,
    },
    mingGongBranch: 0,
    shenGongBranch: 6,
    wuxingJu: 5,
    wuxingJuName: '土五局',
    ziweiPos: 7,
    palaces,
    daXians: [{
      startAge: 35,
      endAge: 44,
      palaceBranch: stageBranch,
      palaceName: stagePalace,
    }],
    currentAge: 36,
    currentDaXianIndex: 0,
  };
}

const relationshipContext: HemingRelationshipContext = {
  ownerARole: '甲方',
  ownerBRole: '乙方',
  customRelationshipLabel: null,
  mainConcern: '沟通与长期安排',
  confirmedFacts: {
    relationship_status: '稳定交往中',
    relationship_duration: '三年',
    planned_roles: '甲方产品，乙方市场',
  },
};

async function main() {
  const { evaluateHeming, evaluateHemingCondition } = await import('../lib/heming/engine');
  const { extractHemingFacts, normalizePalaceName } = await import('../lib/heming/facts');

  const chartA = createChart('A');
  const chartB = createChart('B');
  const result = evaluateHeming({ chartA, chartB, relationshipType: 'romantic', relationshipContext });

  const matchedIds = result.matchedRules.map(item => item.ruleId);
  assert.ok(matchedIds.includes('romantic-mutual-partner-archetype'));
  assert.ok(matchedIds.includes('romantic-dual-emotional-pressure'));
  assert.ok(matchedIds.includes('shared-stage-relationship-focus'));
  assert.ok(!matchedIds.includes('romantic-one-way-partner-archetype'));
  assert.deepEqual(result.suppressedRules, [{
    ruleId: 'romantic-one-way-partner-archetype',
    suppressedByRuleId: 'romantic-mutual-partner-archetype',
    reason: 'conflict_priority',
  }]);

  const mutual = result.matchedRules.find(item => item.ruleId === 'romantic-mutual-partner-archetype')!;
  assert.equal(mutual.phase, 'natal');
  assert.equal(mutual.confidence, 'medium');
  assert.ok(mutual.evidenceIds.length >= 5);
  assert.ok(mutual.evidenceIds.every(id => result.evidence.some(evidence => evidence.id === id)));
  assert.ok(result.evidence.every(evidence => (
    evidence.methodologyVersion === 'heming-method-v1'
    && evidence.chartEngineVersion === 'ziwei-v1'
    && !!evidence.ruleId
    && evidence.ruleVersion === 1
  )));
  assert.equal(result.dimensions.find(item => item.dimensionId === 'stage_timing')?.stageResults.length, 1);
  assert.equal(result.dimensions.find(item => item.dimensionId === 'relationship_needs')?.baselineResults.length, 1);
  assert.equal('selfSihua' in result.facts.A.palaces.命宫, false, '事实提取不得携带禁用的宫干自化字段');
  assert.equal('score' in result, false, '规则引擎不得生成单一匹配总分');
  assert.equal(normalizePalaceName('仆役'), '交友宫');
  assert.equal(normalizePalaceName('夫妻'), '夫妻宫');
  const rawNamedChart = structuredClone(chartA);
  rawNamedChart.palaces.forEach(palace => {
    palace.name = palace.name === '交友宫' ? '仆役' : palace.name.replace(/宫$/, '');
  });
  rawNamedChart.daXians[0].palaceName = rawNamedChart.daXians[0].palaceName.replace(/宫$/, '');
  const normalizedFacts = extractHemingFacts(rawNamedChart, chartB);
  assert.equal(normalizedFacts.A.palaces.交友宫.palace, '交友宫');
  assert.equal(normalizedFacts.A.currentStage?.palace, '夫妻宫');

  const swapped = evaluateHeming({ chartA: chartB, chartB: chartA, relationshipType: 'romantic', relationshipContext });
  assert.deepEqual(
    swapped.matchedRules.map(item => item.ruleId).sort(),
    result.matchedRules.map(item => item.ruleId).sort(),
    '交换双方后，对称规则集合应保持一致',
  );
  assert.equal(swapped.facts.A.palaces.命宫.stars[0].name, result.facts.B.palaces.命宫.stars[0].name);
  assert.equal(swapped.facts.B.palaces.命宫.stars[0].name, result.facts.A.palaces.命宫.stars[0].name);

  const changedA = structuredClone(chartA);
  changedA.palaces.find(palace => palace.name === '命宫')!.stars = [star('廉贞')];
  const factsBefore = extractHemingFacts(chartA, chartB);
  const factsAfter = extractHemingFacts(changedA, chartB);
  assert.deepEqual(factsAfter.B, factsBefore.B, '修改 A 方命盘不得改变 B 方原始事实');
  const oneWay = evaluateHeming({ chartA: changedA, chartB, relationshipType: 'romantic', relationshipContext });
  assert.ok(oneWay.matchedRules.some(item => item.ruleId === 'romantic-one-way-partner-archetype'));
  assert.ok(!oneWay.matchedRules.some(item => item.ruleId === 'romantic-mutual-partner-archetype'));

  const unknownA = evaluateHeming({
    chartA: createChart('A', { unknownTime: true }),
    chartB,
    relationshipType: 'romantic',
    relationshipContext,
  });
  assert.ok(unknownA.matchedRules.some(item => item.ruleId === 'unknown-time-confidence-guard'));
  const degradedMutual = unknownA.matchedRules.find(item => item.ruleId === 'romantic-mutual-partner-archetype')!;
  assert.equal(degradedMutual.confidence, 'low');
  assert.deepEqual(degradedMutual.degradedByRuleIds, ['unknown-time-confidence-guard']);

  const unknownB = evaluateHeming({
    chartA,
    chartB: createChart('B', { unknownTime: true }),
    relationshipType: 'romantic',
    relationshipContext,
  });
  assert.ok(unknownB.matchedRules.some(item => item.ruleId === 'unknown-time-confidence-guard-b'));
  assert.equal(unknownB.matchedRules.find(item => item.ruleId === 'romantic-mutual-partner-archetype')?.confidence, 'low');

  const changedStage = evaluateHeming({
    chartA: createChart('A', { stagePalace: '兄弟宫' }),
    chartB,
    relationshipType: 'romantic',
    relationshipContext,
  });
  assert.ok(!changedStage.matchedRules.some(item => item.ruleId === 'shared-stage-relationship-focus'));
  assert.deepEqual(
    changedStage.matchedRules.filter(item => item.phase === 'natal').map(item => item.ruleId).sort(),
    result.matchedRules.filter(item => item.phase === 'natal').map(item => item.ruleId).sort(),
    '阶段变化不得修改本命基线结果',
  );

  const deterministic = evaluateHeming({ chartA, chartB, relationshipType: 'romantic', relationshipContext });
  assert.deepEqual(deterministic, result, '相同输入必须产生完全相同的结构化结果');

  const facts = extractHemingFacts(chartA, chartB);
  const conditionInput = {
    facts,
    relationshipContext,
    methodologyVersion: 'heming-method-v1',
    chartEngineVersion: 'ziwei-v1',
    ruleId: 'condition-test',
    ruleVersion: 1,
    confidence: 'high' as const,
  };
  assert.equal(evaluateHemingCondition({
    kind: 'star_overlap',
    left: { owner: 'A', palace: '夫妻宫' },
    right: { owner: 'B', palace: '命宫' },
    starTypes: ['major'],
    minCount: 1,
  }, conditionInput).matched, true);
  assert.equal(evaluateHemingCondition({
    kind: 'star_category_count',
    target: { owner: 'A', palace: '福德宫' },
    category: 'sha',
    operator: 'gte',
    value: 2,
  }, conditionInput).matched, true);
  assert.equal(evaluateHemingCondition({
    kind: 'natal_sihua_present',
    target: { owner: 'A', palace: '财帛宫' },
    siHua: '禄',
  }, conditionInput).matched, true);
  assert.equal(evaluateHemingCondition({
    kind: 'palace_empty',
    target: { owner: 'A', palace: '兄弟宫' },
    expected: true,
  }, conditionInput).matched, true);
  assert.equal(evaluateHemingCondition({ kind: 'birth_time_known', owner: 'A', expected: true }, conditionInput).matched, true);
  assert.equal(evaluateHemingCondition({ kind: 'stage_focus_in', owner: 'A', palaces: ['夫妻宫'] }, conditionInput).matched, true);
  assert.equal(evaluateHemingCondition({ kind: 'confirmed_context_present', field: 'planned_roles' }, conditionInput).matched, true);
  assert.equal(evaluateHemingCondition({ kind: 'confirmed_context_present', field: 'exit_mechanism' }, conditionInput).matched, false);

  const managerResult = evaluateHeming({ chartA, chartB, relationshipType: 'manager_report', relationshipContext });
  assert.deepEqual(managerResult.roles, { A: '甲方', B: '乙方' });
  assert.ok(managerResult.matchedRules.some(item => item.ruleId === 'manager-similar-career-style'));
  const customResult = evaluateHeming({ chartA, chartB, relationshipType: 'custom', relationshipContext });
  assert.ok(customResult.matchedRules.some(item => item.ruleId === 'shared-stage-relationship-focus'));

  const incompleteChart = structuredClone(chartA);
  incompleteChart.palaces = incompleteChart.palaces.filter(palace => palace.name !== '父母宫');
  assert.throws(
    () => evaluateHeming({ chartA: incompleteChart, chartB, relationshipType: 'romantic' }),
    /缺少宫位：父母宫/,
  );
  const duplicateChart = structuredClone(chartA);
  duplicateChart.palaces[1].name = '命宫';
  assert.throws(
    () => evaluateHeming({ chartA: duplicateChart, chartB, relationshipType: 'romantic' }),
    /宫位重复：命宫/,
  );

  const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-heming-engine-test-'));
  process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');
  const { createConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const { evaluateHemingConversation } = await import('../lib/heming/service');
  try {
    const conversation = createConversation({
      type: 'heming',
      title: '规则服务测试',
      birthInfoA: chartA.birthInfo,
      birthInfoB: chartB.birthInfo,
      chartSnapshotA: chartA,
      chartSnapshotB: chartB,
      relationshipType: 'romantic',
      relationshipContext,
    });
    const serviceResult = evaluateHemingConversation(conversation.id);
    assert.equal(serviceResult.relationshipType, 'romantic');
    assert.deepEqual(serviceResult.matchedRules, result.matchedRules);

    const legacySnapshotB = structuredClone(chartB);
    delete legacySnapshotB.birthInfo.unknownTime;
    const legacyConversation = createConversation({
      type: 'heming',
      title: '旧快照未知时辰兼容测试',
      birthInfoA: chartA.birthInfo,
      birthInfoB: { ...chartB.birthInfo, unknownTime: true },
      chartSnapshotA: chartA,
      chartSnapshotB: legacySnapshotB,
      relationshipType: 'romantic',
      relationshipContext,
    });
    const legacyResult = evaluateHemingConversation(legacyConversation.id);
    assert.ok(legacyResult.matchedRules.some(item => item.ruleId === 'unknown-time-confidence-guard-b'));
  } finally {
    getDatabase().close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  console.log('M4-2 合盘规则引擎测试通过：事实隔离、七类条件、冲突裁决、未知时辰降级、阶段分层、确定性和服务集成均正常。');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
