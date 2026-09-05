import assert from 'node:assert/strict';
import { DEFAULT_CHAT_PREFERENCES, getChatInputHeight, normalizeChatPreferences, readChatPreferences, serializeChatPreferences } from '../lib/ui/chat-preferences';

for (const raw of [null, '', '{bad', 'null', '[]', '{"version":99,"preferences":{"fontSize":22}}']) {
  assert.deepEqual(readChatPreferences(raw), DEFAULT_CHAT_PREFERENCES, '损坏、未知版本的偏好应恢复默认');
}
assert.deepEqual(normalizeChatPreferences({ fontSize: '22', aiFontSize: Infinity, font: 'url(secret)', autoGrow: 'false', lineHeight: 0, messageGap: -10, maxRows: 999 }), DEFAULT_CHAT_PREFERENCES);
const customized = { ...DEFAULT_CHAT_PREFERENCES, fontSize: 22, separateAiSize: true, aiFontSize: 24, autoFollow: false, showTopics: false, collapseCandidates: false, autoGrow: false, reduceMotion: true, sendKey: 'modified' as const };
assert.deepEqual(readChatPreferences(serializeChatPreferences(customized)), customized, '显式关闭项和独立 AI 字号必须在刷新后保留');
assert.equal(normalizeChatPreferences({ fontSize: 16.5 }).fontSize, 16);
assert.equal(normalizeChatPreferences({ aiFontSize: 25 }).aiFontSize, 16);
assert.equal('secret' in normalizeChatPreferences({ secret: '忽略未知字段' }), false);

const input = { lineHeight: 26.4, verticalPadding: 16, panelHeight: 700, autoGrow: true, maxRows: 6 };
assert.equal(getChatInputHeight({ ...input, contentHeight: 43 }), 44, '短问题只占一行');
assert.equal(getChatInputHeight({ ...input, contentHeight: 96 }), 96, '长问题按内容自然增高');
assert.equal(getChatInputHeight({ ...input, contentHeight: 900 }), 175, '超长文本限制六行');
assert.equal(getChatInputHeight({ ...input, panelHeight: 240, contentHeight: 900 }), 72, '矮屏保留正文空间');
assert.equal(getChatInputHeight({ ...input, autoGrow: false, contentHeight: 900 }), 44, '关闭自动增高后内部滚动');
assert.equal(getChatInputHeight({ ...input, lineHeight: 36.3, contentHeight: 30 }), 53, '大字输入仍需完整容纳一行');
assert.equal(getChatInputHeight({ ...input, contentHeight: 43 }), 44, '删除长问题后可缩回一行');
console.log('对话设置测试通过：损坏存储回退、取值约束、关闭项持久化、输入自适应、大字和矮屏限制。');
