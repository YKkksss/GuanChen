import type { Metadata } from 'next';
import ReminderCenterWorkspace from '@/components/ReminderCenterWorkspace';

export const metadata: Metadata = {
  title: '本地提醒中心 · 紫微命盘',
  description: '管理月度复盘、生日回顾、流年大限、人生事件周年和自定义本地提醒。',
};

export default function RemindersPage() {
  return <ReminderCenterWorkspace />;
}
