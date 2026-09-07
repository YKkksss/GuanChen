'use client';

import { useMemo, useState } from 'react';
import {
  LockKey,
  MapPin,
  SpinnerGap,
  User,
} from '@phosphor-icons/react';
import { BirthDateFields, BirthTimeFields } from './BirthDateTimeFields';
import { isCompleteBirthTime } from '@/lib/birth-form';
import { PROVINCES } from '@/lib/ziwei/cities';
import { calcTrueSolarBranch, formToBirthInfo } from '@/lib/ziwei/share';
import type { BirthInfo } from '@/lib/ziwei/types';
import styles from './HomeBirthForm.module.css';

interface HomeBirthFormProps {
  loading?: boolean;
  error?: string;
  variant?: 'home' | 'workbench';
  onSubmit: (birthInfo: BirthInfo) => void;
}

interface FormState {
  name: string;
  gender: '' | 'male' | 'female';
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
function formatBirthDate(year: string, month: string, day: string): string {
  if (!year || !month || !day) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export default function HomeBirthForm({ loading = false, error = '', variant = 'home', onSubmit }: HomeBirthFormProps) {
  const [form, setForm] = useState<FormState>({
    name: '',
    gender: '',
    birthYear: '',
    birthMonth: '',
    birthDay: '',
    birthTime: '',
    unknownTime: false,
    province: '',
    city: '',
    longitude: 120,
  });
  const [validationError, setValidationError] = useState('');

  const [birthHour = '', birthMinute = ''] = form.birthTime.split(':');

  const cityList = useMemo(() => (
    PROVINCES.find(province => province.name === form.province)?.cities ?? []
  ), [form.province]);

  const trueSolarBranch = useMemo(() => {
    if (form.unknownTime) return 0;
    const [hour, minute] = form.birthTime.split(':').map(Number);
    return calcTrueSolarBranch(hour || 0, minute || 0, form.longitude);
  }, [form.birthTime, form.longitude, form.unknownTime]);

  const handleProvinceChange = (provinceName: string) => {
    setForm(current => ({
      ...current,
      province: provinceName,
      city: '',
      longitude: 120,
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

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError('');

    const birthDate = formatBirthDate(form.birthYear, form.birthMonth, form.birthDay);
    const submittedHour = birthHour;
    const submittedMinute = birthMinute;
    const birthTime = form.birthTime;
    const [year, month, day] = birthDate.split('-').map(Number);
    if (!year || !month || !day) {
      setValidationError('请选择完整的出生日期');
      return;
    }

    if (!form.unknownTime && !isCompleteBirthTime(birthTime)) {
      setValidationError('请选择出生时间，或勾选时辰不详');
      return;
    }

    if (form.province && !form.city) {
      setValidationError('请选择出生城市，或清空省份按北京时间排盘');
      return;
    }
    if (!form.gender) { setValidationError('请选择性别'); return; }
    onSubmit(formToBirthInfo({
      year: String(year),
      month: String(month),
      day: String(day),
      clockHour: submittedHour,
      clockMinute: submittedMinute,
      unknownTime: form.unknownTime,
      gender: form.gender,
      name: form.name.trim(),
      province: form.province,
      city: form.city,
      longitude: form.longitude,
    }));
  };

  return (
    <form id="home-chart-form" className={`${styles.form} ${variant === 'workbench' ? styles.workbench : ''}`} onSubmit={submit} noValidate>
      {variant === 'home' && (
        <div className={styles.heading}>
          <p>建立命档</p>
          <h2>开始你的命盘</h2>
          <span>填写准确出生信息，生成专属命盘</span>
        </div>
      )}

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
        <BirthDateFields value={formatBirthDate(form.birthYear, form.birthMonth, form.birthDay) || [form.birthYear, form.birthMonth, form.birthDay].join('-')} maxYear={new Date().getFullYear()} onChange={value => {
          const [birthYear, birthMonth, birthDay] = value.split('-');
          setValidationError('');
          setForm(current => ({ ...current, birthYear, birthMonth, birthDay }));
        }} />
        <p id="home-birth-date-help" className={styles.fieldHelp}>先选年份，再选择月份和日期</p>
      </fieldset>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label >出生时间 <span>北京时间</span></label>
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
        <BirthTimeFields value={form.birthTime} disabled={form.unknownTime} onChange={birthTime => {
          setValidationError('');
          setForm(current => ({ ...current, birthTime }));
        }} />
        <p className={styles.fieldHelp}>{form.unknownTime ? '暂按子时试排' : isCompleteBirthTime(form.birthTime) ? (form.city ? '经度校正后：' : '北京时间：') + BRANCH_NAMES[trueSolarBranch] + '时' : '请选择小时与分钟，或勾选时辰不详'}</p>
        {form.unknownTime && (
          <p className={styles.timePolicy} role="status">当前暂按子时生成试排盘，并会在档案中保留“时辰未知”标记；建议结合生时校正后再作深入分析。</p>
        )}
        {!form.unknownTime && birthHour === '23' && (
          <p className={styles.timePolicy}>晚子时采用 23:00 起按次日排盘的统一口径。</p>
        )}
      </div>

      <div className={styles.field}>
        <label>出生地区 <span>选填，用于经度校正</span></label>
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

      {!form.province && <p className={styles.fieldHelp}>未填写地区时按北京时间排盘，不进行出生地经度校正。</p>}

      {(validationError || error) && (
        <p className={styles.error} role="alert">{validationError || error}</p>
      )}

      <button className={styles.submit} type="submit" disabled={loading}>
        {loading ? <SpinnerGap className={styles.spinner} size={20} aria-hidden="true" /> : null}
        {loading ? '正在生成命盘' : '生成命盘'}
      </button>

      <p className={styles.privacy}>
        <LockKey size={14} aria-hidden="true" />
        出生信息和对话记录保存在部署电脑，局域网访问者共享该数据
      </p>
    </form>
  );
}
