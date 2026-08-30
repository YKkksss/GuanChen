import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateBazi } from '../lib/bazi/engine';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { calculateBaziAnnualTimeline } from '../lib/bazi/annual-timeline-engine';
import { calculateBaziMonthDayTimeline } from '../lib/bazi/month-day-timeline-engine';
import { auditBaziMonthDayRelations } from '../lib/bazi/month-day-relation-engine';
import { auditBaziMonthDayVisibilityConditions } from '../lib/bazi/month-day-visibility-engine';
import { BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY } from '../lib/bazi/month-day-visibility-methodology';
import {
  assertValidBaziMonthDayVisibilityMethodology,
  validateBaziMonthDayVisibilityMethodology,
} from '../lib/bazi/month-day-visibility-validator';
import type { BaziMonthDayVisibilityMethodology } from '../lib/bazi/month-day-visibility-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-month-day-visibility-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

function isMonthDayLayer(layer: string) {
  return layer === 'month' || layer === 'day';
}

function hasMonthDayNodeId(value: string) {
  return value.startsWith('month-') || value.startsWith('day-');
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
  const relation = auditBaziMonthDayRelations(chart, timeline, '2030-12-12');
  return { chart, result: auditBaziMonthDayVisibilityConditions(chart, relation) };
}

async function main() {
  assert.deepEqual(validateBaziMonthDayVisibilityMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziMonthDayVisibilityMethodology());

  const complete = buildResult();
  const result = complete.result;
  assert.equal(result.status, 'complete');
  assert.equal(result.target.dayGanZhi, '辛巳');
  assert.equal(result.target.segmentCount, 2, 'M9-16 必须继承交运日前后两个精确片段');
  assert.deepEqual(result.segments.map(segment => [segment.startAt, segment.endAtExclusive]), [
    ['2030-12-12 00:00:00', '2030-12-12 06:51:00'],
    ['2030-12-12 06:51:00', '2030-12-13 00:00:00'],
  ]);
  assert.ok(result.counts.stemClusters > 0);
  assert.ok(result.counts.transparencyMatched > 0);
  assert.ok(result.counts.exactSameStemRoots > 0);
  assert.ok(result.counts.touchedHiddenStems > 0);
  for (const segment of result.segments) {
    assert.ok(segment.repeatAudit.stemClusters.every(cluster =>
      cluster.occurrences.some(occurrence => isMonthDayLayer(occurrence.layer)),
    ));
    assert.ok(segment.repeatAudit.tenGodClusters.every(cluster =>
      cluster.occurrences.some(occurrence => isMonthDayLayer(occurrence.layer)),
    ));
    assert.ok(segment.transparencyRootAudit.transparencyCandidates.every(candidate =>
      isMonthDayLayer(candidate.hiddenOccurrence.layer)
      || candidate.surfaceMatches.some(match => isMonthDayLayer(match.layer)),
    ));
    assert.ok(segment.transparencyRootAudit.rootCandidates.every(candidate =>
      isMonthDayLayer(candidate.surfaceOccurrence.layer)
      || candidate.exactRootMatches.some(match => isMonthDayLayer(match.layer))
      || candidate.sameElementSupportMatches.some(match => isMonthDayLayer(match.layer)),
    ));
    assert.ok(segment.hiddenStemTouchAudit.candidates.every(candidate =>
      isMonthDayLayer(candidate.hiddenOccurrence.layer)
      || candidate.entries.some(entry =>
        entry.sourceNodeIds.some(hasMonthDayNodeId)
        || entry.evidenceOccurrenceIds.some(hasMonthDayNodeId)
        || entry.relationEvidence.some(evidence => evidence.participantNodeIds.some(hasMonthDayNodeId)),
      ),
    ));
  }
  const firstGui = result.segments[0].repeatAudit.stemClusters.find(cluster => cluster.stem === '癸')!;
  const secondGui = result.segments[1].repeatAudit.stemClusters.find(cluster => cluster.stem === '癸')!;
  assert.ok(!firstGui.layers.includes('luck_cycle'));
  assert.ok(secondGui.layers.includes('luck_cycle'), '交运后的同干簇才可以包含新大运位置');
  assert.equal(result.capabilities.rootStrengthVerdict, false);
  assert.equal(result.capabilities.hiddenStemActivationVerdict, false);
  assert.equal(result.capabilities.eventPrediction, false);

  const unknown = buildResult({ unknownTime: true }).result;
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.segments.every(segment =>
    segment.repeatAudit.stemClusters.every(cluster =>
      cluster.occurrences.every(occurrence => occurrence.pillarKey !== 'time'),
    ),
  ));

  const unsupported = buildResult({ timeZoneId: 'America/New_York' }).result;
  assert.equal(unsupported.status, 'sequence_only_unavailable');
  assert.equal(unsupported.segments.length, 0);
  assert.equal(unsupported.capabilities.monthDayRepeatAudit, false);

  const invalid = structuredClone(BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY) as BaziMonthDayVisibilityMethodology;
  invalid.policy.focusPolicy = 'all_layers_without_focus' as never;
  assert.ok(validateBaziMonthDayVisibilityMethodology(invalid).some(item => item.includes('流月或流日')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const visibilityRoute = await import('../app/api/bazi/charts/[id]/month-day-visibility/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-16 流月流日显隐条件测试', birthDate: '2022-03-09', birthTime: '20:51',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await visibilityRoute.POST(new Request('http://local/month-day-visibility', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDate: '2030-12-12', targetYear: 2030 }),
    }), { params: Promise.resolve({ id: chartId }) });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ monthDayVisibility: {
      id: string; targetDate: string; monthDayRelationVersionId: string;
      monthDayVisibilityFingerprint: string; result: typeof result;
    } }>(firstResponse)).monthDayVisibility;
    assert.equal(first.targetDate, '2030-12-12');
    assert.equal(first.result.segments.length, 2);
    assert.equal(first.monthDayVisibilityFingerprint.length, 64);
    const second = (await json<{ monthDayVisibility: { id: string } }>(await visibilityRoute.POST(
      new Request('http://local/month-day-visibility', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate: '2030-12-12', targetYear: 2030 }),
      }),
      { params: Promise.resolve({ id: chartId }) },
    ))).monthDayVisibility;
    assert.equal(second.id, first.id, '相同命盘、五层关系版本、日期和方法版本必须复用 M9-16 结果');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: {
      id: string; monthDayVisibilityVersionId: string; promptVersion: string;
    } }>(conversationResponse)).conversation;
    assert.ok(conversation.monthDayVisibilityVersionId);
    assert.equal(conversation.promptVersion, 'bazi-chat-month-day-visibility-v15');
    const question = appendBaziMessage({
      conversationId: conversation.id,
      role: 'user',
      content: '请解释2030年12月12日流月流日参与的显隐重复、透根和藏干触达，只讲条件证据',
    });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.monthDayVisibilityVersionId, first.id);
    assert.equal(built.manifest.monthDayVisibilityTargetDate, '2030-12-12');
    assert.ok(built.messages.some(message => message.content.includes('权威八字流月流日显隐、透根与藏干触达条件快照')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('month_day_visibility_root_touch_audit'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('month_day_visibility_effect_verdict'));
    assert.deepEqual(
      findBaziOutputViolations('流日通根，所以说明已经是强根而且变强'),
      ['越权裁决流月流日显隐作用', '越权裁决根气强弱'],
    );
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 38').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_month_day_visibility_versions').get() as { count: number }).count, 2);

    console.log('M9-16 流月流日显隐条件测试通过：按片段重复簇、透根分离、三类触达、流月流日过滤、v38 按日缓存与上下文路由均正常。');
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
