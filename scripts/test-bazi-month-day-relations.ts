import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateBazi } from '../lib/bazi/engine';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { calculateBaziAnnualTimeline } from '../lib/bazi/annual-timeline-engine';
import { calculateBaziMonthDayTimeline } from '../lib/bazi/month-day-timeline-engine';
import { auditBaziMonthDayRelations } from '../lib/bazi/month-day-relation-engine';
import { BAZI_MONTH_DAY_RELATION_METHODOLOGY } from '../lib/bazi/month-day-relation-methodology';
import {
  assertValidBaziMonthDayRelationMethodology,
  validateBaziMonthDayRelationMethodology,
} from '../lib/bazi/month-day-relation-validator';
import type { BaziMonthDayRelationMethodology } from '../lib/bazi/month-day-relation-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-month-day-relation-test-'));
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
  const annual = calculateBaziAnnualTimeline(chart, calculateBaziLuckCycles(chart));
  const timeline = calculateBaziMonthDayTimeline(chart, annual, 2030);
  return { chart, timeline, result: auditBaziMonthDayRelations(chart, timeline, '2030-12-12') };
}

async function main() {
  assert.deepEqual(validateBaziMonthDayRelationMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziMonthDayRelationMethodology());

  const complete = buildResult();
  const result = complete.result;
  assert.equal(result.status, 'complete');
  assert.equal(result.target.dayGanZhi, '辛巳');
  assert.equal(result.target.segmentCount, 2, '交运日必须保留交运前后两个精确片段');
  assert.deepEqual(result.segments.map(segment => [segment.startAt, segment.endAtExclusive]), [
    ['2030-12-12 00:00:00', '2030-12-12 06:51:00'],
    ['2030-12-12 06:51:00', '2030-12-13 00:00:00'],
  ]);
  assert.deepEqual(result.segments[0].layers.map(layer => layer.layer), ['annual', 'month', 'day']);
  assert.deepEqual(result.segments[1].layers.map(layer => layer.layer), ['luck_cycle', 'annual', 'month', 'day']);
  assert.ok(result.segments.every(segment => segment.evidence.every(evidence =>
    evidence.participants.some(participant => participant.layer === 'month' || participant.layer === 'day'),
  )));
  assert.ok(result.segments[1].evidence.some(item => item.scope === 'day_to_luck'));
  assert.ok(result.segments[0].evidence.some(item => item.scope === 'month_to_natal'));
  assert.ok(result.segments[0].decisions.some(item => item.state === 'conditions_missing' && item.missingSymbols.length === 1));
  assert.ok(result.segments[0].decisions.some(item => item.state === 'deferred_adjudication' && item.type === 'stem_five_combine'));
  const dayLayer = result.segments[0].layers.find(layer => layer.layer === 'day')!;
  assert.equal(dayLayer.roles.find(role => role.sourceKind === 'surface_stem')?.tenGod, '比肩');
  assert.ok(dayLayer.roles.some(role => role.sourceKind === 'branch_hidden_stem'));
  assert.equal(result.capabilities.strengthEffectVerdict, false);
  assert.equal(result.capabilities.eventPrediction, false);

  const unknown = buildResult({ unknownTime: true }).result;
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.segments.every(segment => segment.evidence.every(evidence =>
    evidence.participants.every(participant => participant.pillarKey !== 'time'),
  )));

  const unsupported = buildResult({ timeZoneId: 'America/New_York' }).result;
  assert.equal(unsupported.status, 'sequence_only_unavailable');
  assert.equal(unsupported.segments.length, 0);
  assert.equal(unsupported.capabilities.fiveLayerRelationEvidence, false);

  const invalid = structuredClone(BAZI_MONTH_DAY_RELATION_METHODOLOGY) as BaziMonthDayRelationMethodology;
  invalid.policy.evidencePolicy = 'new_unverified_rules' as never;
  assert.ok(validateBaziMonthDayRelationMethodology(invalid).some(item => item.includes('M9-6')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const relationRoute = await import('../app/api/bazi/charts/[id]/month-day-relations/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-15 五层动态关系测试', birthDate: '2022-03-09', birthTime: '20:51',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await relationRoute.POST(new Request('http://local/month-day-relations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDate: '2030-12-12', targetYear: 2030 }),
    }), { params: Promise.resolve({ id: chartId }) });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ monthDayRelation: {
      id: string; targetDate: string; monthDayRelationFingerprint: string; result: typeof result;
    } }>(firstResponse)).monthDayRelation;
    assert.equal(first.targetDate, '2030-12-12');
    assert.equal(first.result.segments.length, 2);
    assert.equal(first.monthDayRelationFingerprint.length, 64);
    const second = (await json<{ monthDayRelation: { id: string } }>(await relationRoute.POST(
      new Request('http://local/month-day-relations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate: '2030-12-12', targetYear: 2030 }),
      }),
      { params: Promise.resolve({ id: chartId }) },
    ))).monthDayRelation;
    assert.equal(second.id, first.id, '相同命盘、流年时间轴、日期和方法版本应复用五层关系版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: {
      id: string; monthDayRelationVersionId: string; promptVersion: string;
    } }>(conversationResponse)).conversation;
    assert.ok(conversation.monthDayRelationVersionId);
    assert.equal(conversation.promptVersion, 'bazi-chat-month-day-relation-v14');
    const question = appendBaziMessage({
      conversationId: conversation.id,
      role: 'user',
      content: '请解释2030年12月12日的五层关系和十神角色，只讲证据',
    });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.monthDayRelationVersionId, first.id);
    assert.equal(built.manifest.monthDayRelationTargetDate, '2030-12-12');
    assert.ok(built.messages.some(message => message.content.includes('权威八字流月流日五层动态关系证据快照')));
    assert.ok(built.messages.some(message => message.content.includes('2030-12-12 06:51:00')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('month_day_relation_evidence_audit'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('month_day_relation_effect_verdict'));
    assert.deepEqual(findBaziOutputViolations('流日冲原局，所以代表一定发生凶事'), ['越权裁决流月流日关系作用']);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 37').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_month_day_relation_versions').get() as { count: number }).count, 2);

    console.log('M9-15 流月流日动态关系测试通过：五层节点、跨运分段、关系复用、条件状态、十神角色、v37 按日缓存与上下文路由均正常。');
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
