import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Palace, ZiweiChart } from '../lib/ziwei/types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-heming-conversation-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

function createChart(name: string, gender: 'male' | 'female', unknownTime = false): ZiweiChart {
  const palaces = Array.from({ length: 12 }, (_, branch) => ({
    branch,
    stem: branch % 10,
    name: branch === 0 ? '命宫' : `测试宫${branch}`,
    stars: [],
  })) as Palace[];
  return {
    birthInfo: {
      year: gender === 'male' ? 1990 : 1992,
      month: 6,
      day: 15,
      hour: unknownTime ? 0 : 4,
      gender,
      name,
      unknownTime,
    },
    lunarInfo: {
      lunarYear: 1990,
      lunarMonth: 5,
      lunarDay: 23,
      yearStem: 6,
      yearBranch: 6,
      isLeapMonth: false,
    },
    mingGongBranch: 0,
    shenGongBranch: 6,
    wuxingJu: 5,
    wuxingJuName: '土五局',
    ziweiPos: 7,
    palaces,
    daXians: [],
    currentAge: 36,
    currentDaXianIndex: 0,
  };
}

async function main() {
  const {
    appendMessage,
    createConversation,
    deleteConversation,
    getConversation,
    listConversations,
    listMessages,
    updateConversation,
  } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const chartA = createChart('甲测试', 'male');
    const chartB = createChart('乙测试', 'female', true);
    const heming = createConversation({
      type: 'heming',
      title: '甲测试 × 乙测试 · 商业合伙',
      birthInfoA: chartA.birthInfo,
      birthInfoB: chartB.birthInfo,
      chartSnapshotA: chartA,
      chartSnapshotB: chartB,
      relationshipType: 'business',
      relationshipContext: {
        ownerARole: '合伙人甲',
        ownerBRole: '合伙人乙',
        customRelationshipLabel: null,
        mainConcern: '职责分工和风险边界',
        confirmedFacts: { planned_roles: '甲方负责产品，乙方负责市场' },
      },
    });

    const restored = getConversation(heming.id);
    assert.equal(restored?.type, 'heming');
    assert.equal(restored?.birthInfoA?.name, '甲测试');
    assert.equal(restored?.birthInfoB?.unknownTime, true);
    assert.equal(restored?.chartSnapshotA?.palaces.length, 12);
    assert.equal(restored?.chartSnapshotB?.birthInfo.name, '乙测试');
    assert.equal(restored?.relationshipType, 'business');
    assert.equal(restored?.relationshipContext?.ownerARole, '合伙人甲');
    assert.equal(restored?.relationshipContext?.confirmedFacts.planned_roles, '甲方负责产品，乙方负责市场');
    assert.equal(restored?.birthInfo, null, '合盘不得误写单盘出生信息');
    assert.equal(restored?.chartSnapshot, null, '合盘不得误写单盘快照');

    const chartConversation = createConversation({
      type: 'chart',
      title: '单盘隔离测试',
      birthInfo: chartA.birthInfo,
      chartSnapshot: chartA,
    });
    assert.deepEqual(listConversations({ type: 'heming' }).map(item => item.id), [heming.id]);
    assert.deepEqual(listConversations({ type: 'chart' }).map(item => item.id), [chartConversation.id]);

    appendMessage({
      conversationId: heming.id,
      role: 'user',
      content: '请分析合作分工',
      source: 'question',
    });
    assert.equal(updateConversation(heming.id, { title: '已重命名合盘' })?.title, '已重命名合盘');
    assert.equal(listMessages(heming.id).length, 1);

    const db = getDatabase();
    assert.ok(db.prepare('SELECT 1 FROM schema_migrations WHERE version = 7').get());
    assert.equal(deleteConversation(heming.id), true);
    assert.equal(getConversation(heming.id), null);
    assert.equal(listMessages(heming.id).length, 0, '删除合盘后消息必须级联删除');
    assert.equal(getConversation(chartConversation.id)?.type, 'chart', '删除合盘不得影响单盘会话');

    console.log('M4-1 双命盘持久化测试通过：创建、恢复、类型隔离、重命名和删除级联均正常。');
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
