import assert from 'node:assert/strict';
import { formToBirthInfo } from '@/lib/ziwei/share';

const base = {
  name: '',
  year: '2000',
  month: '4',
  day: '15',
  clockHour: '8',
  clockMinute: '0',
  unknownTime: false,
  province: '',
  city: '',
  longitude: 120,
  gender: 'male' as const,
};

const known = formToBirthInfo(base);
assert.equal(known.unknownTime, false);
assert.equal(known.hour, 4);

const unknown = formToBirthInfo({ ...base, unknownTime: true, clockHour: '23' });
assert.equal(unknown.unknownTime, true);
assert.equal(unknown.hour, 0);
assert.deepEqual([unknown.year, unknown.month, unknown.day], [2000, 4, 15]);

const lateZi = formToBirthInfo({ ...base, year: '2000', month: '12', day: '31', clockHour: '23', clockMinute: '30' });
assert.deepEqual([lateZi.year, lateZi.month, lateZi.day], [2001, 1, 1]);
assert.equal(lateZi.hour, 0);

const earlyZi = formToBirthInfo({ ...base, clockHour: '0', clockMinute: '30' });
assert.deepEqual([earlyZi.year, earlyZi.month, earlyZi.day], [2000, 4, 15]);
assert.equal(earlyZi.hour, 0);

console.log('紫微出生信息归一化测试通过');
