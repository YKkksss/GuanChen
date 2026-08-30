import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ZiweiChart } from '../lib/ziwei/types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-context-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');
process.env.AI_CONTEXT_LIMIT = '6000';
process.env.AI_INPUT_TOKEN_TARGET = '2600';
process.env.AI_OUTPUT_RESERVE = '800';
process.env.AI_CONTEXT_SAFETY_MARGIN = '400';

const chart = {
  birthInfo: { year: 1990, month: 6, day: 15, hour: 4, gender: 'male', name: '不应发送的姓名', city: '不应发送的城市' },
  lunarInfo: {
    lunarYear: 1990,
    lunarMonth: 5,
    lunarDay: 23,
    yearStem: 6,
    yearBranch: 6,
    isLeapMonth: false,
  },
  mingGongBranch: 2,
  shenGongBranch: 10,
  wuxingJu: 5,
  wuxingJuName: '土五局',
  ziweiPos: 7,
  palaces: Array.from({ length: 12 }, (_, branch) => ({
    branch,
    stem: branch % 10,
    name: ['命宫', '兄弟宫', '夫妻宫', '子女宫', '财帛宫', '疾厄宫', '迁移宫', '交友宫', '官禄宫', '田宅宫', '福德宫', '父母宫'][branch],
    stars: [{ name: branch % 2 ? '天机' : '紫微', type: 'major' as const }],
    isMingGong: branch === 2,
    isShenGong: branch === 10,
    isCurrentDaXian: branch === 8,
  })),
  daXians: [{ startAge: 35, endAge: 44, palaceBranch: 8, palaceName: '官禄宫' }],
  currentAge: 36,
  currentDaXianIndex: 0,
} satisfies ZiweiChart;

async function main() {
  const {
    appendMessage,
    createConversation,
  } = await import('../lib/db/conversations');
  const {
    completeContextRun,
    createContextRun,
    listActiveMemories,
    listContextRuns,
    retrieveOlderMessages,
    replaceConversationMemories,
    updateMemoryItem,
    upsertMemoryItem,
  } = await import('../lib/db/context');
  const {
    buildConversationContext,
    buildFallbackConversationContext,
  } = await import('../lib/context/builder');
  const { estimateMessagesTokens } = await import('../lib/context/token-counter');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const conversation = createConversation({
      type: 'chart',
      title: '上下文测试',
      birthInfo: chart.birthInfo,
      chartSnapshot: chart,
    });

    for (let turn = 1; turn <= 100; turn += 1) {
      appendMessage({
        conversationId: conversation.id,
        role: 'user',
        content: turn === 2
          ? '我在2022年换过工作，请记住这个经历。'
          : `这是第${turn}轮用户问题，想继续讨论事业发展和工作方向。`,
        source: 'question',
        topic: 'career',
      });
      appendMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: `这是第${turn}轮助手回答。${'结合命盘进行谨慎分析。'.repeat(12)}`,
        source: 'answer',
        topic: 'career',
      });
    }
    const current = appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: '之前提到的2022年换工作，对我现在事业选择有什么参考？',
      source: 'question',
      topic: 'career',
    });

    const firstMemory = upsertMemoryItem({
      conversationId: conversation.id,
      category: 'confirmed_event',
      content: '用户在2022年换过工作。',
      normalizedKey: 'career_change_2022',
      sourceMessageId: current.id,
      confidence: 0.95,
    });
    upsertMemoryItem({
      conversationId: conversation.id,
      category: 'confirmed_event',
      content: '用户在2022年换过工作。',
      normalizedKey: 'career_change_2022',
      sourceMessageId: current.id,
      confidence: 0.99,
    });
    assert.equal(listActiveMemories(conversation.id).filter(item => item.normalizedKey === 'career_change_2022').length, 1);
    assert.equal(firstMemory.status, 'active');

    const editableMemory = upsertMemoryItem({
      conversationId: conversation.id,
      category: 'user_preference',
      content: '回答简洁。',
      normalizedKey: 'answer_style',
      sourceMessageId: current.id,
    });
    assert.equal(updateMemoryItem({
      id: editableMemory.id,
      conversationId: conversation.id,
      content: '回答详细并分段。',
    })?.content, '回答详细并分段。');
    updateMemoryItem({ id: editableMemory.id, conversationId: conversation.id, status: 'deleted' });
    assert.ok(!listActiveMemories(conversation.id).some(item => item.id === editableMemory.id));
    assert.equal(replaceConversationMemories(conversation.id, [{
      category: 'user_fact',
      content: '用户从事软件开发。',
      normalizedKey: 'occupation',
      confidence: 0.98,
    }]), 1);
    assert.deepEqual(
      listActiveMemories(conversation.id).map(item => item.content),
      ['用户从事软件开发。', '用户在2022年换过工作。'],
      '重建普通记忆时必须保留用户明确确认过的人生事件',
    );

    const built = buildConversationContext({
      conversationId: conversation.id,
      currentMessageId: current.id,
      provider: 'deepseek',
      model: 'test-model',
    });
    assert.ok(built.estimatedInputTokens <= built.inputBudget);
    assert.equal(estimateMessagesTokens(built.messages), built.estimatedInputTokens);
    assert.ok(built.recentMessageIds.length >= 8, '至少应保留最近四轮原始消息');
    assert.ok(built.recentMessageIds.length <= 20, '不得超过最近十轮原始消息');
    assert.ok(built.retrievedMessageIds.length >= 1, '应召回包含 2022 年的旧消息');
    const prompt = built.messages.map(message => message.content).join('\n');
    assert.ok(prompt.includes('2022年换过工作'));
    assert.ok(!prompt.includes('不应发送的姓名'));
    assert.ok(!prompt.includes('不应发送的城市'));
    assert.equal(built.messages.at(-1)?.content, current.content, '当前问题必须完整放在最后');

    const fallback = buildFallbackConversationContext({
      conversationId: conversation.id,
      currentMessageId: current.id,
      provider: 'deepseek',
      model: 'test-model',
      reason: '测试降级',
    });
    assert.ok(fallback.estimatedInputTokens <= fallback.inputBudget);
    assert.equal(fallback.manifest.degraded, true);
    assert.equal(fallback.messages.at(-1)?.content, current.content);

    const retrieved = retrieveOlderMessages({
      conversationId: conversation.id,
      beforeSeq: current.seq,
      terms: ['2022', '工作'],
      topic: 'career',
    });
    assert.ok(retrieved.some(message => message.content.includes('2022年')));

    const assistant = appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: '测试回答',
      source: 'answer',
    });
    const run = createContextRun({
      conversationId: conversation.id,
      triggerMessageId: current.id,
      assistantMessageId: assistant.id,
      provider: 'deepseek',
      model: 'test-model',
      contextLimit: built.contextLimit,
      outputReserve: built.outputReserve,
      inputBudget: built.inputBudget,
      estimatedInputTokens: built.estimatedInputTokens,
      summaryVersion: built.summaryVersion,
      recentMessageStartSeq: built.recentMessageStartSeq,
      recentMessageCount: built.recentMessageIds.length,
      retrievedMessageIds: built.retrievedMessageIds,
      contextManifest: built.manifest,
    });
    completeContextRun(run.id, { status: 'completed', actualOutputTokens: 20 });
    assert.equal(listContextRuns(conversation.id)[0].status, 'completed');

    const tables = getDatabase().prepare(`
      SELECT name FROM sqlite_master
      WHERE type IN ('table', 'view') AND name IN ('memory_items', 'context_runs', 'messages_fts')
    `).all() as Array<{ name: string }>;
    assert.ok(tables.some(table => table.name === 'memory_items'));
    assert.ok(tables.some(table => table.name === 'context_runs'));

    console.log('上下文管理集成测试通过');
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
