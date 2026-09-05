import ChartDestinationPicker from '@/components/ChartDestinationPicker';
import { isWorkspaceDestination } from '@/lib/ui/workspace-navigation';

export default async function ChartSelectPage({ searchParams }: {
  searchParams: Promise<{ target?: string }>;
}) {
  const { target } = await searchParams;
  return <ChartDestinationPicker target={isWorkspaceDestination(target) ? target : 'reports'} />;
}
