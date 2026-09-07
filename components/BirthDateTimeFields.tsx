'use client';

import { useId, useState } from 'react';
import { changeBirthDate, daysInBirthMonth } from '@/lib/birth-form';
import styles from './HomeBirthForm.module.css';

export function BirthDateFields({ value, onChange, maxYear = 2100 }: {
  value: string; onChange: (value: string) => void; maxYear?: number;
}) {
  const id = useId();
  const [notice, setNotice] = useState('');
  const [year = '', month = '', day = ''] = value.split('-');
  const change = (index: number, part: string) => {
    const next = changeBirthDate(value, index, part);
    setNotice(next.clearedDay ? '原日期在所选年月不存在，已清空日期，请重新选择。' : '');
    onChange(next.value);
  };
  return <div>
    <div className={styles.birthDateGrid} role="group" aria-label="出生日期（公历）" aria-describedby={notice ? id : undefined}>
      {[{ label: '出生年份', value: year, placeholder: '年份', count: maxYear - 1899, disabled: false },
        { label: '出生月份', value: month, placeholder: '月份', count: 12, disabled: !year },
        { label: '出生日期', value: day, placeholder: '日期', count: daysInBirthMonth(year, month), disabled: !year || !month }].map((field, index) => (
        <div className={`${styles.control} ${styles.birthDateControl}`} key={field.label}>
          <select aria-label={field.label} required value={field.value} disabled={field.disabled} onChange={event => change(index, event.target.value)}>
            <option value="">{field.placeholder}</option>
            {Array.from({ length: field.count }, (_, i) => index === 0 ? maxYear - i : i + 1).map(number => {
              const option = index === 0 ? String(number) : String(number).padStart(2, '0');
              return <option key={option} value={option}>{number}{[' 年', ' 月', ' 日'][index]}</option>;
            })}
          </select>
        </div>
      ))}
    </div>
    {notice && <p id={id} role="status" className={styles.fieldHelp}>{notice}</p>}
  </div>;
}

export function BirthTimeFields({ value, onChange, disabled = false, label = '出生' }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; label?: string;
}) {
  const [hour = '', minute = ''] = value.split(':');
  return <div className={`${styles.control} ${styles.timeControl}`} role="group" aria-label={`${label}时间`}>
    <select aria-label={`${label}小时`} required={!disabled} value={hour} disabled={disabled} onChange={event => onChange(`${event.target.value}:${minute}`)}>
      <option value="">小时</option>
      {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(item => <option key={item} value={item}>{item} 时</option>)}
    </select>
    <span aria-hidden="true">:</span>
    <select aria-label={`${label}分钟`} required={!disabled} value={minute} disabled={disabled} onChange={event => onChange(`${hour}:${event.target.value}`)}>
      <option value="">分钟</option>
      {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(item => <option key={item} value={item}>{item} 分</option>)}
    </select>
  </div>;
}
