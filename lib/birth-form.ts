/** 仅校验用户填写的公历日期，不自动修正为另一天。 */
export function daysInBirthMonth(year: string, month: string): number {
  if (!year || !month) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

export function changeBirthDate(value: string, index: number, nextPart: string): { value: string; clearedDay: boolean } {
  const parts = value.split('-');
  while (parts.length < 3) parts.push('');
  parts[index] = nextPart;
  const clearedDay = Boolean(parts[2]) && (!parts[0] || !parts[1] || Number(parts[2]) > daysInBirthMonth(parts[0], parts[1]));
  if (clearedDay) parts[2] = '';
  return { value: parts.join('-'), clearedDay };
}

export function isCompleteBirthTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
