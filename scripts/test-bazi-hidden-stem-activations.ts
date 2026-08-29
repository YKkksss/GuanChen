import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateBazi } from '../lib/bazi/engine';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { calculateBaziAnnualTimeline } from '../lib/bazi/annual-timeline-engine';
import { auditBaziRelations } from '../lib/bazi/relation-audit-engine';
import { adjudicateBaziRelations } from '../lib/bazi/relation-adjudication-engine';
import { auditBaziDynamicTenGods } from '../lib/bazi/dynamic-ten-god-engine';
import { auditBaziTenGodRepeats } from '../lib/bazi/ten-god-repeat-engine';
import { auditBaziTransparencyRoots } from '../lib/bazi/transparency-root-engine';
import { auditBaziHiddenStemActivationConditions } from '../lib/bazi/hidden-stem-activation-engine';
import { BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY } from '../lib/bazi/hidden-stem-activation-methodology';
import {
  assertValidBaziHiddenStemActivationMethodology,
  validateBaziHiddenStemActivationMethodology,
} from '../lib/bazi/hidden-stem-activation-validator';
import type { BaziHiddenStemActivationMethodology } from '../lib/bazi/hidden-stem-activation-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-hidden-stem-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

function createResult(input: { unknownTime?: boolean } = {}) {
  const chart = calculateBazi(input.unknownTime
    ? { birthDate: '1990-01-01', gender: 'male', unknownTime: true }
    : { birthDate: '1990-01-01', birthTime: '12:00', gender: 'male' });
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
  return { chart, relationAudit, relationAdjudication, dynamicTenGod, tenGodRepeat, transparencyRoot, hiddenStemActivation };
}

async function main() {
  assert.deepEqual(validateBaziHiddenStemActivationMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziHiddenStemActivationMethodology());

  const complete = createResult();
  const result = complete.hiddenStemActivation;
  assert.equal(result.status, 'complete');
  assert.equal(result.capabilities.hiddenStemTouchConditionAudit, true);
  assert.equal(result.capabilities.hiddenStemActivationVerdict, false);
  assert.equal(result.capabilities.strengthEffectVerdict, false);

  const candidates = result.years.flatMap(year => year.segments.flatMap(segment => segment.candidates));
  assert.ok(candidates.length > 0);
  assert.ok(candidates.some(candidate => candidate.scope === 'month_command_hidden_stem'));
  assert.ok(candidates.some(candidate => candidate.status === 'no_touch_condition'));
  assert.ok(candidates.some(candidate => candidate.status === 'multiple_touch_conditions'));

  const exactSurface = candidates.find(candidate => candidate.entries.some(entry =>
    entry.type === 'exact_dynamic_surface_same_stem' && entry.state === 'matched'))!;
  const exactEntry = exactSurface.entries.find(entry => entry.type === 'exact_dynamic_surface_same_stem')!;
  assert.ok(exactEntry.repeatClusterId, '完全同干岁运表层入口必须回指 M9-9');
  assert.ok(exactEntry.transparencyCandidateId, '完全同干岁运表层入口必须回指 M9-10');
  assert.ok(exactEntry.evidenceOccurrenceIds.length > 0);

  const sameBranch = candidates.find(candidate => candidate.entries.some(entry =>
    entry.type === 'same_branch_repeat' && entry.state === 'matched'))!;
  const sameBranchEntry = sameBranch.entries.find(entry => entry.type === 'same_branch_repeat')!;
  assert.ok(sameBranchEntry.sourceNodeIds.length > 0);
  assert.ok(sameBranchEntry.sourceNodeIds.every(nodeId => nodeId !== sameBranch.hiddenOccurrence.nodeId));

  const relation = candidates.find(candidate => candidate.entries.some(entry =>
    entry.type === 'explicit_branch_relation' && entry.state === 'matched'))!;
  const relationEntry = relation.entries.find(entry => entry.type === 'explicit_branch_relation')!;
  assert.ok(relationEntry.relationEvidence.length > 0);
  assert.ok(relationEntry.relationEvidence.every(item => item.sourceEvidenceId && item.decisionId));
  assert.ok(relationEntry.relationEvidence.every(item =>
    ['conditions_met', 'conditions_missing', 'relations_coexist', 'deferred_adjudication'].includes(item.conditionState)));

  const crossLuckYear = result.years.find(year => year.segments.length === 2)!;
  assert.ok(crossLuckYear, '测试范围内应存在跨运双片段');
  assert.ok(crossLuckYear.segments[0].candidates.every(candidate =>
    candidate.hiddenOccurrence.layer !== 'luck_cycle'
    && candidate.entries.every(entry => !entry.sourceNodeIds.some(nodeId => nodeId.startsWith('luck-'))),
  ));
  assert.ok(crossLuckYear.segments[1].candidates.some(candidate =>
    candidate.hiddenOccurrence.layer === 'luck_cycle'
    || candidate.entries.some(entry => entry.sourceNodeIds.some(nodeId => nodeId.startsWith('luck-'))),
  ));

  const unknown = createResult({ unknownTime: true }).hiddenStemActivation;
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.years.every(year => year.segments.every(segment =>
    segment.candidates.every(candidate => candidate.hiddenOccurrence.pillarKey !== 'time'),
  )));

  const invalid = structuredClone(BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY) as BaziHiddenStemActivationMethodology;
  invalid.policy.relationPolicy = 'infer_relation_without_evidence' as never;
  assert.ok(validateBaziHiddenStemActivationMethodology(invalid).some(item => item.includes('关系证据')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const activationRoute = await import('../app/api/bazi/charts/[id]/hidden-stem-activations/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-11 藏干触达测试', birthDate: '1990-01-01', birthTime: '12:00',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await activationRoute.POST(new Request('http://local/hidden-stem-activations', { method: 'POST' }), {
      params: Promise.resolve({ id: chartId }),
    });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ hiddenStemActivation: { id: string; hiddenStemActivationFingerprint: string; result: typeof result } }>(firstResponse)).hiddenStemActivation;
    assert.equal(first.hiddenStemActivationFingerprint.length, 64);
    const second = (await json<{ hiddenStemActivation: { id: string } }>(await activationRoute.POST(
      new Request('http://local/hidden-stem-activations', { method: 'POST' }),
      { params: Promise.resolve({ id: chartId }) },
    ))).hiddenStemActivation;
    assert.equal(second.id, first.id, '相同上游版本与方法版本应复用藏干触达版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; hiddenStemActivationVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.equal(conversation.hiddenStemActivationVersionId, first.id);
    assert.equal(conversation.promptVersion, 'bazi-chat-month-day-timeline-v13');
    const question = appendBaziMessage({ conversationId: conversation.id, role: 'user', content: '请解释2026年藏干被哪些条件触达' });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.hiddenStemActivationVersionId, first.id);
    assert.ok(built.messages.some(message => message.content.includes('权威八字岁运藏干引动条件证据快照')));
    assert.ok(built.messages.some(message => message.content.includes('完全同干岁运表层触达')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('hidden_stem_touch_condition_audit'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('hidden_stem_activation_verdict'));
    assert.ok(findBaziOutputViolations('同支重复触达，所以藏干已经发动并产生作用').includes('越权裁决藏干发动结果'));
    assert.deepEqual(findBaziOutputViolations('同支重复触达只是一项入口条件，不代表藏干已经发动'), []);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 33').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_hidden_stem_activation_versions').get() as { count: number }).count, 1);

    console.log('M9-11 藏干引动条件测试通过：同干岁运表层、同支重复、冲合刑害回指、多入口并见、跨运分段、v33 持久化与上下文边界均正常。');
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
