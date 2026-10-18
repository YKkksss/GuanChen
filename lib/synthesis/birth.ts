import { calculateBazi } from '@/lib/bazi/engine';
import { generateChart } from '@/lib/ziwei/algorithm';
import { shiftCalendarDay } from '@/lib/fortune-calendar/dates';
import { BRANCHES } from '@/lib/ziwei/constants';
import { SYNTHESIS_POLICY_VERSION, type SynthesisCalculated, type SynthesisInput } from './types';
export function calculateSynthesisBirth(raw: unknown): SynthesisCalculated {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('请提交有效的出生资料');
  const v = raw as Record<string, unknown>;
  if (typeof v.displayName !== 'string' || !v.displayName.trim() || v.displayName.trim().length > 80) throw new Error('请填写 1–80 字的命盘名称');
  if (typeof v.birthDate !== 'string' || (v.birthTime !== undefined && typeof v.birthTime !== 'string') || (v.gender !== 'male' && v.gender !== 'female') || (v.unknownTime !== undefined && typeof v.unknownTime !== 'boolean')) throw new Error('出生日期、时间或性别格式不正确');
  if (v.timeZoneId !== undefined && v.timeZoneId !== 'Etc/GMT-8') throw new Error('合参第一版按北京时间标准时（UTC+08:00）录入，请先换算其他时区记录');
  if (v.timeStandard !== undefined && v.timeStandard !== 'civil_time' && v.timeStandard !== 'apparent_solar_time') throw new Error('时间标准不正确');
  if (v.lateZiPolicy !== undefined && v.lateZiPolicy !== 'same_day' && v.lateZiPolicy !== 'next_day') throw new Error('晚子时口径不正确');
  if (v.longitude !== undefined && (typeof v.longitude !== 'number' || !Number.isFinite(v.longitude) || v.longitude < -180 || v.longitude > 180)) throw new Error('经度应在 -180 至 180 之间');
  if (v.sourceConversationId !== undefined && (typeof v.sourceConversationId !== 'string' || v.sourceConversationId.length > 100)) throw new Error('来源命盘标识不正确');
  const unknownTime = v.unknownTime === true;
  if (unknownTime && v.timeStandard === 'apparent_solar_time') throw new Error('时辰未知时不依据假定时间进行太阳时换算，请使用北京时间标准时');
  const bazi = calculateBazi({ birthDate: v.birthDate.trim(), birthTime: unknownTime ? undefined : (v.birthTime as string | undefined), gender: v.gender, unknownTime, timeZoneId: 'Etc/GMT-8', longitude: v.longitude as number | undefined, timeStandard: (v.timeStandard as SynthesisInput['timeStandard']) ?? 'civil_time', lateZiPolicy: (v.lateZiPolicy as SynthesisInput['lateZiPolicy']) ?? 'next_day' });
  const hour = Number(bazi.effectiveTime.time.slice(0, 2));
  const branch = unknownTime ? 0 : Math.floor((hour + 1) / 2) % 12;
  const rollover = !unknownTime && hour === 23 && bazi.input.lateZiPolicy === 'next_day';
  const ziweiDate = rollover ? shiftCalendarDay(bazi.effectiveTime.date, 1) : unknownTime ? bazi.input.birthDate : bazi.effectiveTime.date;
  const [year, month, day] = ziweiDate.split('-').map(Number);
  if (year < 1900 || year > 2100) throw new Error('校正或晚子时换日越出 1900–2100 年排盘范围，请核对资料');
  const input: SynthesisInput = { displayName: v.displayName.trim(), birthDate: bazi.input.birthDate, ...(bazi.input.birthTime ? { birthTime: bazi.input.birthTime } : {}), gender: bazi.input.gender, unknownTime, timeZoneId: 'Etc/GMT-8', ...(bazi.input.longitude !== null ? { longitude: bazi.input.longitude } : {}), timeStandard: bazi.input.timeStandard, lateZiPolicy: bazi.input.lateZiPolicy, ...(v.sourceConversationId ? { sourceConversationId: v.sourceConversationId as string } : {}) };
  const ziweiBirth = { year, month, day, hour: branch, gender: bazi.input.gender, name: input.displayName, unknownTime, ...(input.longitude !== undefined ? { longitude: input.longitude } : {}) };
  const warnings = ['紫微按农历出生日期与时辰定位，八字年柱按立春、月柱按精确节界定位，年/月标签不要求一致。', '两套体系基于同一份出生资料，共同观察不构成独立的事实互证。', ...(rollover ? ['有效时刻在 23 点且选择次日口径，紫微按次日早子时起盘；八字保留有效时刻并采用次日日柱。'] : []), ...(unknownTime ? ['出生时辰未知：紫微仅作子时试排，八字省略时柱且以日间代表点定位其他柱，年/月/日边界仍可能受真实时刻影响。'] : []), ...(bazi.input.timeStandard === 'apparent_solar_time' ? ['两盘共用一次精细太阳时换算，不再次叠加经度修正；可能与旧紫微入口的简化校正结果不同。'] : []), ...bazi.warnings];
  return { input, ziweiBirth, ziwei: generateChart(ziweiBirth), bazi, policy: { version: SYNTHESIS_POLICY_VERSION, timezoneLabel: '北京时间标准时 · UTC+08:00', effectiveDate: bazi.effectiveTime.date, effectiveTime: unknownTime ? '未知' : bazi.effectiveTime.time, ziweiDate, ziweiHour: branch, ziweiTimeLabel: unknownTime ? '子时试排' : hour === 23 ? '晚子时' : hour === 0 ? '早子时' : `${BRANCHES[branch]}时`, lateZiRollover: rollover, timeStandard: bazi.input.timeStandard, unknownTime, warnings } };
}
