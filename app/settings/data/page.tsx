import type { Metadata } from 'next';
import DataBackupWorkspace from '@/components/DataBackupWorkspace';

export const metadata: Metadata = {
  title: '本地数据备份 · 观辰',
  description: '导出、预检并安全恢复紫微命盘的完整本地档案。',
};

export default function LocalDataBackupPage() {
  return <DataBackupWorkspace />;
}
