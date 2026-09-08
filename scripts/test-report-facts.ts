import assert from 'node:assert/strict';
import { astro } from 'iztro';
import { Lunar } from 'lunar-javascript';
import { generateChart } from '../lib/ziwei/algorithm';
import { getCurrentStage, refreshChartStage } from '../lib/ziwei/current-stage';
import { buildReportEvidence } from '../lib/reports/facts';
import { summarizeChart } from '../lib/ai/ziwei-context';
import { buildCompactChartBase } from '../lib/context/chart-context';
import { selectReportEvents } from '../lib/reports/event-selection';
import type { LifeEventWithTransits } from '../lib/events/types';

const birth = { year: 1992, month: 1, day: 15, hour: 4, gender: 'female' as const };
const chart = generateChart(birth, new Date('2020-07-01T04:00:00Z'));
const original = JSON.stringify(chart);
const astrolabe = astro.bySolar('1992-1-15', 4, '女', true, 'zh-CN');
for (const date of ['2025-01-28', '2025-01-29', '2026-01-01', '2026-02-16', '2026-02-17', '2026-07-01']) {
  const asOf = new Date(`${date}T04:00:00Z`);
  const stage = getCurrentStage(chart, asOf);
  const flow = astrolabe.horoscope(date, birth.hour);
  assert.equal(stage.currentAge, flow.age.nominalAge, `农历虚岁与现有引擎一致：${date}`);
  const view = refreshChartStage(chart, asOf);
  const core = buildReportEvidence(chart, 'current_daxian', [], asOf)[0].facts;
  const context = JSON.parse(buildCompactChartBase(chart, asOf));
  assert.equal(core.currentAge, view.currentAge);
  assert.equal(JSON.parse(summarizeChart(chart, asOf)).currentAge, view.currentAge);
  assert.equal(context.core.currentAge, view.currentAge);
  assert.equal(context.core.asOfDate, date);
  assert.equal(view.palaces.filter(p => p.isCurrentDaXian).length, stage.currentDaXian ? 1 : 0);
  if (stage.currentDaXian) {
    assert.equal(astrolabe.palaces[flow.decadal.index].name, stage.currentDaXian.palaceName);
  }
}
assert.equal(JSON.stringify(chart), original, '刷新派生阶段不能修改保存的命盘');
assert.equal(getCurrentStage(chart, new Date('2025-01-28T15:59:59.999Z')).currentAge + 1,
  getCurrentStage(chart, new Date('2025-01-28T16:00:00Z')).currentAge, '北京时间春节零点换岁');
assert.equal(getCurrentStage(chart, new Date('2025-12-31T15:59:59Z')).currentAge,
  getCurrentStage(chart, new Date('2025-12-31T16:00:00Z')).currentAge, '公历元旦不提前换岁');

const target = chart.daXians[3];
const firstDate = Lunar.fromYmd(chart.lunarInfo.lunarYear + target.startAge - 1, 1, 1).getSolar().toYmd();
const atStart = new Date(`${firstDate}T00:00:00+08:00`);
const stage = getCurrentStage(chart, atStart);
assert.equal(stage.currentDaXian?.startAge, target.startAge);
assert.equal(getCurrentStage(chart, new Date(atStart.getTime() - 1)).currentDaXian?.endAge, target.startAge - 1);
assert.equal(stage.period?.startDate, firstDate);
assert.equal(getCurrentStage(chart, new Date(`${stage.period!.endDate}T23:59:59+08:00`)).currentDaXian?.endAge, target.endAge);
const child = getCurrentStage(chart, new Date('1992-01-15T04:00:00Z'));
assert.equal(child.currentDaXian, null, '未起首个大限时不编造阶段');

function event(id: string, category: LifeEventWithTransits['category'], overrides: Partial<LifeEventWithTransits> = {}): LifeEventWithTransits {
 return { id, conversationId: 'synthetic', title: id, category, customCategory: null, startDate: '2025', endDate: null,
  datePrecision: 'year', description: null, impactLevel: 3, source: 'user_input', sourceMessageId: null,
  confirmedByUser: true, createdAt: 1, updatedAt: 1, transitLinks: [], ...overrides };
}
const noise = Array.from({length: 25}, (_, i) => event(`健康记录${i}`, 'health', {updatedAt: i+100}));
const career = event('工作调整', 'career', {startDate:'2020'});
const custom = event('完成职业学习', 'custom', {datePrecision:'unknown', startDate:''});
const unconfirmed = event('未确认工作', 'career', {confirmedByUser:false});
const events = [...noise, career, custom, unconfirmed];
const eventCopy = JSON.stringify(events);
const selected = selectReportEvents(events, 'career', null);
assert.deepEqual(selected.selected.map(e=>e.id), [career.id,custom.id], '较旧工作记录不被最近无关记录挤掉');
assert.equal(selected.summary.confirmedCount, 27);
assert.equal(selected.summary.selectedCount, 2);
assert.equal(selected.summary.omittedCount, 25);
assert.equal(selectReportEvents(events, 'health', null).summary.truncatedCount, 5);
assert.equal(selectReportEvents(events, 'relationship', null).selected.length, 0);
assert.equal(selectReportEvents(events, 'overview', null).selected.length, 20);
assert.equal(JSON.stringify(events), eventCopy, '筛选不重排或修改原事件');
const stageEvents = [
 event('起点', 'career', {datePrecision:'day',startDate:stage.period!.startDate}),
 event('终点', 'career', {datePrecision:'day',startDate:stage.period!.endDate}),
 event('跨阶段', 'family', {datePrecision:'range',startDate:'1992-01-15',endDate:'2090-01-01'}),
 event('过去', 'career', {startDate:'1992'}), custom,
];
assert.deepEqual(new Set(selectReportEvents(stageEvents,'current_daxian',stage.period).selected.map(e=>e.id)),new Set(['起点','终点','跨阶段']));
assert.equal(selectReportEvents(stageEvents,'current_daxian',null).selected.length,0);
const evidence = buildReportEvidence(chart,'career',events,atStart);
assert.equal(evidence.filter(e=>e.kind==='confirmed_event').length,2);
assert.equal(evidence.find(e=>e.evidenceKey===`event:${custom.id}`)?.facts.datePrecision,'unknown');
assert.equal((evidence[0].facts.eventSelection as {selectedCount:number}).selectedCount,2);
console.log('报告事实测试通过：引擎年龄一致、春节与大限边界、历史快照不变、专题筛选、日期精度及筛选数量。');
