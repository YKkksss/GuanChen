'use client';

import { QIMEN_SCENARIOS, type QimenScenarioKey } from '@/lib/qimen/scenario-types';
import styles from './QimenScenarioPanel.module.css';

export default function QimenScenarioSettings({ value, onChange }: {
  value: QimenScenarioKey;
  onChange: (value: QimenScenarioKey) => void;
}) {
  return <div className={styles.settings}>
    <label>占类条件复核<select aria-label="占类条件复核" value={value} onChange={event => onChange(event.target.value as QimenScenarioKey)}>
      {Object.entries(QIMEN_SCENARIOS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>
    <p className={styles.note}>按这次占问明确选择占类，分别核对角色与条件。占类独立于参考对象，不改变九宫排法，也不自动给出吉凶或分数。</p>
  </div>;
}
