import type { Metadata } from 'next';
import CaseCreationWorkspace from '@/components/CaseCreationWorkspace';

export const metadata: Metadata = {
  title: '创建匿名案例 · 字段脱敏预览',
  description: '选择本地命盘，核对脱敏字段并明确授权范围后保存匿名案例。',
};

export default function NewCasePage() {
  return <CaseCreationWorkspace />;
}
