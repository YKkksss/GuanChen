import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateBazi } from '../lib/bazi/engine';
import { analyzeBaziInterpretation } from '../lib/bazi/interpretation-engine';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { calculateBaziAnnualTimeline } from '../lib/bazi/annual-timeline-engine';
import { calculateBaziMonthDayTimeline } from '../lib/bazi/month-day-timeline-engine';
import { auditBaziMonthDayRelations } from '../lib/bazi/month-day-relation-engine';
import { auditBaziMonthDayVisibilityConditions } from '../lib/bazi/month-day-visibility-engine';
import { auditBaziMonthDayStrengthComposite } from '../lib/bazi/month-day-strength-engine';
import { BAZI_MONTH_DAY_STRENGTH_METHODOLOGY } from '../lib/bazi/month-day-strength-methodology';
import {
  assertValidBaziMonthDayStrengthMethodology,
  validateBaziMonthDayStrengthMethodology,
} from '../lib/bazi/month-day-strength-validator';
import type {
  BaziMonthDayStrengthMethodology,
  BaziMonthDayStrengthResult,
} from '../lib/bazi/month-day-strength-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-month-day-strength-test-'));
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
  const annual = calculateBaziAnnualTimeline(chart, calculateBaziLuckCycles(chart));
  const timeline = calculateBaziMonthDayTimeline(chart, annual, 2030);
  const relation = auditBaziMonthDayRelations(chart, timeline, '2030-12-12');
  const visibility = auditBaziMonthDayVisibilityConditions(chart, relation);
  return {
    chart,
    result: auditBaziMonthDayStrengthComposite(chart, interpretation, relation, visibility),
  };
}

function directionFromSurfaceEvidence(
  evidence: BaziMonthDayStrengthResult['segments'][number]['evidence'],
) {
  const support = evidence.some(item => item.side === 'support');
  const drain = evidence.some(item => item.side === 'drain_or_control');
  if (support && drain) return 'both_sides';
  if (support) return 'support_only';
  if (drain) return 'drain_only';
  return 'none';
}

async function main() {
  assert.deepEqual(validateBaziMonthDayStrengthMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziMonthDayStrengthMethodology());

  const complete = buildResult();
  const result = complete.result;
  assert.equal(result.status, 'complete');
  assert.equal(result.target.dayGanZhi, '辛巳');
  assert.equal(result.target.segmentCount, 2, 'M9-17 必须保持交运日前后两个精确片段');
  assert.deepEqual(result.segments.map(segment => [segment.startAt, segment.endAtExclusive]), [
    ['2030-12-12 00:00:00', '2030-12-12 06:51:00'],
    ['2030-12-12 06:51:00', '2030-12-13 00:00:00'],
  ]);
  assert.equal(result.staticBaseline.label, analyzeBaziInterpretation(complete.chart).strength.label);
  for (const segment of result.segments) {
    const inherited = segment.evidence.filter(item => item.family === 'inherited_dynamic_surface');
    const focus = segment.evidence.filter(item => item.family === 'month_day_surface');
    const directionEvidence = [...inherited, ...focus];
    const context = segment.evidence.filter(item => item.side === 'context');
    assert.equal(focus.length, 2, '每个精确片段应分别保留流月和流日两个表层角色');
    assert.ok(focus.every(item => item.sourceStage === 'M9-15'));
    assert.ok(focus.every(item => item.sourceIds.every(id => id.startsWith('month-') || id.startsWith('day-'))));
    assert.ok(inherited.every(item => item.sourceIds.every(id => id.startsWith('annual-') || id.startsWith('luck-'))));
    assert.equal(segment.inheritedSurfaceDirection, directionFromSurfaceEvidence(inherited));
    assert.equal(segment.focusSurfaceDirection, directionFromSurfaceEvidence(focus));
    assert.equal(segment.combinedSurfaceDirection, directionFromSurfaceEvidence(directionEvidence));
    assert.ok(context.every(item => item.side === 'context'), '条件证据必须固定留在上下文列');
    assert.ok(context
      .filter(item => item.family !== 'static_baseline')
      .every(item => item.sourceStage === 'M9-16'));
    assert.ok(segment.evidence
      .filter(item => item.family === 'day_master_root_condition')
      .every(item => item.side === 'context' && item.roleSide === 'support'));
  }
  assert.equal(result.segments[0].counts.inheritedSurfaceEvidence, 1, '交运前只能读取流年表层');
  assert.equal(result.segments[1].counts.inheritedSurfaceEvidence, 2, '交运后才可读取大运与流年表层');
  assert.ok(result.segments.some(segment => segment.counts.conditionOnlyEvidence > 0));
  assert.equal(result.capabilities.finalStrengthVerdict, false);
  assert.equal(result.capabilities.strengthScore, false);
  assert.equal(result.capabilities.usefulGodVerdict, false);
  assert.equal(result.capabilities.eventPrediction, false);

  const unknown = buildResult({ unknownTime: true }).result;
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.segments.every(segment => segment.focusComparison === 'partial_unknown_time'));
  assert.ok(unknown.reviewFlags.includes('unknown_time'));

  const unsupported = buildResult({ timeZoneId: 'America/New_York' }).result;
  assert.equal(unsupported.status, 'sequence_only_unavailable');
  assert.equal(unsupported.segments.length, 0);
  assert.equal(unsupported.capabilities.fiveLayerDirectionComparison, false);

  const invalid = structuredClone(BAZI_MONTH_DAY_STRENGTH_METHODOLOGY) as BaziMonthDayStrengthMethodology;
  invalid.policy.hiddenPolicy = 'hidden_stem_changes_strength' as never;
  assert.ok(validateBaziMonthDayStrengthMethodology(invalid).some(item => item.includes('藏干')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const strengthRoute = await import('../app/api/bazi/charts/[id]/month-day-strength/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-17 流月流日旺衰矩阵测试', birthDate: '2022-03-09', birthTime: '20:51',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await strengthRoute.POST(new Request('http://local/month-day-strength', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDate: '2030-12-12', targetYear: 2030 }),
    }), { params: Promise.resolve({ id: chartId }) });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ monthDayStrength: {
      id: string; targetDate: string; analysisVersionId: string;
      monthDayRelationVersionId: string; monthDayVisibilityVersionId: string;
      monthDayStrengthFingerprint: string; result: typeof result;
    } }>(firstResponse)).monthDayStrength;
    assert.equal(first.targetDate, '2030-12-12');
    assert.equal(first.result.segments.length, 2);
    assert.equal(first.monthDayStrengthFingerprint.length, 64);
    assert.ok(first.analysisVersionId && first.monthDayRelationVersionId && first.monthDayVisibilityVersionId);
    const second = (await json<{ monthDayStrength: { id: string } }>(await strengthRoute.POST(
      new Request('http://local/month-day-strength', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate: '2030-12-12', targetYear: 2030 }),
      }),
      { params: Promise.resolve({ id: chartId }) },
    ))).monthDayStrength;
    assert.equal(second.id, first.id, '相同四类上游版本、日期和方法版本必须复用 M9-17 结果');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: {
      id: string; monthDayStrengthVersionId: string; promptVersion: string;
    } }>(conversationResponse)).conversation;
    assert.ok(conversation.monthDayStrengthVersionId);
    assert.equal(conversation.promptVersion, 'bazi-chat-month-day-pattern-v17');
    const question = appendBaziMessage({
      conversationId: conversation.id,
      role: 'user',
      content: '请比较2030年12月12日的岁运既有、流月流日新增和五层表层方向，只讲证据',
    });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.monthDayStrengthVersionId, first.id);
    assert.equal(built.manifest.monthDayStrengthTargetDate, '2030-12-12');
    assert.ok(built.messages.some(message => message.content.includes('权威八字流月流日旺衰综合证据矩阵')));
    assert.ok(built.messages.some(message => message.content.includes('条件上下文（不参与方向计算）')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('month_day_strength_composite_audit'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('month_day_final_strength_verdict'));
    assert.ok(findBaziOutputViolations('流月流日方向同向，所以日主变强').includes('越权裁决流月流日旺衰方向结果'));
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 39').get());
    assert.ok((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_month_day_strength_versions').get() as { count: number }).count >= 2);

    console.log('M9-17 流月流日旺衰综合证据矩阵测试通过：三层方向分离、条件隔离、精确分段、v39 缓存与上下文路由均正常。');
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
