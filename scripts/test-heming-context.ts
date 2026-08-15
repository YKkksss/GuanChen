import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Palace, Star, ZiweiChart } from '../lib/ziwei/types';
import type { PalaceName } from '../lib/heming/types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-heming-context-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');
process.env.AI_CONTEXT_LIMIT = '7000';
process.env.AI_INPUT_TOKEN_TARGET = '3200';
process.env.AI_OUTPUT_RESERVE = '900';
process.env.AI_CONTEXT_SAFETY_MARGIN = '400';

const PALACES: PalaceName[] = ['命宫', '兄弟宫', '夫妻宫', '子女宫', '财帛宫', '疾厄宫', '迁移宫', '交友宫', '官禄宫', '田宅宫', '福德宫', '父母宫'];

function createChart(owner: 'A' | 'B', unknownTime = false): ZiweiChart {
  const major: Record<'A' | 'B', Partial<Record<PalaceName, string>>> = {
    A: { 命宫: '天同', 夫妻宫: '紫微', 官禄宫: '武曲', 福德宫: '太阴' },
    B: { 命宫: '紫微', 夫妻宫: '天同', 官禄宫: '武曲', 福德宫: '天机' },
  };
  const palaces = PALACES.map((name, branch) => ({
    branch, stem: branch % 10, name,
    stars: [{ name: major[owner][name] ?? `${owner}${name}星`, type: 'major' as Star['type'] }],
    isEmpty: false,
    selfSihua: name === '命宫' ? [{ starName: '禁止发送的自化', siHua: '忌' as const }] : undefined,
  } satisfies Palace));
  return {
    birthInfo: { year: owner === 'A' ? 1990 : 1992, month: 6, day: 15, hour: 4, gender: owner === 'A' ? 'male' : 'female', name: `${owner}方隐私姓名`, city: `${owner}方隐私城市`, unknownTime },
    lunarInfo: { lunarYear: 1990, lunarMonth: 5, lunarDay: 23, yearStem: 6, yearBranch: 6, isLeapMonth: false },
    mingGongBranch: 0, shenGongBranch: 6, wuxingJu: 5, wuxingJuName: '土五局', ziweiPos: 7,
    palaces,
    daXians: [{ startAge: 35, endAge: 44, palaceBranch: owner === 'A' ? 2 : 8, palaceName: owner === 'A' ? '夫妻宫' : '官禄宫' }],
    currentAge: 36, currentDaXianIndex: 0,
  };
}

async function main() {
  const { appendMessage, createConversation, updateConversation } = await import('../lib/db/conversations');
  const { upsertMemoryItem } = await import('../lib/db/context');
  const { buildFallbackHemingConversationContext, buildHemingConversationContext } = await import('../lib/context/heming-builder');
  const { estimateMessagesTokens } = await import('../lib/context/token-counter');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const chartA = createChart('A');
    const chartB = createChart('B', true);
    const conversation = createConversation({
      type: 'heming', title: '合盘上下文测试', birthInfoA: chartA.birthInfo, birthInfoB: chartB.birthInfo,
      chartSnapshotA: chartA, chartSnapshotB: chartB, relationshipType: 'romantic',
      relationshipContext: {
        ownerARole: '伴侣甲', ownerBRole: '伴侣乙', customRelationshipLabel: null,
        mainConcern: '长期沟通与生活安排', confirmedFacts: { relationship_status: '稳定交往', relationship_duration: '三年' },
      },
    });
    for (let turn = 1; turn <= 60; turn += 1) {
      appendMessage({ conversationId: conversation.id, role: 'user', source: 'question', topic: 'heming', content: turn === 2 ? '甲方在2023年换过工作，乙方没有换工作，请记住双方归属。' : `第${turn}轮：继续讨论双方沟通、生活安排和关系边界。` });
      appendMessage({ conversationId: conversation.id, role: 'assistant', source: 'answer', topic: 'heming', content: `第${turn}轮合盘回答。${'甲乙事实分开解释，现实经历需要确认。'.repeat(8)}` });
    }
    const current = appendMessage({ conversationId: conversation.id, role: 'user', source: 'question', topic: 'heming', content: '甲方2023年换工作的经历，对双方现在的分工有什么参考？' });
    upsertMemoryItem({ conversationId: conversation.id, category: 'confirmed_event', content: '甲方在2023年换过工作；乙方没有换工作。', normalizedKey: 'A_job_change_2023', sourceMessageId: current.id, confidence: .99 });

    const built = buildHemingConversationContext({ conversationId: conversation.id, currentMessageId: current.id, provider: 'deepseek', model: 'test-model' });
    assert.ok(built.estimatedInputTokens <= built.inputBudget);
    assert.equal(estimateMessagesTokens(built.messages), built.estimatedInputTokens);
    assert.ok(built.recentMessageIds.length >= 8 && built.recentMessageIds.length <= 20);
    assert.ok(built.retrievedMessageIds.length >= 1, '应召回包含 2023 年的较早消息');
    assert.equal(built.messages.at(-1)?.content, current.content);
    const prompt = built.messages.map(message => message.content).join('\n');
    assert.ok(prompt.includes('"chartA"') && prompt.includes('"chartB"'));
    assert.ok(prompt.includes('伴侣甲') && prompt.includes('伴侣乙'));
    assert.ok(prompt.includes('unknown-time-confidence-guard-b'));
    assert.ok(prompt.includes('2023年换过工作'));
    assert.ok(!prompt.includes('隐私姓名') && !prompt.includes('隐私城市'));
    assert.ok(!prompt.includes('selfSihua') && !prompt.includes('禁止发送的自化'));
    assert.equal(built.manifest.version, 'heming-context-v1');
    assert.equal(built.manifest.conversationType, 'heming');
    assert.equal(built.manifest.methodologyVersion, 'heming-method-v1');

    const fallback = buildFallbackHemingConversationContext({ conversationId: conversation.id, currentMessageId: current.id, provider: 'deepseek', model: 'test-model', reason: '集成测试' });
    assert.ok(fallback.estimatedInputTokens <= fallback.inputBudget);
    assert.equal(fallback.messages.at(-1)?.content, current.content);
    assert.equal(fallback.manifest.degraded, true);

    const updated = updateConversation(conversation.id, {
      relationshipType: 'business',
      relationshipContext: { ownerARole: '产品合伙人', ownerBRole: '市场合伙人', customRelationshipLabel: null, mainConcern: '股权与决策边界', confirmedFacts: { planned_roles: '甲方产品，乙方市场', decision_process: '重大事项共同决定' } },
    });
    assert.equal(updated?.relationshipType, 'business');
    const businessContext = buildHemingConversationContext({ conversationId: conversation.id, currentMessageId: current.id, provider: 'deepseek', model: 'test-model' });
    const businessPrompt = businessContext.messages.map(message => message.content).join('\n');
    assert.ok(businessPrompt.includes('产品合伙人') && businessPrompt.includes('市场合伙人'));
    assert.ok(businessPrompt.includes('business'));
    assert.ok(!businessPrompt.includes('伴侣甲'));

    console.log('M4-3 合盘上下文测试通过：双盘隔离、规则注入、历史召回、预算控制、降级与关系背景更新均正常。');
  } finally {
    getDatabase().close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
