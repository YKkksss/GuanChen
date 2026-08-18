import type { Metadata } from 'next';
import CaseLibraryWorkspace from '@/components/CaseLibraryWorkspace';

export const metadata: Metadata = {
  title: '匿名案例库 · 本地命盘教学案例',
  description: '在明确授权和字段脱敏预览后，将本地命盘整理为可追溯的匿名教学案例。',
};

export default function CasesPage() {
  return <CaseLibraryWorkspace />;
}
