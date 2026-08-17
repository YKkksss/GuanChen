import type { Metadata } from 'next';
import OpenEndedPracticeWorkspace from '@/components/OpenEndedPracticeWorkspace';

export const metadata: Metadata = {
  title: '开放式命盘解读训练 · 紫微学习',
  description: '基于真实命盘、固定评分量表和可审计 AI 反馈的开放式解盘训练。',
};

export default function OpenEndedPracticePage() {
  return <OpenEndedPracticeWorkspace />;
}
