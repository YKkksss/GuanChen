import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateChart } from '../lib/ziwei/algorithm';
import { getCurrentStage } from '../lib/ziwei/current-stage';

process.env.SQLITE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'guanchen-heming-stage-')), 'test.sqlite');

async function main() {
  const { createConversation, getConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const { evaluateHemingConversation } = await import('../lib/heming/service');
  const { alignChartToTransit, getOrCreateHemingAnnualTransit } = await import('../lib/heming/transit-service');
  const { buildAnnualTransitSnapshot } = await import('../lib/transits/engine');
  const { buildHemingReportEvidence } = await import('../lib/reports/heming-facts');
  const { upsertHemingTransitSnapshot } = await import('../lib/db/heming-transits');
  const { extractHemingChartFacts } = await import('../lib/heming/facts');
  const chartA = generateChart({ year: 1992, month: 1, day: 15, hour: 4, gender: 'female' }, new Date('2005-07-01T04:00:00Z'));
  const chartB = generateChart({ year: 1995, month: 6, day: 15, hour: 7, gender: 'male', unknownTime: true }, new Date('2005-07-01T04:00:00Z'));
  try {
    const conversation = createConversation({ type: 'heming', title: '合成阶段核对', birthInfoA: chartA.birthInfo, birthInfoB: chartB.birthInfo,
      chartSnapshotA: chartA, chartSnapshotB: chartB, relationshipType: 'romantic',
      relationshipContext: { ownerARole: '角色甲', ownerBRole: '角色乙', customRelationshipLabel: null, mainConcern: null, confirmedFacts: {} } });
    const original = JSON.stringify(getConversation(conversation.id));
    let baseline: unknown;
    for (const date of ['2026-02-16', '2026-02-17', '2036-07-01']) {
      const asOf = new Date(`${date}T04:00:00Z`);
      const result = evaluateHemingConversation(conversation.id, asOf);
      assert.equal(result.observation?.asOfDate, date);
      assert.deepEqual(result.roles, { A: '角色甲', B: '角色乙' });
      for (const owner of ['A', 'B'] as const) {
        const expected = getCurrentStage(owner === 'A' ? chartA : chartB, asOf);
        assert.equal(result.observation?.ages[owner], expected.currentAge);
        assert.equal(result.facts[owner].currentStage?.branchIndex, expected.currentDaXian?.palaceBranch);
        assert.equal(result.facts[owner].currentStage?.owner, owner);
        assert.deepEqual(result.facts[owner].currentStage?.period, expected.period);
        const evidence = buildHemingReportEvidence(result, conversation.relationshipContext).find(item => item.kind === 'heming_stage' && item.facts.owner === owner);
        assert.equal(evidence?.facts.asOfDate, date);
        assert.equal(evidence?.facts.role, result.roles[owner]);
      }
      assert.equal(result.facts.B.birthTimeKnown, false);
      const nextBaseline = result.dimensions.flatMap(item => item.baselineResults);
      if (baseline) assert.deepEqual(nextBaseline, baseline, '观察日期变化不能改写本命规则');
      baseline = nextBaseline;
    }
    const before = evaluateHemingConversation(conversation.id, new Date('2026-02-16T15:59:59Z'));
    const after = evaluateHemingConversation(conversation.id, new Date('2026-02-16T16:00:00Z'));
    assert.equal(after.observation!.ages.A, before.observation!.ages.A + 1);
    assert.equal(after.observation!.ages.B, before.observation!.ages.B + 1);
    const annual = buildAnnualTransitSnapshot(chartA, 2026);
    const aligned = alignChartToTransit(chartA, annual);
    const expected = getCurrentStage(chartA, new Date('2026-07-01T04:00:00Z'));
    assert.equal(aligned.currentDaXianIndex, expected.currentDaXianIndex);
    assert.equal(aligned.palaces.filter(item => item.isCurrentDaXian).length, 1);
    const missing = alignChartToTransit({ ...chartA, daXians: [] }, annual);
    assert.equal(missing.currentDaXianIndex, -1);
    assert.equal(extractHemingChartFacts(missing, 'A').currentStage, null);
    assert.ok(missing.palaces.every(item => !item.isCurrentDaXian));
    const childhood = alignChartToTransit(chartB, buildAnnualTransitSnapshot(chartB, 1995));
    assert.equal(childhood.currentDaXianIndex, -1, '未起首限不借用旧阶段');
    const first = getOrCreateHemingAnnualTransit(conversation.id, 2026);
    evaluateHemingConversation(conversation.id, new Date('2050-07-01T04:00:00Z'));
    assert.deepEqual(getOrCreateHemingAnnualTransit(conversation.id, 2026), first, '当前评估不能影响指定年度缓存');
    upsertHemingTransitSnapshot({ ...first, snapshot: { ...first.snapshot, inputFingerprint: '旧版阶段对齐指纹', stageResults: [] } });
    const rebuilt = getOrCreateHemingAnnualTransit(conversation.id, 2026);
    assert.equal(rebuilt.id, first.id);
    assert.deepEqual(rebuilt.snapshot, first.snapshot, '旧版指纹必须触发年度快照重建');
    assert.equal(JSON.stringify(getConversation(conversation.id)), original, '刷新不写回历史快照');
    const swapped = createConversation({ type: 'heming', title: '合成交换验证', birthInfoA: chartB.birthInfo, birthInfoB: chartA.birthInfo,
      chartSnapshotA: chartB, chartSnapshotB: chartA, relationshipType: 'romantic' });
    const reversed = evaluateHemingConversation(swapped.id, new Date('2026-02-17T04:00:00Z'));
    assert.equal(reversed.observation!.ages.A, after.observation!.ages.B);
    assert.equal(reversed.observation!.ages.B, after.observation!.ages.A);
    assert.equal(reversed.facts.A.birthTimeKnown, false);
    assert.equal(reversed.facts.B.birthTimeKnown, true);
    assert.ok(Object.values(reversed.facts.A.palaces).every(item => item.owner === 'A'));
    assert.ok(Object.values(reversed.facts.B.palaces).every(item => item.owner === 'B'));
    console.log('合盘阶段核对通过：甲乙归属、春节换岁、历史快照、报告日期、年度隔离与缺失阶段。');
  } finally {
    getDatabase().close();
    globalThis.__ziweiSqlite = undefined;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
