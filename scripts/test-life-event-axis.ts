import assert from 'node:assert/strict';
import {
  buildLifeEventAxisGroups,
  calculateNominalAge,
  formatLifeEventAxisGroup,
  formatLifeEventAxisSpan,
  formatLifeEventNominalAge,
  getLifeEventAxisSpan,
} from '../lib/events/axis';
import type { LifeEventWithTransits } from '../lib/events/types';

type AxisFixture = Pick<LifeEventWithTransits, 'startDate' | 'endDate' | 'datePrecision'> & { id: string };

const events: AxisFixture[] = [
  { id: 'birth', startDate: '1990-06-15', endDate: null, datePrecision: 'day' },
  { id: 'school', startDate: '1996', endDate: null, datePrecision: 'year' },
  { id: 'career', startDate: '2018-03-12', endDate: '2020-08-20', datePrecision: 'range' },
  { id: 'same-year', startDate: '2018-09', endDate: null, datePrecision: 'month' },
  { id: 'unknown', startDate: '', endDate: null, datePrecision: 'unknown' },
];

assert.equal(calculateNominalAge(1990, 1990), 1, '出生自然年应映射为虚岁一岁');
assert.equal(calculateNominalAge(2026, 1990), 37, '后续年份应按自然年递增虚岁');
assert.equal(calculateNominalAge(1989, 1990), null, '出生年前的年份不能生成年龄索引');

const groups = buildLifeEventAxisGroups(events, 1990);
assert.deepEqual(groups.map(group => group.key), ['1990', '1996', '2018', 'unknown']);
assert.equal(groups[2].events.length, 2, '同一年多个事件应保留在同一轴节点');
assert.deepEqual(
  formatLifeEventAxisGroup(groups[2], 'calendar_year'),
  { primary: '2018', secondary: '虚岁 29' },
);
assert.deepEqual(
  formatLifeEventAxisGroup(groups[2], 'nominal_age'),
  { primary: '虚岁 29', secondary: '2018 年' },
);
assert.deepEqual(
  formatLifeEventAxisGroup(groups[3], 'nominal_age'),
  { primary: '日期不详', secondary: '未纳入年龄索引' },
);
assert.equal(formatLifeEventNominalAge(events[2], 1990), '虚岁 29–31', '区间事件应展示完整虚岁范围');
assert.equal(formatLifeEventNominalAge(events[4], 1990), '年龄不详');
assert.deepEqual(getLifeEventAxisSpan(events, 1990), {
  startYear: 1990,
  endYear: 2020,
  startNominalAge: 1,
  endNominalAge: 31,
});
assert.equal(formatLifeEventAxisSpan({ startYear: 2026, endYear: 2026, startNominalAge: 37, endNominalAge: 37 }, 'calendar_year'), '2026 年');
assert.equal(formatLifeEventAxisSpan({ startYear: 2026, endYear: 2026, startNominalAge: 37, endNominalAge: 37 }, 'nominal_age'), '虚岁 37');
assert.equal(formatLifeEventAxisSpan({ startYear: 2018, endYear: 2020, startNominalAge: 29, endNominalAge: 31 }, 'nominal_age'), '虚岁 29–31');

console.log('M2-4 人生事件双轴测试通过：年份、虚岁、区间年龄、同年聚合与未知日期均正常。');
