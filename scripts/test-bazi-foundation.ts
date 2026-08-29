import assert from 'node:assert/strict';
import { calculateBazi } from '../lib/bazi/engine';
import { BAZI_METHODOLOGY } from '../lib/bazi/methodology';
import { assertValidBaziMethodology, validateBaziMethodology } from '../lib/bazi/validator';
import type { BaziMethodology } from '../lib/bazi/types';

function cloneMethodology(): BaziMethodology {
  return structuredClone(BAZI_METHODOLOGY);
}

function main() {
  assert.deepEqual(validateBaziMethodology(BAZI_METHODOLOGY), []);
  assert.doesNotThrow(() => assertValidBaziMethodology(BAZI_METHODOLOGY));

  // lunar-javascript 官方 EightChar 测试样例。
  const fixture = calculateBazi({
    birthDate: '2005-12-23', birthTime: '08:37', gender: 'male',
    timeStandard: 'civil_time', lateZiPolicy: 'same_day',
  });
  assert.deepEqual(
    [fixture.pillars.year.ganZhi, fixture.pillars.month.ganZhi, fixture.pillars.day.ganZhi, fixture.pillars.time?.ganZhi],
    ['乙酉', '戊子', '辛巳', '壬辰'],
  );
  assert.deepEqual(fixture.pillars.day.hiddenStems.map(item => item.stem), ['丙', '庚', '戊']);
  assert.deepEqual(fixture.pillars.day.hiddenStems.map(item => item.tenGod), ['正官', '劫财', '正印']);
  assert.equal(fixture.pillars.year.stemTenGod, '偏财');
  assert.equal(fixture.pillars.time?.stemTenGod, '伤官');
  assert.equal(fixture.pillars.year.naYin, '泉中水');
  assert.equal(fixture.pillars.time?.growthStage, '墓');
  assert.equal(fixture.dayMaster.stem, '辛');
  assert.equal(fixture.elementCounts.reduce((sum, item) => sum + item.surface, 0), 8);

  // 官方边界样例：同一晚子时，两种流派只改变日柱。
  const sameDay = calculateBazi({
    birthDate: '1988-02-15', birthTime: '23:30', gender: 'female', lateZiPolicy: 'same_day',
  });
  const nextDay = calculateBazi({
    birthDate: '1988-02-15', birthTime: '23:30', gender: 'female', lateZiPolicy: 'next_day',
  });
  assert.equal(sameDay.pillars.day.ganZhi, '庚子');
  assert.equal(nextDay.pillars.day.ganZhi, '辛丑');
  assert.equal(sameDay.pillars.time?.ganZhi, '戊子');
  assert.equal(nextDay.pillars.time?.ganZhi, '戊子');
  assert.ok(nextDay.warnings.some(item => item.includes('晚子时')));

  const unknown = calculateBazi({ birthDate: '1999-06-07', gender: 'male', unknownTime: true });
  assert.equal(unknown.pillars.time, null);
  assert.equal(unknown.completeness, 'partial_unknown_time');
  assert.equal(unknown.elementCounts.reduce((sum, item) => sum + item.surface, 0), 6);

  const apparent = calculateBazi({
    birthDate: '2000-01-01', birthTime: '00:10', gender: 'male',
    timeStandard: 'apparent_solar_time', timeZoneId: 'Asia/Shanghai', longitude: 75,
  });
  assert.ok(apparent.effectiveTime.conversion);
  assert.equal(apparent.effectiveTime.standard, 'apparent_solar_time');
  assert.notEqual(apparent.effectiveTime.time, '00:10:00');

  assert.throws(() => calculateBazi({
    birthDate: '2000-01-01', birthTime: '12:00', gender: 'male', timeStandard: 'apparent_solar_time',
  }), /经度/);

  const invalidBoundary = cloneMethodology();
  invalidBoundary.calculationPolicy.yearBoundary = 'invalid' as never;
  assert.ok(validateBaziMethodology(invalidBoundary).some(error => error.includes('立春')));

  const hiddenUnknownRule = cloneMethodology();
  hiddenUnknownRule.prohibitedClaims = hiddenUnknownRule.prohibitedClaims.filter(item => item !== '未知时辰时伪造时柱');
  assert.ok(validateBaziMethodology(hiddenUnknownRule).some(error => error.includes('未知时辰')));

  console.log('M9-0 八字基础测试通过：方法论、四柱、藏干、十神、晚子时、未知时辰和真太阳时均正常。');
}

main();
