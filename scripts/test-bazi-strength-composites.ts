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
import { BAZI_STRENGTH_COMPOSITE_METHODOLOGY } from '../lib/bazi/strength-composite-methodology';
import {
  assertValidBaziStrengthCompositeMethodology,
  validateBaziStrengthCompositeMethodology,
} from '../lib/bazi/strength-composite-validator';
import type { BaziStrengthCompositeMethodology } from '../lib/bazi/strength-composite-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-strength-composite-test-'));
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
  return { chart, interpretation, strengthComposite };
}

async function main() {
  assert.deepEqual(validateBaziStrengthCompositeMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziStrengthCompositeMethodology());

  const complete = createResult();
  const result = complete.strengthComposite;
  assert.equal(result.status, 'complete');
  assert.equal(result.staticBaseline.assessment, complete.interpretation.strength.assessment, 'M9-3 静态标签必须原样保留');
  assert.equal(result.capabilities.staticDynamicEvidenceMatrix, true);
  assert.equal(result.capabilities.finalStrengthVerdict, false);
  assert.equal(result.capabilities.strengthScore, false);

  const segments = result.years.flatMap(year => year.segments);
  assert.ok(segments.length > 0);
  assert.ok(segments.every(segment => segment.evidence.some(item => item.sourceStage === 'M9-3')));
  assert.ok(segments.every(segment => segment.evidence.some(item => item.family === 'dynamic_surface' && item.sourceStage === 'M9-8')));
  assert.ok(segments.some(segment => segment.evidence.some(item => item.family === 'day_master_root_condition' && item.sourceStage === 'M9-10')));
  assert.ok(segments.some(segment => segment.evidence.some(item => item.family === 'month_command_touch' && item.sourceStage === 'M9-11')));
  assert.ok(segments.every(segment => segment.evidence
    .filter(item => item.family === 'dynamic_hidden_position')
    .every(item => item.side === 'context' && ['position_only', 'condition_only'].includes(item.status))));
  assert.ok(segments.some(segment => segment.monthCommand.touchStatus !== 'no_open_touch_condition'));
  assert.ok(segments.some(segment => segment.reviewFlags.includes('dynamic_hidden_position_only')));
  assert.ok(segments.some(segment => segment.dynamicSurfaceDirection === 'both_sides'));
  assert.ok(segments.every(segment => !('score' in segment) && !('finalStrength' in segment)));

  const crossLuckYear = result.years.find(year => year.segments.length === 2)!;
  assert.ok(crossLuckYear, '测试范围内应存在跨运双片段');
  assert.ok(crossLuckYear.segments[0].evidence
    .filter(item => item.family === 'dynamic_surface' || item.family === 'dynamic_hidden_position')
    .every(item => !item.label.includes('大运')));
  assert.ok(crossLuckYear.segments[1].evidence.some(item =>
    (item.family === 'dynamic_surface' || item.family === 'dynamic_hidden_position') && item.label.includes('大运')));

  const unknown = createResult({ unknownTime: true }).strengthComposite;
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.years.every(year => year.segments.every(segment =>
    segment.comparison === 'partial_unknown_time' && segment.reviewFlags.includes('unknown_time'))));

  const invalid = structuredClone(BAZI_STRENGTH_COMPOSITE_METHODOLOGY) as BaziStrengthCompositeMethodology;
  invalid.policy.scoringPolicy = 'weighted_strength_score' as never;
  assert.ok(validateBaziStrengthCompositeMethodology(invalid).some(item => item.includes('旺衰分数')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const compositeRoute = await import('../app/api/bazi/charts/[id]/strength-composites/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-12 旺衰综合测试', birthDate: '1990-01-01', birthTime: '12:00',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await compositeRoute.POST(new Request('http://local/strength-composites', { method: 'POST' }), {
      params: Promise.resolve({ id: chartId }),
    });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ strengthComposite: { id: string; strengthCompositeFingerprint: string; result: typeof result } }>(firstResponse)).strengthComposite;
    assert.equal(first.strengthCompositeFingerprint.length, 64);
    const second = (await json<{ strengthComposite: { id: string } }>(await compositeRoute.POST(
      new Request('http://local/strength-composites', { method: 'POST' }),
      { params: Promise.resolve({ id: chartId }) },
    ))).strengthComposite;
    assert.equal(second.id, first.id, '相同上游版本与方法版本应复用旺衰综合版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; strengthCompositeVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.equal(conversation.strengthCompositeVersionId, first.id);
    assert.equal(conversation.promptVersion, 'bazi-chat-month-day-strength-v16');
    const question = appendBaziMessage({ conversationId: conversation.id, role: 'user', content: '请解释2026年月令和旺衰综合证据矩阵' });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.strengthCompositeVersionId, first.id);
    assert.ok(built.messages.some(message => message.content.includes('权威八字月令与旺衰综合条件证据快照')));
    assert.ok(built.messages.some(message => message.content.includes('岁运表层方向')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('strength_composite_matrix_audit'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('numeric_strength_score'));
    assert.ok(findBaziOutputViolations('静态与动态方向同向，所以日主变强').includes('越权把综合方向改写为旺衰变化'));
    assert.ok(findBaziOutputViolations('旺衰评分是85%').includes('越权生成旺衰数值'));
    assert.deepEqual(findBaziOutputViolations('静态与动态方向同向，但不代表日主变强'), []);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 34').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_strength_composite_versions').get() as { count: number }).count, 1);

    console.log('M9-12 月令旺衰综合测试通过：静态基线、岁运表层方向、月令触达、根气条件、跨运分段、v34 持久化与上下文边界均正常。');
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
