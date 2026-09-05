import assert from 'node:assert/strict';
import { shouldSendChatMessage } from '@/lib/client/chat-keyboard';

assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false }), true);
assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: true }), false);
assert.equal(shouldSendChatMessage({ key: 'a', shiftKey: false }), false);
assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: true } }), false);
assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false, nativeEvent: { keyCode: 229 } }), false);

assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false }, 'enter'), true);
assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false, ctrlKey: true }, 'enter'), false);
assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false }, 'modified'), false);
for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
  assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false, ...modifier }, 'modified'), true);
  assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: true, ...modifier }, 'modified'), false);
  assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false, ...modifier, nativeEvent: { isComposing: true } }, 'modified'), false);
  assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false, ...modifier, nativeEvent: { keyCode: 229 } }, 'modified'), false);
}
assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false, ctrlKey: true, altKey: true }, 'modified'), false);

console.log('聊天输入法防误发送测试通过');
