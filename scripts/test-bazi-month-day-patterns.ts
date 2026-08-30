import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateBazi } from '../lib/bazi/engine';
import { analyzeBaziInterpretation } from '../lib/bazi/interpretation-engine';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { calculateBaziAnnualTimeline } from '../lib/bazi/annual-timeline-engine';
import { auditBaziRelations } from '../lib/bazi/relation-audit-engine';
import { adjudicateBaziRelations } from '../lib/bazi/relation-adjudication-engine';
import { auditBaziDynamicTenGods } from '../lib/bazi/dynamic-ten-god-engine';
import { auditBaziTenGodRepeats } from '../lib/bazi/ten-god-repeat-engine';
import { auditBaziTransparencyRoots } from '../lib/bazi/transparency-root-engine';
import { auditBaziHiddenStemActivationConditions } from '../lib/bazi/hidden-stem-activation-engine';
import { auditBaziStrengthComposite } from '../lib/bazi/strength-composite-engine';
import { auditBaziPatternConditions } from '../lib/bazi/pattern-condition-engine';
import { calculateBaziMonthDayTimeline } from '../lib/bazi/month-day-timeline-engine';
import { auditBaziMonthDayRelations } from '../lib/bazi/month-day-relation-engine';
import { auditBaziMonthDayVisibilityConditions } from '../lib/bazi/month-day-visibility-engine';
import { auditBaziMonthDayStrengthComposite } from '../lib/bazi/month-day-strength-engine';
import { auditBaziMonthDayPatternConditions } from '../lib/bazi/month-day-pattern-engine';
import { BAZI_MONTH_DAY_PATTERN_METHODOLOGY } from '../lib/bazi/month-day-pattern-methodology';
import {
  assertValidBaziMonthDayPatternMethodology,
  validateBaziMonthDayPatternMethodology,
} from '../lib/bazi/month-day-pattern-validator';
import type {
  BaziMonthDayPatternMethodology,
  BaziMonthDayPatternResult,
} from '../lib/bazi/month-day-pattern-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-month-day-pattern-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

function buildResult(input: { unknownTime?: boolean; timeZoneId?: string } = {}) {
  const chart = calculateBazi(input.unknownTime
    ? { birthDate: '2022-03-09', gender: 'male', unknownTime: true, timeZoneId: input.timeZoneId }
    : {
      birthDate: '2022-03-09', birthTime: '20:51', gender: 'male',
      timeZoneId: input.timeZoneId ?? 'Asia/Shanghai', lateZiPolicy: 'same_day',
    });
  const interpretation = analyzeBaziInterpretation(chart);
  const luckCycles = calculateBaziLuckCycles(chart);
  const annual = calculateBaziAnnualTimeline(chart, luckCycles);
  const relationAudit = auditBaziRelations(chart, luckCycles, annual);
  const relationAdjudication = adjudicateBaziRelations(chart, relationAudit);
  const dynamicTenGod = auditBaziDynamicTenGods(chart, relationAudit, relationAdjudication);
  const tenGodRepeat = auditBaziTenGodRepeats(chart, dynamicTenGod, relationAudit);
  const transparencyRoot = auditBaziTransparencyRoots(chart, dynamicTenGod, tenGodRepeat);
  const hiddenStemActivation = auditBaziHiddenStemActivationConditions(
    chart, relationAudit, relationAdjudication, dynamicTenGod, tenGodRepeat, transparencyRoot,
  );
  const strengthComposite = auditBaziStrengthComposite(
    chart, interpretation, dynamicTenGod, transparencyRoot, hiddenStemActivation,
  );
  const patternCondition = auditBaziPatternConditions(chart, interpretation, strengthComposite);
  const timeline = calculateBaziMonthDayTimeline(chart, annual, 2030);
  const relation = auditBaziMonthDayRelations(chart, timeline, '2030-12-12');
  const visibility = auditBaziMonthDayVisibilityConditions(chart, relation);
  const strength = auditBaziMonthDayStrengthComposite(chart, interpretation, relation, visibility);
  return {
    chart,
    patternCondition,
    result: auditBaziMonthDayPatternConditions(chart, patternCondition, relation, visibility, strength),
  };
}

function allChecks(result: BaziMonthDayPatternResult) {
  return result.segments.flatMap(segment => segment.candidates.flatMap(candidate => [
    ...candidate.formationSupport,
    ...candidate.breakingRisks,
    ...candidate.rescueCandidates,
  ]));
}

async function main() {
  assert.deepEqual(validateBaziMonthDayPatternMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziMonthDayPatternMethodology());

  const complete = buildResult();
  const result = complete.result;
  assert.equal(result.status, 'complete');
  assert.equal(result.target.dayGanZhi, '辛巳');
  assert.equal(result.target.segmentCount, 2, 'M9-18 必须保持交运日前后两个精确片段');
  assert.deepEqual(result.segments.map(segment => [segment.startAt, segment.endAtExclusive]), [
    ['2030-12-12 00:00:00', '2030-12-12 06:51:00'],
    ['2030-12-12 06:51:00', '2030-12-13 00:00:00'],
  ]);
  for (const segment of result.segments) {
    assert.equal(segment.candidates.length, complete.patternCondition.candidates.length);
    for (const candidate of segment.candidates) {
      const sourceCandidate = complete.patternCondition.candidates.find(item => item.id === candidate.candidateId);
      assert.ok(sourceCandidate);
      const sourceChecks = [...sourceCandidate.formationSupport, ...sourceCandidate.breakingRisks, ...sourceCandidate.rescueCandidates];
      const mappedChecks = [...candidate.formationSupport, ...candidate.breakingRisks, ...candidate.rescueCandidates];
      assert.equal(mappedChecks.length, sourceChecks.length);
      for (const mapping of mappedChecks) {
        const source = sourceChecks.find(item => item.ruleId === mapping.ruleId && item.kind === mapping.kind);
        assert.ok(source, `缺少 ${mapping.ruleId} 的 M9-13 来源检查`);
        assert.equal(mapping.staticStatus, source.status, '动态映射不得改写 M9-13 静态状态');
        assert.deepEqual(mapping.linkedBreakingRuleIds, source.linkedBreakingRuleIds);
        assert.equal(mapping.conclusion, 'mapping_only_no_condition_or_pattern_verdict');
      }
    }
    assert.ok(segment.strengthContext.boundary.includes('不参与'));
  }

  const checks = allChecks(result);
  const surfaceCoverages = checks.flatMap(check => [
    check.inheritedCoverage,
    check.focusCoverage,
    check.combinedCoverage,
  ]);
  assert.ok(surfaceCoverages.flatMap(item => item.evidence).every(item => item.visibility !== 'hidden'), '藏干不得进入表层角色覆盖');
  assert.ok(checks.flatMap(item => item.hiddenContext).every(item => item.visibility === 'hidden' && item.sourceStage === 'M9-16'));
  assert.ok(checks.flatMap(item => item.relationContext).every(item => item.visibility === 'structural' && item.sourceStage === 'M9-15'));
  assert.ok(checks.filter(item => item.matchMode === 'absence').every(item => [
    item.inheritedCoverage.status,
    item.focusCoverage.status,
    item.combinedCoverage.status,
  ].every(status => status === 'absence_rule_not_reclassified')));
  assert.ok(result.segments[0].candidates.flatMap(candidate => [
    ...candidate.formationSupport, ...candidate.breakingRisks, ...candidate.rescueCandidates,
  ]).flatMap(check => check.inheritedCoverage.evidence)
    .filter(item => item.visibility === 'surface')
    .every(item => item.layer === 'annual'), '交运前的既有表层只能来自流年');
  assert.equal(result.segments[0].luckCycleIndex, null, '交运前片段不得提前绑定大运');
  assert.notEqual(result.segments[1].luckCycleIndex, null, '交运后片段必须切换到实际大运');
  assert.ok(surfaceCoverages.flatMap(item => item.evidence)
    .filter(item => item.visibility === 'surface')
    .every(item => ['luck_cycle', 'annual', 'month', 'day'].includes(item.layer ?? '')));
  assert.equal(result.capabilities.finalPatternSuccessFailure, false);
  assert.equal(result.capabilities.rescueCompletionVerdict, false);
  assert.equal(result.capabilities.patternScore, false);
  assert.equal(result.capabilities.usefulGodVerdict, false);
  assert.equal(result.capabilities.eventPrediction, false);

  const unknown = buildResult({ unknownTime: true }).result;
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.reviewFlags.includes('unknown_time'));
  assert.ok(allChecks(unknown).some(check => [
    check.inheritedCoverage.status,
    check.focusCoverage.status,
    check.combinedCoverage.status,
  ].includes('partial_unknown_time')));

  const unsupported = buildResult({ timeZoneId: 'America/New_York' }).result;
  assert.equal(unsupported.status, 'sequence_only_unavailable');
  assert.equal(unsupported.segments.length, 0);
  assert.equal(unsupported.capabilities.dynamicRoleCoverageMapping, false);

  const invalid = structuredClone(BAZI_MONTH_DAY_PATTERN_METHODOLOGY) as BaziMonthDayPatternMethodology;
  invalid.policy.hiddenPolicy = 'hidden_stem_counts_as_surface_role' as never;
  assert.ok(validateBaziMonthDayPatternMethodology(invalid).some(item => item.includes('藏干')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const patternRoute = await import('../app/api/bazi/charts/[id]/month-day-patterns/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-18 流月流日格局映射测试', birthDate: '2022-03-09', birthTime: '20:51',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await patternRoute.POST(new Request('http://local/month-day-patterns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDate: '2030-12-12', targetYear: 2030 }),
    }), { params: Promise.resolve({ id: chartId }) });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ monthDayPattern: {
      id: string; targetDate: string; patternConditionVersionId: string;
      monthDayRelationVersionId: string; monthDayVisibilityVersionId: string;
      monthDayStrengthVersionId: string; monthDayPatternFingerprint: string; result: typeof result;
    } }>(firstResponse)).monthDayPattern;
    assert.equal(first.targetDate, '2030-12-12');
    assert.equal(first.result.segments.length, 2);
    assert.equal(first.monthDayPatternFingerprint.length, 64);
    assert.ok(first.patternConditionVersionId && first.monthDayRelationVersionId
      && first.monthDayVisibilityVersionId && first.monthDayStrengthVersionId);
    const second = (await json<{ monthDayPattern: { id: string } }>(await patternRoute.POST(
      new Request('http://local/month-day-patterns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate: '2030-12-12', targetYear: 2030 }),
      }),
      { params: Promise.resolve({ id: chartId }) },
    ))).monthDayPattern;
    assert.equal(second.id, first.id, '相同五类上游版本、日期和方法版本必须复用 M9-18 结果');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: {
      id: string; monthDayPatternVersionId: string; promptVersion: string;
    } }>(conversationResponse)).conversation;
    assert.ok(conversation.monthDayPatternVersionId);
    assert.equal(conversation.promptVersion, 'bazi-chat-month-day-pattern-v17');
    const question = appendBaziMessage({
      conversationId: conversation.id,
      role: 'user',
      content: '请解释2030年12月12日的格局静态条件、岁运既有和流月流日新增角色映射，不判成败',
    });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.monthDayPatternVersionId, first.id);
    assert.equal(built.manifest.monthDayPatternTargetDate, '2030-12-12');
    assert.ok(built.messages.some(message => message.content.includes('权威八字流月流日格局条件映射快照')));
    assert.ok(built.messages.some(message => message.content.includes('静态状态')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('month_day_pattern_condition_mapping_audit'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('month_day_pattern_success_failure_verdict'));
    assert.ok(findBaziOutputViolations('流月格局条件角色组覆盖，所以已经成格').includes('越权裁决流月流日格局结果'));
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 40').get());
    assert.ok((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_month_day_pattern_versions').get() as { count: number }).count >= 2);

    console.log('M9-18 流月流日格局条件映射测试通过：静态状态保留、三层角色覆盖、结构与藏干隔离、精确分段、v40 缓存及上下文边界均正常。');
  } finally {
    const database = globalThis.__ziweiSqlite;
    if (database?.open) database.close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
