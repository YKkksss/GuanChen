import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateBazi } from '../lib/bazi/engine';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { calculateBaziAnnualTimeline } from '../lib/bazi/annual-timeline-engine';
import { auditBaziRelations } from '../lib/bazi/relation-audit-engine';
import { adjudicateBaziRelations } from '../lib/bazi/relation-adjudication-engine';
import { auditBaziDynamicTenGods, resolveBaziTenGod } from '../lib/bazi/dynamic-ten-god-engine';
import { BAZI_DYNAMIC_TEN_GOD_METHODOLOGY } from '../lib/bazi/dynamic-ten-god-methodology';
import {
  assertValidBaziDynamicTenGodMethodology,
  validateBaziDynamicTenGodMethodology,
} from '../lib/bazi/dynamic-ten-god-validator';
import type { BaziDynamicTenGodMethodology } from '../lib/bazi/dynamic-ten-god-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-dynamic-ten-god-test-'));
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
  return {
    chart,
    dynamicTenGod: auditBaziDynamicTenGods(chart, relationAudit, relationAdjudication),
  };
}

async function main() {
  assert.deepEqual(validateBaziDynamicTenGodMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziDynamicTenGodMethodology());

  const tenGodsForBing = {
    丙: '比肩', 丁: '劫财', 戊: '食神', 己: '伤官', 庚: '偏财',
    辛: '正财', 壬: '七杀', 癸: '正官', 甲: '偏印', 乙: '正印',
  } as const;
  for (const [stem, expected] of Object.entries(tenGodsForBing)) {
    assert.equal(resolveBaziTenGod('丙', stem), expected, `丙日主见${stem}应为${expected}`);
  }

  const complete = createCompleteResult();
  assert.equal(complete.chart.dayMaster.stem, '丙');
  assert.equal(complete.dynamicTenGod.status, 'complete');
  assert.equal(complete.dynamicTenGod.capabilities.hiddenStemActivationVerdict, false);
  assert.equal(complete.dynamicTenGod.capabilities.strengthEffectVerdict, false);

  const year2026 = complete.dynamicTenGod.years.find(item => item.year === 2026)!;
  const annual2026 = year2026.segments[0].annual;
  assert.equal(annual2026.ganZhi, '丙午');
  assert.equal(annual2026.roles.find(item => item.sourceKind === 'surface_stem')?.tenGod, '比肩');
  assert.deepEqual(
    annual2026.roles.filter(item => item.sourceKind === 'branch_hidden_stem')
      .map(item => [item.hiddenQiLabel, item.stem, item.tenGod]),
    [['本气', '丁', '劫财'], ['中气', '己', '伤官']],
  );
  const clashDirection = annual2026.directions.find(item =>
    item.sourceDomain === 'branch' && item.targetPillarKey === 'month' && item.relationType === 'branch_clash',
  );
  assert.equal(clashDirection?.targetSymbol, '子');
  assert.equal(clashDirection?.conditionState, 'relations_coexist');
  assert.ok(annual2026.directions.some(item => item.targetPillarKey === 'time' && item.relationType === 'branch_self_punishment'));
  assert.ok(annual2026.roles.filter(item => item.sourceKind === 'branch_hidden_stem').every(item => item.boundary.includes('不代表')));

  const luck2026 = year2026.segments[0].luckCycle!;
  assert.equal(luck2026.ganZhi, '癸酉');
  assert.equal(luck2026.roles.find(item => item.sourceKind === 'surface_stem')?.tenGod, '正官');
  assert.deepEqual(
    luck2026.roles.filter(item => item.sourceKind === 'branch_hidden_stem').map(item => [item.stem, item.tenGod]),
    [['辛', '正财']],
  );

  const year2001 = complete.dynamicTenGod.years.find(item => item.year === 2001)!;
  assert.equal(year2001.annualGanZhi, '辛巳');
  assert.deepEqual(
    year2001.segments[0].annual.roles.map(item => [item.stem, item.tenGod]),
    [['辛', '正财'], ['丙', '比肩'], ['庚', '偏财'], ['戊', '食神']],
  );

  const year1998 = complete.dynamicTenGod.years.find(item => item.year === 1998)!;
  assert.equal(year1998.segments.length, 2, '跨运流年必须保留两个动态十神片段');
  assert.equal(year1998.segments[0].luckCycle, null);
  assert.ok(year1998.segments[1].luckCycle);

  const unknownChart = calculateBazi({ birthDate: '1990-01-01', gender: 'male', unknownTime: true });
  const unknownLuck = calculateBaziLuckCycles(unknownChart);
  const unknownAnnual = calculateBaziAnnualTimeline(unknownChart, unknownLuck);
  const unknownAudit = auditBaziRelations(unknownChart, unknownLuck, unknownAnnual);
  const unknownAdjudication = adjudicateBaziRelations(unknownChart, unknownAudit);
  const unknown = auditBaziDynamicTenGods(unknownChart, unknownAudit, unknownAdjudication);
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.years.every(year => year.segments.every(segment =>
    [segment.annual, ...(segment.luckCycle ? [segment.luckCycle] : [])]
      .every(layer => layer.directions.every(item => item.targetPillarKey !== 'time')),
  )));

  const invalid = structuredClone(BAZI_DYNAMIC_TEN_GOD_METHODOLOGY) as BaziDynamicTenGodMethodology;
  invalid.policy.hiddenStemPolicy = 'assume_activation' as never;
  assert.ok(validateBaziDynamicTenGodMethodology(invalid).some(item => item.includes('藏干')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const dynamicTenGodRoute = await import('../app/api/bazi/charts/[id]/dynamic-ten-gods/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-8 动态十神审计测试', birthDate: '1990-01-01', birthTime: '12:00',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await dynamicTenGodRoute.POST(new Request('http://local/dynamic-ten-gods', { method: 'POST' }), {
      params: Promise.resolve({ id: chartId }),
    });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ dynamicTenGod: { id: string; dynamicTenGodFingerprint: string; result: typeof complete.dynamicTenGod } }>(firstResponse)).dynamicTenGod;
    assert.equal(first.dynamicTenGodFingerprint.length, 64);
    assert.equal(first.result.years.find(item => item.year === 2026)?.segments[0].annual.roles[0].tenGod, '比肩');
    const second = (await json<{ dynamicTenGod: { id: string } }>(await dynamicTenGodRoute.POST(
      new Request('http://local/dynamic-ten-gods', { method: 'POST' }),
      { params: Promise.resolve({ id: chartId }) },
    ))).dynamicTenGod;
    assert.equal(second.id, first.id, '相同上游版本与方法版本应复用动态十神审计版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; dynamicTenGodVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.equal(conversation.dynamicTenGodVersionId, first.id);
    assert.equal(conversation.promptVersion, 'bazi-chat-hidden-stem-touch-v10');
    const question = appendBaziMessage({ conversationId: conversation.id, role: 'user', content: '请解释2026年的动态十神和原局指向' });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.dynamicTenGodVersionId, first.id);
    assert.ok(built.messages.some(message => message.content.includes('权威八字动态十神与作用方向证据快照')));
    assert.ok(built.messages.some(message => message.content.includes('表层天干 丙比肩')));
    assert.ok(built.messages.some(message => message.content.includes('原局月柱子')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('dynamic_ten_god_direction_audit'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('hidden_stem_activation_verdict'));
    assert.deepEqual(findBaziOutputViolations('正财就是发财'), ['越权十神事件映射']);
    assert.deepEqual(findBaziOutputViolations('午中气藏干已经引动'), ['越权宣告藏干引动']);
    assert.deepEqual(findBaziOutputViolations('正财不代表一定发财'), []);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 30').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_dynamic_ten_god_versions').get() as { count: number }).count, 1);

    console.log('M9-8 动态十神测试通过：十神全映射、藏干顺序、原局方向、跨运分段、v30 持久化与上下文边界均正常。');
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
