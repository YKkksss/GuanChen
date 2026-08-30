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
import { BAZI_PATTERN_CONDITION_METHODOLOGY } from '../lib/bazi/pattern-condition-methodology';
import {
  assertValidBaziPatternConditionMethodology,
  validateBaziPatternConditionMethodology,
} from '../lib/bazi/pattern-condition-validator';
import type { BaziPatternConditionMethodology } from '../lib/bazi/pattern-condition-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-pattern-condition-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

function createResult(input: { unknownTime?: boolean } = {}) {
  const chart = calculateBazi(input.unknownTime
    ? { birthDate: '1990-01-01', gender: 'male', unknownTime: true }
    : { birthDate: '1990-01-01', birthTime: '12:00', gender: 'male' });
  const interpretation = analyzeBaziInterpretation(chart);
  const luckCycles = calculateBaziLuckCycles(chart);
  const annualTimeline = calculateBaziAnnualTimeline(chart, luckCycles);
  const relationAudit = auditBaziRelations(chart, luckCycles, annualTimeline);
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
  return { chart, interpretation, strengthComposite, patternCondition };
}

async function main() {
  assert.deepEqual(validateBaziPatternConditionMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziPatternConditionMethodology());

  const complete = createResult();
  const result = complete.patternCondition;
  assert.equal(result.status, 'complete');
  assert.equal(result.capabilities.formationConditionEvidence, true);
  assert.equal(result.capabilities.breakingRiskEvidence, true);
  assert.equal(result.capabilities.rescueCandidateEvidence, true);
  assert.equal(result.capabilities.finalPatternSuccessFailure, false);
  assert.equal(result.capabilities.patternRank, false);
  assert.equal(result.strengthContext.assessment, complete.strengthComposite.staticBaseline.assessment);
  assert.equal(result.candidates.length, complete.interpretation.pattern.candidates.length, '必须逐一保留全部 M9-3 候选');
  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.every(candidate => candidate.formationSupport.some(check => check.ruleId === 'candidate-preserved' && check.status === 'evidence_present')));
  assert.ok(result.candidates.every(candidate => candidate.formationSupport.some(check => check.ruleId === 'strength-context-review' && check.status === 'requires_manual_review')));
  assert.ok(result.candidates.every(candidate => candidate.breakingRisks.some(check => check.ruleId === 'common-month-interaction')));
  assert.ok(result.candidates.every(candidate => candidate.conclusion === 'condition_matrix_only_no_success_failure_verdict'));
  assert.ok(result.candidates.every(candidate => !('score' in candidate) && !('successFailure' in candidate)));
  assert.ok(result.candidates.flatMap(candidate => [
    ...candidate.formationSupport, ...candidate.breakingRisks, ...candidate.rescueCandidates,
  ]).every(check => check.boundary.includes(check.kind === 'formation_support' ? '不等于格局已经成立' : check.kind === 'breaking_risk' ? '不等于格局已经破败' : '不等于救应已经完成')));

  const hiddenOnly = result.candidates.flatMap(candidate => [
    ...candidate.formationSupport, ...candidate.breakingRisks, ...candidate.rescueCandidates,
  ]).filter(check => check.status === 'requires_manual_review' && check.evidence.some(item => item.visibility === 'hidden'));
  assert.ok(hiddenOnly.every(check => check.evidence.every(item => item.visibility !== 'surface') || check.ruleId.includes('combine')));

  const unknown = createResult({ unknownTime: true }).patternCondition;
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.candidates.every(candidate => candidate.reviewFlags.includes('unknown_time')));
  assert.ok(unknown.candidates.some(candidate => [...candidate.formationSupport, ...candidate.breakingRisks, ...candidate.rescueCandidates]
    .some(check => check.status === 'unknown_due_to_missing_time')));

  const invalid = structuredClone(BAZI_PATTERN_CONDITION_METHODOLOGY) as BaziPatternConditionMethodology;
  invalid.policy.verdictPolicy = 'final_pattern_success_failure' as never;
  assert.ok(validateBaziPatternConditionMethodology(invalid).some(item => item.includes('格局成败')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const patternRoute = await import('../app/api/bazi/charts/[id]/pattern-conditions/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-13 格局条件测试', birthDate: '1990-01-01', birthTime: '12:00',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await patternRoute.POST(new Request('http://local/pattern-conditions', { method: 'POST' }), {
      params: Promise.resolve({ id: chartId }),
    });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ patternCondition: { id: string; patternConditionFingerprint: string; result: typeof result } }>(firstResponse)).patternCondition;
    assert.equal(first.patternConditionFingerprint.length, 64);
    const second = (await json<{ patternCondition: { id: string } }>(await patternRoute.POST(
      new Request('http://local/pattern-conditions', { method: 'POST' }),
      { params: Promise.resolve({ id: chartId }) },
    ))).patternCondition;
    assert.equal(second.id, first.id, '相同上游版本与方法版本应复用格局条件版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; patternConditionVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.equal(conversation.patternConditionVersionId, first.id);
    assert.equal(conversation.promptVersion, 'bazi-chat-month-day-pattern-v17');
    const question = appendBaziMessage({ conversationId: conversation.id, role: 'user', content: '请解释格局成格支持、破格风险和救应候选' });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.patternConditionVersionId, first.id);
    assert.ok(built.messages.some(message => message.content.includes('权威八字格局成败、破格与救应条件证据快照')));
    assert.ok(built.messages.some(message => message.content.includes('成格支持条件')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('pattern_condition_evidence_audit'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('pattern_success_failure'));
    assert.ok(findBaziOutputViolations('因此可以判定正官格已经成格').includes('越权宣告格局成败或救应完成'));
    assert.ok(findBaziOutputViolations('这个格局成功率是90%').includes('越权生成格局分数或层次'));
    assert.deepEqual(findBaziOutputViolations('观察到支持条件，但不等于已经成格'), []);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 35').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_pattern_condition_versions').get() as { count: number }).count, 1);

    console.log('M9-13 格局条件测试通过：候选保留、三类条件矩阵、显隐分离、时柱降级、v35 持久化与上下文边界均正常。');
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
