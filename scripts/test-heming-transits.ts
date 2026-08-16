import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Palace, Star, ZiweiChart } from '../lib/ziwei/types';
import type { PalaceName } from '../lib/heming/types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-heming-transit-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

const PALACES: PalaceName[] = ['命宫', '兄弟宫', '夫妻宫', '子女宫', '财帛宫', '疾厄宫', '迁移宫', '交友宫', '官禄宫', '田宅宫', '福德宫', '父母宫'];

function createChart(owner: 'A' | 'B', unknownTime = false): ZiweiChart {
  const major: Record<'A' | 'B', Partial<Record<PalaceName, string>>> = {
    A: { 命宫: '天同', 夫妻宫: '紫微', 官禄宫: '武曲', 福德宫: '太阴' },
    B: { 命宫: '紫微', 夫妻宫: '天同', 官禄宫: '武曲', 福德宫: '天机' },
  };
  const palaces = PALACES.map((name, branch) => ({
    branch,
    stem: branch % 10,
    name,
    stars: [{ name: major[owner][name] ?? `${owner}${name}星`, type: 'major' as Star['type'] }],
    isEmpty: false,
    selfSihua: name === '命宫' ? [{ starName: '禁止发送的自化', siHua: '忌' as const }] : undefined,
  } satisfies Palace));
  return {
    birthInfo: {
      year: owner === 'A' ? 1990 : 1992,
      month: 6,
      day: 15,
      hour: 4,
      gender: owner === 'A' ? 'male' : 'female',
      name: `${owner}方隐私姓名`,
      city: `${owner}方隐私城市`,
      unknownTime,
    },
    lunarInfo: { lunarYear: 1990, lunarMonth: 5, lunarDay: 23, yearStem: 6, yearBranch: 6, isLeapMonth: false },
    mingGongBranch: 0,
    shenGongBranch: 6,
    wuxingJu: 5,
    wuxingJuName: '土五局',
    ziweiPos: 7,
    palaces,
    daXians: [
      { startAge: 1, endAge: 34, palaceBranch: owner === 'A' ? 1 : 7, palaceName: owner === 'A' ? '兄弟宫' : '交友宫' },
      { startAge: 35, endAge: 44, palaceBranch: owner === 'A' ? 2 : 8, palaceName: owner === 'A' ? '夫妻宫' : '官禄宫' },
      { startAge: 45, endAge: 130, palaceBranch: owner === 'A' ? 3 : 9, palaceName: owner === 'A' ? '子女宫' : '田宅宫' },
    ],
    currentAge: 36,
    currentDaXianIndex: 1,
  };
}

async function main() {
  const { appendMessage, createConversation, deleteConversation, updateConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const { listHemingTransitSnapshots } = await import('../lib/db/heming-transits');
  const { getOrCreateHemingAnnualTransit } = await import('../lib/heming/transit-service');
  const { buildHemingConversationContext } = await import('../lib/context/heming-builder');

  try {
    const chartA = createChart('A');
    const chartB = createChart('B', true);
    const conversation = createConversation({
      type: 'heming',
      title: '双人运限测试',
      birthInfoA: chartA.birthInfo,
      birthInfoB: chartB.birthInfo,
      chartSnapshotA: chartA,
      chartSnapshotB: chartB,
      relationshipType: 'romantic',
      relationshipContext: {
        ownerARole: '伴侣甲',
        ownerBRole: '伴侣乙',
        customRelationshipLabel: null,
        mainConcern: '沟通与长期安排',
        confirmedFacts: { relationship_status: '稳定交往' },
      },
    });

    const first = getOrCreateHemingAnnualTransit(conversation.id, 2026);
    const cached = getOrCreateHemingAnnualTransit(conversation.id, 2026);
    assert.equal(cached.id, first.id, '相同输入和年份应命中同一快照');
    assert.deepEqual(cached.snapshot, first.snapshot);
    assert.equal(first.snapshot.ownerA.owner, 'A');
    assert.equal(first.snapshot.ownerB.owner, 'B');
    assert.equal(first.snapshot.ownerA.transit.selectedYear, 2026);
    assert.equal(first.snapshot.ownerB.transit.selectedYear, 2026);
    assert.equal(first.snapshot.ownerA.transit.transformations.length, 4);
    assert.equal(first.snapshot.ownerB.transit.transformations.length, 4);
    assert.ok(first.snapshot.dimensions.length > 0);
    assert.ok(first.snapshot.dimensions.every(item => ['both', 'A', 'B', 'none'].includes(item.activation)));
    assert.ok(first.snapshot.warnings.some(item => item.includes('B 方出生时间未确认')));
    assert.ok(first.snapshot.disclaimer.includes('不代表必然发生'));
    assert.equal('score' in first.snapshot, false, '双人运限不得生成匹配分');

    const nextYear = getOrCreateHemingAnnualTransit(conversation.id, 2027);
    assert.notEqual(nextYear.id, first.id);
    assert.equal(nextYear.snapshot.ownerA.transit.selectedYear, 2027);
    assert.deepEqual(
      nextYear.snapshot.baselineResults.map(item => item.ruleId),
      first.snapshot.baselineResults.map(item => item.ruleId),
      '年份变化不应修改本命基线规则',
    );

    const originalFingerprint = first.snapshot.inputFingerprint;
    updateConversation(conversation.id, {
      relationshipType: 'business',
      relationshipContext: {
        ownerARole: '产品合伙人',
        ownerBRole: '市场合伙人',
        customRelationshipLabel: null,
        mainConcern: '职责与决策边界',
        confirmedFacts: { planned_roles: '甲方产品，乙方市场' },
      },
    });
    const refreshed = getOrCreateHemingAnnualTransit(conversation.id, 2026);
    assert.equal(refreshed.id, first.id, '同一版本和年份应更新原记录而不是制造重复项');
    assert.notEqual(refreshed.snapshot.inputFingerprint, originalFingerprint);
    assert.equal(refreshed.snapshot.relationshipType, 'business');
    assert.ok(refreshed.snapshot.dimensions.some(item => item.dimensionId === 'role_allocation'));

    const question = appendMessage({
      conversationId: conversation.id,
      role: 'user',
      source: 'question',
      topic: 'heming_transit',
      content: '分析 2026 年双方在职责分工上的关注重点。',
      metadata: { transit: { level: 'year', targetDate: '2026' } },
    });
    const built = buildHemingConversationContext({
      conversationId: conversation.id,
      currentMessageId: question.id,
      provider: 'deepseek',
      model: 'test-model',
    });
    const prompt = built.messages.map(message => message.content).join('\n');
    assert.ok(prompt.includes('2026 年双人确定性运限'));
    assert.ok(prompt.includes('"ownerA"') && prompt.includes('"ownerB"'));
    assert.ok(prompt.includes('年度激活只代表值得观察'));
    assert.ok(!prompt.includes('隐私姓名') && !prompt.includes('隐私城市'));
    assert.ok(!prompt.includes('selfSihua') && !prompt.includes('禁止发送的自化'));
    const manifestLayers = built.manifest.layers as {
      annualTransit: { included: boolean; year: number | null };
    };
    assert.equal(manifestLayers.annualTransit.included, true);
    assert.equal(manifestLayers.annualTransit.year, 2026);

    assert.throws(() => getOrCreateHemingAnnualTransit(conversation.id, 1980), /年份必须在/);
    assert.equal(listHemingTransitSnapshots(conversation.id).length, 2);
    assert.equal(deleteConversation(conversation.id), true);
    const orphanCount = getDatabase().prepare('SELECT COUNT(*) AS count FROM heming_transit_snapshots WHERE conversation_id = ?').get(conversation.id) as { count: number };
    assert.equal(orphanCount.count, 0, '删除合盘会话后年度快照应级联删除');

    console.log('M4-5 双人运限测试通过：双盘年度快照、缓存失效、关系维度、上下文注入与级联删除均正常。');
  } finally {
    getDatabase().close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
