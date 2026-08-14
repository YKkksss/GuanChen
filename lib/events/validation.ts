import {
  LIFE_EVENT_CATEGORIES,
  type LifeEventCategory,
  type LifeEventDatePrecision,
  type LifeEventInput,
} from './types';

const PRECISIONS = new Set<LifeEventDatePrecision>(['day', 'month', 'year', 'range', 'unknown']);

export function parseLifeEventInput(body: Record<string, unknown>): LifeEventInput {
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 100) : '';
  if (!title) throw new Error('事件标题不能为空');
  const category = typeof body.category === 'string' && LIFE_EVENT_CATEGORIES.includes(body.category as LifeEventCategory)
    ? body.category as LifeEventCategory
    : null;
  if (!category) throw new Error('事件类型不正确');
  const customCategory = typeof body.customCategory === 'string'
    ? body.customCategory.trim().slice(0, 40) || null
    : null;
  if (category === 'custom' && !customCategory) throw new Error('请填写自定义事件类型');

  const datePrecision = typeof body.datePrecision === 'string' && PRECISIONS.has(body.datePrecision as LifeEventDatePrecision)
    ? body.datePrecision as LifeEventDatePrecision
    : null;
  if (!datePrecision) throw new Error('日期精度不正确');
  const startDate = typeof body.startDate === 'string' ? body.startDate.trim() : '';
  const endDate = typeof body.endDate === 'string' ? body.endDate.trim() || null : null;
  validateDates(datePrecision, startDate, endDate);

  const impactLevel = Number(body.impactLevel);
  if (!Number.isInteger(impactLevel) || impactLevel < 1 || impactLevel > 5) {
    throw new Error('影响程度必须在 1 至 5 之间');
  }
  const description = typeof body.description === 'string'
    ? body.description.trim().slice(0, 2_000) || null
    : null;

  return {
    title,
    category,
    customCategory,
    startDate,
    endDate,
    datePrecision,
    description,
    impactLevel: impactLevel as 1 | 2 | 3 | 4 | 5,
    source: 'user_input',
    sourceMessageId: null,
    confirmedByUser: true,
  };
}

function validateDates(
  precision: LifeEventDatePrecision,
  startDate: string,
  endDate: string | null,
) {
  if (precision === 'unknown') {
    if (startDate || endDate) throw new Error('日期不详时不应填写日期');
    return;
  }
  const pattern = precision === 'year'
    ? /^\d{4}$/
    : precision === 'month'
      ? /^\d{4}-(0[1-9]|1[0-2])$/
      : /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
  if (!pattern.test(startDate) || !isRealDate(startDate)) throw new Error('开始日期格式或日期值不正确');
  if (precision === 'range') {
    if (!endDate || !pattern.test(endDate) || !isRealDate(endDate)) throw new Error('日期范围需要有效的结束日期');
    if (endDate < startDate) throw new Error('结束日期不能早于开始日期');
  } else if (endDate) {
    throw new Error('只有日期范围可以填写结束日期');
  }
}

function isRealDate(value: string): boolean {
  if (/^\d{4}$/.test(value)) return Number(value) >= 1800 && Number(value) <= 2200;
  if (/^\d{4}-\d{2}$/.test(value)) return true;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
