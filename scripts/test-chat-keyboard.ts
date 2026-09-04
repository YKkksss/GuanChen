import assert from 'node:assert/strict';
import { shouldSendChatMessage } from '@/lib/client/chat-keyboard';

assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false }), true);
assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: true }), false);
assert.equal(shouldSendChatMessage({ key: 'a', shiftKey: false }), false);
assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: true } }), false);
assert.equal(shouldSendChatMessage({ key: 'Enter', shiftKey: false, nativeEvent: { keyCode: 229 } }), false);

console.log('聊天输入法防误发送测试通过');
