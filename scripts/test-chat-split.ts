import assert from 'node:assert/strict';
import { CHAT_SPLIT_DEFAULT, measureChatSplit, readChatSplitPreference } from '../lib/ui/chat-split';

for (const saved of [null, '', 'NaN', 'Infinity', 'hello', '0', '99']) assert.equal(readChatSplitPreference(saved), CHAT_SPLIT_DEFAULT);
assert.equal(readChatSplitPreference('52.5'), 52.5);
for (const width of [956, 1000, 1188, 1440, 1920]) {
  for (const ratio of [-100, 20, 45, 80, 200]) {
    const split = measureChatSplit(width, ratio);
    assert.ok(split.chatWidth >= 420, '对话不能小于最小阅读宽度');
    assert.ok(width - 16 - split.chatWidth >= 520, '命盘不能被拖动挤坏');
    assert.ok(split.canSplit);
  }
}
assert.equal(measureChatSplit(955, 45).canSplit, false);
assert.equal(measureChatSplit(390, 45).canSplit, false);
const preferred = readChatSplitPreference('60');
assert.ok(measureChatSplit(1000, preferred).ratio < preferred, '窄窗口限制当前宽度');
assert.equal(measureChatSplit(1600, preferred).ratio, preferred, '恢复大窗口后重新使用保存比例');
assert.equal(measureChatSplit(1188, 45).chatWidth, 527.4);
console.log('聊天分栏约束验收通过：默认比例、持久化校验、命盘与对话最小宽度、窄屏切换与恢复。');
