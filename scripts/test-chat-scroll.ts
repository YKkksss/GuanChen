import assert from 'node:assert/strict';
import { isNearScrollBottom } from '../lib/ui/chat-scroll';

assert.equal(isNearScrollBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 }), true, '精确位于底部时应继续跟随');
assert.equal(isNearScrollBottom({ scrollTop: 576, scrollHeight: 1000, clientHeight: 400 }), true, '位于容差边界时应继续跟随');
assert.equal(isNearScrollBottom({ scrollTop: 575, scrollHeight: 1000, clientHeight: 400 }), false, '离开底部超过容差后应暂停跟随');
assert.equal(isNearScrollBottom({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 }), true, '内容未溢出时应视为位于底部');
assert.equal(isNearScrollBottom({ scrollTop: 599.5, scrollHeight: 1000, clientHeight: 400 }), true, '应兼容小数像素误差');

console.log('聊天智能滚动测试通过');
