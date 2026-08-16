import type { Metadata } from 'next';
import LearningCenterWorkspace from '@/components/LearningCenterWorkspace';

export const metadata: Metadata = {
  title: '紫微学习中心 · 命盘结构入门',
  description: '按照可追溯的课程路径学习宫位、命身宫、星曜、三方四正、四化、空宫与运限层级。',
};

export default function LearnPage() {
  return <LearningCenterWorkspace />;
}
