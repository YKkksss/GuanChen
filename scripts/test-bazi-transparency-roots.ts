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
import { BAZI_TRANSPARENCY_ROOT_METHODOLOGY } from '../lib/bazi/transparency-root-methodology';
import {
  assertValidBaziTransparencyRootMethodology,
  validateBaziTransparencyRootMethodology,
} from '../lib/bazi/transparency-root-validator';
import type { BaziTransparencyRootMethodology } from '../lib/bazi/transparency-root-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-transparency-root-test-'));
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
  const tenGodRepeat = auditBaziTenGodRepeats(chart, dynamicTenGod, relationAudit);
  return {
    chart,
    transparencyRoot: auditBaziTransparencyRoots(chart, dynamicTenGod, tenGodRepeat),
  };
}

async function main() {
  assert.deepEqual(validateBaziTransparencyRootMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziTransparencyRootMethodology());

  const complete = createCompleteResult();
  assert.equal(complete.transparencyRoot.status, 'complete');
  assert.equal(complete.transparencyRoot.capabilities.transparencyConditionAudit, true);
  assert.equal(complete.transparencyRoot.capabilities.strictSameStemRootAudit, true);
  assert.equal(complete.transparencyRoot.capabilities.transparencyEffectVerdict, false);
  assert.equal(complete.transparencyRoot.capabilities.rootStrengthVerdict, false);

  const year2026 = complete.transparencyRoot.years.find(item => item.year === 2026)!;
  const segment2026 = year2026.segments[0];
  assert.equal(segment2026.counts.transparencyMatched, 4);
  assert.equal(segment2026.counts.monthCommandMatched, 1);
  assert.equal(segment2026.counts.exactSameStemRoots, 3);
  assert.equal(segment2026.counts.sameElementSupportOnly, 2);

  const monthGui = segment2026.transparencyCandidates.find(item =>
    item.hiddenOccurrence.label === '原局月柱子藏癸（本气）',
  )!;
  assert.equal(monthGui.scope, 'month_command_hidden_stem');
  assert.equal(monthGui.status, 'exact_surface_matched');
  assert.deepEqual(monthGui.surfaceMatches.map(item => item.label), ['第3步大运天干癸']);
  assert.ok(monthGui.repeatClusterId?.includes('癸'));
  assert.ok(monthGui.conditionChecks.every(item => item.state === 'met'));

  const annualDing = segment2026.transparencyCandidates.find(item =>
    item.hiddenOccurrence.label === '2026流年午藏丁（本气）',
  )!;
  assert.equal(annualDing.status, 'exact_surface_missing');
  assert.equal(annualDing.repeatClusterId, null);
  assert.equal(annualDing.conditionChecks.find(item => item.code === 'exact_surface_same_segment')?.state, 'missing');

  const annualBingRoot = segment2026.rootCandidates.find(item =>
    item.surfaceOccurrence.label === '2026流年天干丙',
  )!;
  assert.equal(annualBingRoot.status, 'exact_same_stem_root');
  assert.deepEqual(annualBingRoot.exactRootMatches.map(item => item.label), [
    '原局年柱巳藏丙（本气）',
    '原局日柱寅藏丙（中气）',
  ]);
  assert.ok(annualBingRoot.sameElementSupportMatches.some(item => item.stem === '丁'));
  assert.equal(annualBingRoot.selfSeatExactRoot, false);
  assert.ok(annualBingRoot.repeatClusterId?.includes('丙'));

  const dayMasterSupport = segment2026.rootCandidates.find(item =>
    item.surfaceOccurrence.sourceKind === 'day_master_reference',
  )!;
  assert.equal(dayMasterSupport.status, 'same_element_support_only');
  assert.equal(dayMasterSupport.exactRootMatches.length, 0, '纯原局根不得伪装成当年动态同干根');
  assert.ok(dayMasterSupport.sameElementSupportMatches.some(item => item.label === '2026流年午藏丁（本气）'));
  assert.ok(complete.transparencyRoot.years.some(year => year.segments.some(segment =>
    segment.rootCandidates.some(item => item.selfSeatExactRoot),
  )), '完整年份范围内应存在坐支同干位置样例');

  const year1998 = complete.transparencyRoot.years.find(item => item.year === 1998)!;
  assert.equal(year1998.segments.length, 2, '跨运流年必须保留两个独立条件审计片段');
  assert.ok(year1998.segments[0].transparencyCandidates.every(candidate =>
    candidate.hiddenOccurrence.layer !== 'luck_cycle'
    && candidate.surfaceMatches.every(item => item.layer !== 'luck_cycle'),
  ));
  assert.ok(year1998.segments[1].transparencyCandidates.some(candidate =>
    candidate.hiddenOccurrence.layer === 'luck_cycle'
    || candidate.surfaceMatches.some(item => item.layer === 'luck_cycle'),
  ));

  const unknownChart = calculateBazi({ birthDate: '1990-01-01', gender: 'male', unknownTime: true });
  const unknownLuck = calculateBaziLuckCycles(unknownChart);
  const unknownAnnual = calculateBaziAnnualTimeline(unknownChart, unknownLuck);
  const unknownAudit = auditBaziRelations(unknownChart, unknownLuck, unknownAnnual);
  const unknownAdjudication = adjudicateBaziRelations(unknownChart, unknownAudit);
  const unknownDynamic = auditBaziDynamicTenGods(unknownChart, unknownAudit, unknownAdjudication);
  const unknownRepeat = auditBaziTenGodRepeats(unknownChart, unknownDynamic, unknownAudit);
  const unknown = auditBaziTransparencyRoots(unknownChart, unknownDynamic, unknownRepeat);
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.years.every(year => year.segments.every(segment =>
    [...segment.transparencyCandidates.flatMap(item => [item.hiddenOccurrence, ...item.surfaceMatches]),
      ...segment.rootCandidates.flatMap(item => [item.surfaceOccurrence, ...item.exactRootMatches, ...item.sameElementSupportMatches])]
      .every(item => item.pillarKey !== 'time'),
  )));

  const invalid = structuredClone(BAZI_TRANSPARENCY_ROOT_METHODOLOGY) as BaziTransparencyRootMethodology;
  invalid.policy.rootPolicy = 'merge_all_support_as_root' as never;
  assert.ok(validateBaziTransparencyRootMethodology(invalid).some(item => item.includes('完全同干')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const transparencyRootRoute = await import('../app/api/bazi/charts/[id]/transparency-roots/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-10 透干通根条件测试', birthDate: '1990-01-01', birthTime: '12:00',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await transparencyRootRoute.POST(new Request('http://local/transparency-roots', { method: 'POST' }), {
      params: Promise.resolve({ id: chartId }),
    });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ transparencyRoot: { id: string; transparencyRootFingerprint: string; result: typeof complete.transparencyRoot } }>(firstResponse)).transparencyRoot;
    assert.equal(first.transparencyRootFingerprint.length, 64);
    assert.equal(first.result.years.find(item => item.year === 2026)?.counts.monthCommandMatched, 1);
    const second = (await json<{ transparencyRoot: { id: string } }>(await transparencyRootRoute.POST(
      new Request('http://local/transparency-roots', { method: 'POST' }),
      { params: Promise.resolve({ id: chartId }) },
    ))).transparencyRoot;
    assert.equal(second.id, first.id, '相同上游版本与方法版本应复用透干通根条件版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; transparencyRootVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.equal(conversation.transparencyRootVersionId, first.id);
    assert.equal(conversation.promptVersion, 'bazi-chat-hidden-stem-touch-v10');
    const question = appendBaziMessage({ conversationId: conversation.id, role: 'user', content: '请解释2026年的透干条件和严格同干根' });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.transparencyRootVersionId, first.id);
    assert.ok(built.messages.some(message => message.content.includes('权威八字岁运透干与通根条件证据快照')));
    assert.ok(built.messages.some(message => message.content.includes('月令藏干')));
    assert.ok(built.messages.some(message => message.content.includes('严格同干根候选')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('transparency_root_condition_audit'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('root_strength_verdict'));
    assert.deepEqual(findBaziOutputViolations('显隐同见，所以已经通根'), ['越权宣告透干通根']);
    assert.deepEqual(findBaziOutputViolations('条件匹配，所以透干已经有效'), ['越权裁决透干有效性']);
    assert.deepEqual(findBaziOutputViolations('同干根因此就是强根'), ['越权裁决根气强弱']);
    assert.deepEqual(findBaziOutputViolations('M9-10 显示透出条件匹配，但不等于透干有效；严格同干根也不代表根气有力'), []);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 32').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_transparency_root_versions').get() as { count: number }).count, 1);

    console.log('M9-10 透干与通根条件测试通过：月令透出、严格同干根、同五行支持、坐支位置、条件缺失、跨运分段、v32 持久化与上下文边界均正常。');
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
