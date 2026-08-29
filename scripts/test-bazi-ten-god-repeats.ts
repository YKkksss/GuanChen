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
import { BAZI_TEN_GOD_REPEAT_METHODOLOGY } from '../lib/bazi/ten-god-repeat-methodology';
import {
  assertValidBaziTenGodRepeatMethodology,
  validateBaziTenGodRepeatMethodology,
} from '../lib/bazi/ten-god-repeat-validator';
import type { BaziTenGodRepeatMethodology } from '../lib/bazi/ten-god-repeat-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-ten-god-repeat-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

function createCompleteResult() {
  const chart = calculateBazi({ birthDate: '1990-01-01', birthTime: '12:00', gender: 'male' });
  const luckCycles = calculateBaziLuckCycles(chart);
  const annualTimeline = calculateBaziAnnualTimeline(chart, luckCycles);
  const relationAudit = auditBaziRelations(chart, luckCycles, annualTimeline);
  const relationAdjudication = adjudicateBaziRelations(chart, relationAudit);
  const dynamicTenGod = auditBaziDynamicTenGods(chart, relationAudit, relationAdjudication);
  return {
    chart,
    tenGodRepeat: auditBaziTenGodRepeats(chart, dynamicTenGod, relationAudit),
  };
}

async function main() {
  assert.deepEqual(validateBaziTenGodRepeatMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziTenGodRepeatMethodology());

  const complete = createCompleteResult();
  assert.equal(complete.tenGodRepeat.status, 'complete');
  assert.equal(complete.tenGodRepeat.capabilities.transparencyVerdict, false);
  assert.equal(complete.tenGodRepeat.capabilities.rootVerdict, false);
  assert.equal(complete.tenGodRepeat.capabilities.strengthEffectVerdict, false);

  const year2026 = complete.tenGodRepeat.years.find(item => item.year === 2026)!;
  const segment2026 = year2026.segments[0];
  const bing = segment2026.stemClusters.find(item => item.stem === '丙')!;
  assert.equal(bing.dynamicTenGod, '比肩');
  assert.ok(bing.patterns.includes('surface_cross_layer_repeat'));
  assert.ok(bing.patterns.includes('surface_hidden_coexistence'));
  assert.equal(bing.counts.reference, 1);
  assert.ok(bing.occurrences.some(item => item.sourceKind === 'day_master_reference' && item.tenGod === null));
  assert.ok(bing.occurrences.some(item => item.layer === 'annual' && item.visibility === 'surface'));
  assert.equal(bing.connections.length, 2);
  assert.ok(bing.connections.every(connection => connection.occurrenceIds.every(id => !id.includes('-hidden-'))));

  const peer = segment2026.tenGodClusters.find(item => item.tenGod === '比肩')!;
  assert.equal(peer.counts.total, bing.counts.total - 1, '同十神簇必须排除日主参照位置');
  assert.ok(peer.occurrences.every(item => item.sourceKind !== 'day_master_reference'));
  const ding = segment2026.stemClusters.find(item => item.stem === '丁')!;
  assert.deepEqual(ding.patterns, ['hidden_cross_layer_repeat']);
  assert.equal(ding.connections.length, 0, '纯藏干重复不得伪造 M9-6 表层连接');
  const gui = segment2026.stemClusters.find(item => item.stem === '癸')!;
  assert.ok(gui.patterns.includes('surface_hidden_coexistence'));
  assert.equal(gui.connections.length, 0, '表层与藏干同见不得自动宣告连接');

  const year1998 = complete.tenGodRepeat.years.find(item => item.year === 1998)!;
  assert.equal(year1998.segments.length, 2, '跨运流年必须保留两个独立重复审计片段');
  assert.ok(year1998.segments[0].stemClusters.every(cluster => cluster.occurrences.every(item => item.layer !== 'luck_cycle')));
  assert.ok(year1998.segments[1].stemClusters.some(cluster => cluster.patterns.includes('annual_luck_repeat')));

  const unknownChart = calculateBazi({ birthDate: '1990-01-01', gender: 'male', unknownTime: true });
  const unknownLuck = calculateBaziLuckCycles(unknownChart);
  const unknownAnnual = calculateBaziAnnualTimeline(unknownChart, unknownLuck);
  const unknownAudit = auditBaziRelations(unknownChart, unknownLuck, unknownAnnual);
  const unknownAdjudication = adjudicateBaziRelations(unknownChart, unknownAudit);
  const unknownDynamic = auditBaziDynamicTenGods(unknownChart, unknownAudit, unknownAdjudication);
  const unknown = auditBaziTenGodRepeats(unknownChart, unknownDynamic, unknownAudit);
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.years.every(year => year.segments.every(segment =>
    [...segment.stemClusters, ...segment.tenGodClusters].every(cluster =>
      cluster.occurrences.every(item => item.pillarKey !== 'time'),
    ),
  )));

  const invalid = structuredClone(BAZI_TEN_GOD_REPEAT_METHODOLOGY) as BaziTenGodRepeatMethodology;
  invalid.policy.visibilityPolicy = 'assume_transparency' as never;
  assert.ok(validateBaziTenGodRepeatMethodology(invalid).some(item => item.includes('透干')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const repeatRoute = await import('../app/api/bazi/charts/[id]/ten-god-repeats/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-9 显隐重复审计测试', birthDate: '1990-01-01', birthTime: '12:00',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await repeatRoute.POST(new Request('http://local/ten-god-repeats', { method: 'POST' }), {
      params: Promise.resolve({ id: chartId }),
    });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ tenGodRepeat: { id: string; tenGodRepeatFingerprint: string; result: typeof complete.tenGodRepeat } }>(firstResponse)).tenGodRepeat;
    assert.equal(first.tenGodRepeatFingerprint.length, 64);
    assert.ok(first.result.years.find(item => item.year === 2026)?.segments[0].stemClusters.some(item => item.stem === '丙'));
    const second = (await json<{ tenGodRepeat: { id: string } }>(await repeatRoute.POST(
      new Request('http://local/ten-god-repeats', { method: 'POST' }),
      { params: Promise.resolve({ id: chartId }) },
    ))).tenGodRepeat;
    assert.equal(second.id, first.id, '相同上游版本与方法版本应复用显隐重复审计版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; tenGodRepeatVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.equal(conversation.tenGodRepeatVersionId, first.id);
    assert.equal(conversation.promptVersion, 'bazi-chat-hidden-stem-touch-v10');
    const question = appendBaziMessage({ conversationId: conversation.id, role: 'user', content: '请解释2026年的同干和同十神重复位置' });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.tenGodRepeatVersionId, first.id);
    assert.ok(built.messages.some(message => message.content.includes('权威八字岁运十神组合与显隐重复证据快照')));
    assert.ok(built.messages.some(message => message.content.includes('原局日柱丙（日主参照）')));
    assert.ok(built.messages.some(message => message.content.includes('表层与藏干同见')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('ten_god_visibility_repeat_audit'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('transparency_root_effect_verdict'));
    assert.deepEqual(findBaziOutputViolations('同干重复，所以力量增强'), ['越权把重复折算力量']);
    assert.deepEqual(findBaziOutputViolations('显隐同见说明已经通根'), ['越权宣告透干通根']);
    assert.deepEqual(findBaziOutputViolations('显隐同见不代表通根，重复也不等于力量增强'), []);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 31').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_ten_god_repeat_versions').get() as { count: number }).count, 1);

    console.log('M9-9 显隐重复测试通过：同干／同十神簇、日主参照、显隐分层、证据连接、跨运分段、v31 持久化与上下文边界均正常。');
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
