'use client';

import { useMemo, useState } from 'react';
import {
  CalendarBlank,
  Clock,
  LockKey,
  MapPin,
  SpinnerGap,
  User,
} from '@phosphor-icons/react';
import { PROVINCES } from '@/lib/ziwei/cities';
import type { BirthInfo } from '@/lib/ziwei/types';
import styles from './HomeBirthForm.module.css';

interface HomeBirthFormProps {
  loading?: boolean;
  error?: string;
  onSubmit: (birthInfo: BirthInfo) => void;
}

interface FormState {
  name: string;
  gender: 'male' | 'female';
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  birthTime: string;
  unknownTime: boolean;
  province: string;
  city: string;
  longitude: number;
}

const BRANCH_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const MIN_BIRTH_YEAR = 1900;
const MAX_BIRTH_YEAR = new Date().getFullYear();
const BIRTH_YEAR_OPTIONS = Array.from(
  { length: MAX_BIRTH_YEAR - MIN_BIRTH_YEAR + 1 },
  (_, index) => MAX_BIRTH_YEAR - index,
);
const BIRTH_MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const BIRTH_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const BIRTH_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

function getDaysInMonth(year: string, month: string): number {
  if (!year || !month) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

function formatBirthDate(year: string, month: string, day: string): string {
  if (!year || !month || !day) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function calculateTrueSolarBranch(clockHour: number, clockMinute: number, longitude: number): number {
  const clockMinutes = clockHour * 60 + clockMinute;
  const longitudeOffset = (longitude - 120) * 4;
  const solarMinutes = ((clockMinutes + longitudeOffset) % 1440 + 1440) % 1440;
  if (solarMinutes >= 1380 || solarMinutes < 60) return 0;
  return Math.floor((solarMinutes - 60) / 120) + 1;
}

export default function HomeBirthForm({ loading = false, error = '', onSubmit }: HomeBirthFormProps) {
  const [form, setForm] = useState<FormState>({
    name: '',
    gender: 'male',
    birthYear: '',
    birthMonth: '',
    birthDay: '',
    birthTime: '08:00',
    unknownTime: false,
    province: '',
    city: '',
    longitude: 120,
  });
  const [validationError, setValidationError] = useState('');

  const birthDayCount = useMemo(
    () => getDaysInMonth(form.birthYear, form.birthMonth),
    [form.birthMonth, form.birthYear],
  );
  const [birthHour, birthMinute] = form.birthTime.split(':');

  const cityList = useMemo(() => (
    PROVINCES.find(province => province.name === form.province)?.cities ?? []
  ), [form.province]);

  const trueSolarBranch = useMemo(() => {
    if (form.unknownTime) return 0;
    const [hour, minute] = form.birthTime.split(':').map(Number);
    return calculateTrueSolarBranch(hour || 0, minute || 0, form.longitude);
  }, [form.birthTime, form.longitude, form.unknownTime]);

  const handleProvinceChange = (provinceName: string) => {
    const province = PROVINCES.find(item => item.name === provinceName);
    const firstCity = province?.cities[0];
    setForm(current => ({
      ...current,
      province: provinceName,
      city: firstCity?.name ?? '',
      longitude: firstCity?.longitude ?? 120,
    }));
  };

  const handleCityChange = (cityName: string) => {
    const city = cityList.find(item => item.name === cityName);
    setForm(current => ({
      ...current,
      city: cityName,
      longitude: city?.longitude ?? 120,
    }));
  };

  const handleBirthDatePartChange = (
    field: 'birthYear' | 'birthMonth' | 'birthDay',
    value: string,
  ) => {
    setValidationError('');
    setForm(current => {
      const next = { ...current, [field]: value };
      const maximumDay = getDaysInMonth(next.birthYear, next.birthMonth);
      if (Number(next.birthDay) > maximumDay) next.birthDay = String(maximumDay);
      return next;
    });
  };

  const handleBirthTimePartChange = (field: 'hour' | 'minute', value: string) => {
    setValidationError('');
    setForm(current => {
      const [currentHour = '08', currentMinute = '00'] = current.birthTime.split(':');
      return {
        ...current,
        birthTime: field === 'hour'
          ? `${value}:${currentMinute}`
          : `${currentHour}:${value}`,
      };
    });
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError('');

    const submittedForm = new FormData(event.currentTarget);
    const birthDate = formatBirthDate(
      String(submittedForm.get('birthYear') || ''),
      String(submittedForm.get('birthMonth') || ''),
      String(submittedForm.get('birthDay') || ''),
    );
    const submittedHour = String(submittedForm.get('birthHour') || birthHour);
    const submittedMinute = String(submittedForm.get('birthMinute') || birthMinute);
    const birthTime = `${submittedHour}:${submittedMinute}`;
    const [year, month, day] = birthDate.split('-').map(Number);
    if (!year || !month || !day) {
      setValidationError('请选择完整的出生日期');
      return;
    }

    if (!form.unknownTime && !birthTime) {
      setValidationError('请选择出生时间，或勾选时辰不详');
      return;
    }

    onSubmit({
      year,
      month,
      day,
      hour: trueSolarBranch,
      gender: form.gender,
      name: form.name.trim() || undefined,
      province: form.province || undefined,
      city: form.city || undefined,
      longitude: form.province ? form.longitude : undefined,
    });
  };

  return (
    <form id="home-chart-form" className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.heading}>
        <p>建立命档</p>
        <h2>开始你的命盘</h2>
        <span>填写准确出生信息，生成专属命盘</span>
      </div>

      <div className={styles.field}>
        <label htmlFor="home-name">姓名 <span>选填</span></label>
        <div className={styles.control}>
          <User size={17} aria-hidden="true" />
          <input
            id="home-name"
            type="text"
            value={form.name}
            onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
            placeholder="请输入姓名"
            autoComplete="name"
          />
        </div>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>性别</legend>
        <div className={styles.genderGroup}>
          {(['male', 'female'] as const).map(gender => (
            <button
              key={gender}
              type="button"
              className={form.gender === gender ? styles.genderActive : styles.gender}
              aria-pressed={form.gender === gender}
              onClick={() => setForm(current => ({ ...current, gender }))}
            >
              {gender === 'male' ? '男' : '女'}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={`${styles.fieldset} ${styles.birthDateFieldset}`}>
        <legend id="home-birth-date-label">出生日期 <span>公历</span></legend>
        <div className={styles.birthDateGrid} role="group" aria-labelledby="home-birth-date-label" aria-describedby="home-birth-date-help">
          <div className={`${styles.control} ${styles.birthDateControl}`}>
            <CalendarBlank size={17} aria-hidden="true" />
            <select
              id="home-birth-year"
              name="birthYear"
              aria-label="出生年份"
              value={form.birthYear}
              onChange={event => handleBirthDatePartChange('birthYear', event.target.value)}
            >
              <option value="">年份</option>
              {BIRTH_YEAR_OPTIONS.map(year => <option key={year} value={year}>{year} 年</option>)}
            </select>
          </div>
          <div className={`${styles.control} ${styles.birthDateControl} ${!form.birthYear ? styles.controlDisabled : ''}`}>
            <select
              id="home-birth-month"
              name="birthMonth"
              aria-label="出生月份"
              value={form.birthMonth}
              onChange={event => handleBirthDatePartChange('birthMonth', event.target.value)}
              disabled={!form.birthYear}
            >
              <option value="">月份</option>
              {BIRTH_MONTH_OPTIONS.map(month => <option key={month} value={month}>{month} 月</option>)}
            </select>
          </div>
          <div className={`${styles.control} ${styles.birthDateControl} ${!form.birthMonth ? styles.controlDisabled : ''}`}>
            <select
              id="home-birth-day"
              name="birthDay"
              aria-label="出生日期"
              value={form.birthDay}
              onChange={event => handleBirthDatePartChange('birthDay', event.target.value)}
              disabled={!form.birthMonth}
            >
              <option value="">日期</option>
              {Array.from({ length: birthDayCount }, (_, index) => index + 1).map(day => (
                <option key={day} value={day}>{day} 日</option>
              ))}
            </select>
          </div>
        </div>
        <p id="home-birth-date-help" className={styles.fieldHelp}>先选年份，再选择月份和日期</p>
      </fieldset>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label htmlFor="home-birth-time">出生时间 <span>北京时间</span></label>
          <label className={styles.unknownTime}>
            <input
              type="checkbox"
              checked={form.unknownTime}
              onChange={event => {
                setValidationError('');
                setForm(current => ({ ...current, unknownTime: event.target.checked }));
              }}
            />
            时辰不详
          </label>
        </div>
        <div className={`${styles.control} ${styles.timeControl} ${form.unknownTime ? styles.controlDisabled : ''}`}>
          <Clock size={17} aria-hidden="true" />
          <select
            id="home-birth-time"
            name="birthHour"
            aria-label="出生小时"
            value={birthHour}
            onChange={event => handleBirthTimePartChange('hour', event.target.value)}
            disabled={form.unknownTime}
          >
            {BIRTH_HOUR_OPTIONS.map(hour => <option key={hour} value={hour}>{hour} 时</option>)}
          </select>
          <span className={styles.timeSeparator} aria-hidden="true">:</span>
          <select
            name="birthMinute"
            aria-label="出生分钟"
            value={birthMinute}
            onChange={event => handleBirthTimePartChange('minute', event.target.value)}
            disabled={form.unknownTime}
          >
            {BIRTH_MINUTE_OPTIONS.map(minute => <option key={minute} value={minute}>{minute} 分</option>)}
          </select>
          <span className={styles.solarTime}>真太阳时：{BRANCH_NAMES[trueSolarBranch]}时</span>
        </div>
      </div>

      <div className={styles.field}>
        <label>出生地区 <span>用于真太阳时校正</span></label>
        <div className={styles.locationGrid}>
          <div className={styles.control}>
            <MapPin size={17} aria-hidden="true" />
            <select
              aria-label="出生省份"
              value={form.province}
              onChange={event => handleProvinceChange(event.target.value)}
            >
              <option value="">省份或直辖市</option>
              {PROVINCES.map(province => (
                <option key={province.name} value={province.name}>{province.name}</option>
              ))}
            </select>
          </div>
          <div className={`${styles.control} ${!form.province ? styles.controlDisabled : ''}`}>
            <select
              aria-label="出生城市"
              value={form.city}
              onChange={event => handleCityChange(event.target.value)}
              disabled={!form.province}
            >
              <option value="">{form.province ? '选择城市' : '请先选择省份'}</option>
              {cityList.map(city => (
                <option key={city.name} value={city.name}>{city.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {(validationError || error) && (
        <p className={styles.error} role="alert">{validationError || error}</p>
      )}

      <button className={styles.submit} type="submit" disabled={loading}>
        {loading ? <SpinnerGap className={styles.spinner} size={20} aria-hidden="true" /> : null}
        {loading ? '正在生成命盘' : '生成命盘'}
      </button>

      <p className={styles.privacy}>
        <LockKey size={14} aria-hidden="true" />
        出生信息和对话记录仅保存在本地数据库
      </p>
    </form>
  );
}
