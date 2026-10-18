/** 日期运算使用 UTC 日历字段，今日使用北京时间，不依赖访问设备的时区。 */
export function beijingToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function parseCalendarMonth(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error('月份必须使用 YYYY-MM 格式');
  const year = Number(match[1]), number = Number(match[2]);
  if (year < 1900 || year > 2200 || number < 1 || number > 12) throw new Error('月份不在支持范围内');
  return { year, month: number, days: new Date(Date.UTC(year, number, 0)).getUTCDate() };
}
export function validateCalendarDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期必须使用 YYYY-MM-DD 格式');
  const month = parseCalendarMonth(date.slice(0, 7));
  const day = Number(date.slice(8));
  if (day < 1 || day > month.days) throw new Error('日期不存在');
  return date;
}
export function shiftCalendarMonth(month: string, offset: number): string {
  const parsed = parseCalendarMonth(month);
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function shiftCalendarDay(date: string, offset: number): string {
  validateCalendarDate(date);
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
export function clampCalendarDate(date: string, min: string, max: string) { return date < min ? min : date > max ? max : date; }
