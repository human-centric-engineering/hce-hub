import { Badge } from '@/components/ui/badge';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  planning: 'secondary',
  archived: 'outline',
};

/** Quiet status pill for a project (§13.5 — no traffic-light overload). */
export function ProjectStatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>{status}</Badge>;
}
