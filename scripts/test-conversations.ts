import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ZiweiChart } from '../lib/ziwei/types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-conversation-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

const chart = {
  birthInfo: { year: 1990, month: 6, day: 15, hour: 4, gender: 'male', name: '测试命盘' },
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
  palaces: [],
  daXians: [],
  currentAge: 36,
  currentDaXianIndex: 0,
} satisfies ZiweiChart;

async function main() {
  const {
    appendMessage,
    createConversation,
    deleteConversation,
    getConversation,
    getRecentMessages,
    listConversations,
    listMessages,
    updateConversation,
    updateMessage,
  } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const conversation = createConversation({
      type: 'chart',
      title: '数据库集成测试',
      birthInfo: chart.birthInfo,
      chartSnapshot: chart,
    });
    assert.equal(getConversation(conversation.id)?.title, '数据库集成测试');

    const userMessage = appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: '请分析事业运',
      source: 'question',
    });
    const assistantMessage = appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      source: 'answer',
      status: 'streaming',
    });
    updateMessage(assistantMessage.id, { content: '事业解读内容', status: 'completed' });

    const messages = listMessages(conversation.id);
    assert.deepEqual(messages.map(message => message.seq), [1, 2]);
    assert.equal(messages[0].id, userMessage.id);
    assert.equal(messages[1].content, '事业解读内容');
    assert.equal(getRecentMessages(conversation.id, 8).length, 2);

    const listItem = listConversations({ type: 'chart' })[0];
    assert.equal(listItem.messageCount, 2);
    assert.equal(listItem.lastMessagePreview, '事业解读内容');

    assert.equal(updateConversation(conversation.id, { title: '已重命名会话' })?.title, '已重命名会话');
    assert.equal(deleteConversation(conversation.id), true);
    assert.equal(getConversation(conversation.id), null);
    assert.equal(listMessages(conversation.id).length, 0);

    console.log('会话数据库集成测试通过');
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
