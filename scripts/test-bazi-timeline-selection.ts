import assert from 'node:assert/strict';
import { calculateBazi } from '../lib/bazi/engine';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { calculateBaziAnnualTimeline } from '../lib/bazi/annual-timeline-engine';
import { calculateBaziMonthDayTimeline } from '../lib/bazi/month-day-timeline-engine';
import { resolveInitialAnnualYear, resolveInitialFlowDate } from '../lib/bazi/timeline-selection';

const instant = (at: string, offsetSeconds = 0) => new Date(new Date(`${at.replace(' ', 'T')}+08:00`).getTime() + offsetSeconds * 1000);
for (const lateZiPolicy of ['same_day', 'next_day'] as const) {
  const chart = calculateBazi({ birthDate: '2022-03-09', birthTime: '20:51', gender: 'male', timeZoneId: 'Asia/Shanghai', timeStandard: 'civil_time', lateZiPolicy });
  const luck = calculateBaziLuckCycles(chart);
  const annual = calculateBaziAnnualTimeline(chart, luck);
  const original = JSON.stringify(annual);
  const year = annual.years.find(item => item.year === 2030)!;
  assert.equal(resolveInitialAnnualYear(annual, instant('2030-01-01 00:00:00')), 2029, '元旦不能替代立春');
  assert.equal(resolveInitialAnnualYear(annual, instant(year.liChunAt!, -1)), 2029);
  assert.equal(resolveInitialAnnualYear(annual, instant(year.liChunAt!)), 2030);
  assert.equal(resolveInitialAnnualYear(annual, instant(year.nextLiChunAt!, -1)), 2030);
  assert.equal(resolveInitialAnnualYear(annual, instant(year.nextLiChunAt!)), 2031);
  const timeline = calculateBaziMonthDayTimeline(chart, annual, 2030);
  const before = resolveInitialFlowDate(timeline, instant('2030-12-11 22:59:59'));
  const after = resolveInitialFlowDate(timeline, instant('2030-12-11 23:00:00'));
  assert.equal(before, '2030-12-11');
  assert.equal(after, lateZiPolicy === 'next_day' ? '2030-12-12' : '2030-12-11');
  for (const boundary of [timeline.months[1].startAt!, luck.startAt!, luck.cycles[0].endAtExclusive!]) {
    const targetYear = resolveInitialAnnualYear(annual, instant(boundary));
    const selectedTimeline = calculateBaziMonthDayTimeline(chart, annual, targetYear);
    for (const delta of [-1, 0, 1]) {
      const asOf = instant(boundary, delta);
      const at = new Date(asOf.getTime() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
      const date = resolveInitialFlowDate(selectedTimeline, asOf);
      const day = selectedTimeline.days.find(item => item.effectiveDate === date)!;
      const segments = day.segments.filter(item => item.startAt <= at && at < item.endAtExclusive);
      assert.equal(segments.length, 1, `边界两侧应唯一归属：${at}`);
      if (boundary === luck.startAt!) assert.equal(segments[0].luckCycleIndex, delta < 0 ? null : 1);
      if (boundary === luck.cycles[0].endAtExclusive!) assert.equal(segments[0].luckCycleIndex, delta < 0 ? 1 : 2);
    }
  }
  assert.equal(JSON.stringify(annual), original, '默认选择不修改排期快照');
  assert.equal(resolveInitialAnnualYear(annual, instant('1900-01-01 00:00:00')), annual.range.startYear);
  assert.equal(resolveInitialAnnualYear(annual, instant('2200-01-01 00:00:00')), annual.range.endYear);
}
const partial = calculateBazi({ birthDate: '1999-06-07', gender: 'male', unknownTime: true });
const partialAnnual = calculateBaziAnnualTimeline(partial, calculateBaziLuckCycles(partial));
assert.equal(resolveInitialAnnualYear(partialAnnual, instant('2030-01-01 00:00:00')), 2029);
const unsupported = calculateBazi({ birthDate: '1999-06-07', birthTime: '12:00', gender: 'male', timeZoneId: 'America/New_York' });
const unsupportedAnnual = calculateBaziAnnualTimeline(unsupported, calculateBaziLuckCycles(unsupported));
const sequence = calculateBaziMonthDayTimeline(unsupported, unsupportedAnnual, 2030);
assert.equal(resolveInitialFlowDate(sequence, instant('2030-07-01 00:00:00')), '');
console.log('八字时间选择通过：立春、节界、起运、交运、晚子时、未知时辰与快照不变。');
