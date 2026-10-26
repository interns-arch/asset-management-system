import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import type { Allocation } from '@/lib/types';
import { formatDate } from '@/lib/utils';

/** The assignee confirms they received an item; IT and whoever assigned it then see it as accepted. */
export function AcceptButton({ allocationId, assetName, size = 'sm' }: { allocationId: string; assetName?: string; size?: 'sm' | 'xs' }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.post(`/assets/allocations/${allocationId}/accept`, {}),
    onSuccess: () => {
      toast.success(assetName ? `${assetName} accepted` : 'Accepted');
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['asset'] });
      void qc.invalidateQueries({ queryKey: ['history'] });
      void qc.invalidateQueries({ queryKey: ['employee'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Button size={size} onClick={() => m.mutate()} loading={m.isPending}>
      <Check /> Accept
    </Button>
  );
}

export function AcceptanceBadge({ allocation }: { allocation: Pick<Allocation, 'acceptance' | 'acceptedAt'> }) {
  if (allocation.acceptance === 'PENDING') return <Badge tone="amber">Waiting for acceptance</Badge>;
  if (allocation.acceptance === 'ACCEPTED') return <Badge tone="green">Accepted{allocation.acceptedAt ? ` ${formatDate(allocation.acceptedAt)}` : ''}</Badge>;
  return null;
}
