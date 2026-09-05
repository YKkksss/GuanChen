import assert from 'node:assert/strict';
import { destinationHref, isWorkspaceDestination, resolveWorkspaceDestination } from '../lib/ui/workspace-navigation';

// 同一入口从不同工作区进入时，应保持业务含义，并只复用兼容的档案上下文。
const cases = [
  ['reports', '/chart/solo', '/chart/solo/reports'],
  ['reports', '/heming/pair/timeline', '/heming/pair/reports'],
  ['reports', '/rectification/session', '/rectification/session/reports'],
  ['events', '/chart/solo/reports', '/chart/solo/events'],
  ['events', '/heming/pair', '/chart/select?target=events'],
  ['events', '/rectification/session', '/chart/select?target=events'],
  ['timeline', '/chart/solo/events', '/chart/solo/timeline'],
  ['timeline', '/heming/pair/reports', '/heming/pair/timeline'],
  ['timeline', '/rectification/session', '/chart/select?target=timeline'],
] as const;
for (const [target, source, expected] of cases) assert.equal(resolveWorkspaceDestination(target, source), expected);
for (const source of ['/', '/chart', '/chart/select', '/heming', '/rectification', '/reviews', '/learn', '/bazi/one', '/chart/new']) {
  for (const target of ['reports', 'events', 'timeline'] as const) {
    assert.equal(resolveWorkspaceDestination(target, source), `/chart/select?target=${target}`);
  }
}
assert.equal(destinationHref('reports', 'chart', '含 空格/编码'), '/chart/%E5%90%AB%20%E7%A9%BA%E6%A0%BC%2F%E7%BC%96%E7%A0%81/reports');
for (const value of ['reports', 'events', 'timeline']) assert.ok(isWorkspaceDestination(value));
for (const value of ['__proto__', 'constructor', '', null, undefined, ['events']]) assert.equal(isWorkspaceDestination(value), false);
console.log('工作台导航专项测试通过：上下文兼容、选档回退、路由编码、参数校验。');
