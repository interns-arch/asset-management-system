import { ONBOARDING_STATUS_LABELS } from '@eam/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Circle, Gift, IdCard, KeyRound, MoreHorizontal, PackageCheck, Plus, Save, Send, Trash2, Undo2, UserCheck, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { EnumBadge } from '@/components/common/badges';
import { useConfirm } from '@/components/common/confirm';
import { Field } from '@/components/common/form';
import { ErrorState, PageLoader } from '@/components/common/page';
import { PhotoPicker, uploadPhotos } from '@/components/common/photos';
import { Combobox, EntityPicker } from '@/components/common/pickers';
import { Timeline } from '@/components/common/timeline';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/overlays';
import { Avatar, Badge, Card, CardContent, CardHeader, CardTitle, Progress } from '@/components/ui/primitives';
import { api, errorMessage, type Page } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AssetIcon } from '@/lib/icons';
import { invalidateAssetData, queryClient, useAssetTypes } from '@/lib/queries';
import { ONBOARDING_ITEM_TONE, ONBOARDING_TONE } from '@/lib/status';
import type { HistoryEvent, OnboardingDetail, OnboardingItem, OnboardingKit } from '@/lib/types';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { JoinsIn } from './onboarding-page';

export default function OnboardingDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const confirm = useConfirm();
  const manage = can('onboarding:manage');
  const it = can('asset:assign');
  const [pickFor, setPickFor] = useState<OnboardingItem | null>(null);
  const [issueFor, setIssueFor] = useState<OnboardingItem | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const q = useQuery({ queryKey: ['onboarding-case', id], queryFn: () => api.get<OnboardingDetail>(`/onboarding/${id}`) });
  const history = useQuery({ queryKey: ['history', 'onboarding', id], queryFn: () => api.get<Page<HistoryEvent>>(`/onboarding/${id}/history`), enabled: !!q.data });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['onboarding-case', id] }),
      queryClient.invalidateQueries({ queryKey: ['onboarding'] }),
      queryClient.invalidateQueries({ queryKey: ['history', 'onboarding', id] }),
      queryClient.invalidateQueries({ queryKey: ['queue'] }),
    ]);
  const act = useMutation({
    mutationFn: ({ path, body, method = 'post' }: { path: string; body?: unknown; method?: 'post' | 'patch' | 'del' }) =>
      method === 'patch' ? api.patch(`/onboarding/${id}${path}`, body ?? {}) : method === 'del' ? api.del(`/onboarding/${id}${path}`) : api.post(`/onboarding/${id}${path}`, body ?? {}),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;
  const open = o.status === 'DRAFT' || o.status === 'SUBMITTED';
  const done = o.counts.prepared + o.counts.issued + o.counts.skipped;
  const leftovers = o.counts.planned + o.counts.prepared;

  const send = () => act.mutate({ path: '/submit' }, { onSuccess: () => toast.success('Sent to IT', { description: 'They’ve been notified to prepare everything.' }) });
  const issueAll = () =>
    act.mutate(
      { path: '/issue-prepared' },
      {
        onSuccess: async (r) => {
          const res = r as { issued: number; results: { ok: boolean; itemName: string; error?: string }[] };
          await invalidateAssetData();
          if (res.issued) toast.success(`${res.issued} item${res.issued > 1 ? 's' : ''} handed over to ${o.employee.fullName}`);
          const failed = res.results.filter((x) => !x.ok);
          if (failed.length) toast.error(`${failed.length} could not be issued`, { description: failed.map((f) => `${f.itemName}: ${f.error}`).join('\n') });
        },
      },
    );
  const markJoined = async () => {
    const res = await confirm({
      title: `Mark ${o.employee.fullName} as joined?`,
      description: leftovers
        ? `${leftovers} item${leftovers > 1 ? 's have' : ' has'} not been given yet — ${leftovers > 1 ? 'they' : 'it'} will be added to Requests (approved) so IT can still give ${leftovers > 1 ? 'them' : 'it'}.`
        : 'Their status becomes Active.',
      confirmText: 'Mark joined',
    });
    if (res.confirmed)
      act.mutate(
        { path: '/complete' },
        {
          onSuccess: async (r) => {
            await invalidateAssetData();
            const reqs = (r as { requests: string[] }).requests;
            toast.success(`${o.employee.fullName} has joined`, { description: reqs.length ? `Added to requests: ${reqs.join(', ')}` : undefined });
          },
        },
      );
  };
  const cancel = async () => {
    const res = await confirm({
      title: 'Cancel this onboarding?',
      description: `Use this if ${o.employee.fullName} is not joining. Their record is marked Exited.`,
      confirmText: 'Cancel onboarding',
      destructive: true,
      note: { label: 'Reason', required: true, minLength: 3, placeholder: 'Declined the offer' },
    });
    if (res.confirmed) act.mutate({ path: '/cancel', body: { reason: res.note } }, { onSuccess: () => toast.success('Onboarding cancelled') });
  };
  const saveKit = async () => {
    const res = await confirm({
      title: 'Save these items as a kit?',
      description: 'Next time, pick this kit when adding a joiner for the same role. An existing kit with the same name is updated.',
      confirmText: 'Save kit',
      note: { label: 'Kit name', required: true, minLength: 2, placeholder: o.employee.designation ?? 'Field Sales Executive' },
    });
    if (!res.confirmed) return;
    try {
      const r = await api.post<{ updated: boolean }>('/onboarding-kits', {
        name: res.note,
        items: o.items.filter((i) => i.status !== 'SKIPPED').map((i) => ({ assetTypeId: i.assetTypeId ?? '', itemName: i.assetTypeId ? '' : i.itemName, quantity: i.quantity, notes: i.notes ?? '' })),
      });
      await queryClient.invalidateQueries({ queryKey: ['onboarding-kits'] });
      toast.success(r.updated ? `Kit “${res.note}” updated` : `Kit “${res.note}” saved`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="xs" asChild>
        <Link to="/onboarding">
          <ArrowLeft /> Onboarding
        </Link>
      </Button>

      <Card>
        <CardContent className="flex flex-wrap items-start gap-4 pt-5">
          <Avatar name={o.employee.fullName} className="size-14 text-base" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/employees/${o.employee.id}`} className="text-xl font-semibold hover:text-primary hover:underline">
                {o.employee.fullName}
              </Link>
              <EnumBadge value={o.status} tones={ONBOARDING_TONE} labels={ONBOARDING_STATUS_LABELS} />
              {open && o.ready && (
                <Badge tone="green">
                  <CheckCircle2 /> Ready for day 1
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{o.employee.employeeCode}</span>
              {o.employee.designation ? ` · ${o.employee.designation}` : ''}
              {o.employee.departmentName ? ` · ${o.employee.departmentName}` : ''}
              {o.employee.locationName ? ` · ${o.employee.locationName}` : ''}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
              <CalendarDays className="size-4 text-muted-foreground" /> Joining {formatDate(o.joinDate)}
              {open && <JoinsIn date={o.joinDate} />}
              <span className="font-mono text-xs text-muted-foreground">· {o.caseNumber}</span>
            </p>
          </div>
          {open && (
            <div className="flex flex-wrap gap-2">
              {o.status === 'DRAFT' && manage && (
                <Button onClick={send} loading={act.isPending} disabled={!o.items.length}>
                  <Send /> Send to IT
                </Button>
              )}
              {it && o.counts.prepared > 0 && (
                <Button variant={o.status === 'DRAFT' ? 'outline' : 'default'} onClick={issueAll} loading={act.isPending}>
                  <PackageCheck /> Hand over {o.counts.prepared} prepared
                </Button>
              )}
              <Button variant="outline" onClick={markJoined} disabled={act.isPending}>
                <UserCheck /> Mark joined
              </Button>
              {manage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDateOpen(true)}>
                      <CalendarDays /> Change joining date
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void saveKit()} disabled={!o.items.length}>
                      <Save /> Save items as a kit
                    </DropdownMenuItem>
                    <DropdownMenuItem destructive onSelect={() => void cancel()}>
                      <X /> Not joining — cancel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </CardContent>
        {o.items.length > 0 && (
          <div className="border-t px-5 py-3">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>
                {done} of {o.counts.total} ready · {o.counts.issued} handed over
              </span>
              {o.status === 'DRAFT' && <span>HR is still planning — send to IT when the list is complete</span>}
            </div>
            <Progress value={(done / o.counts.total) * 100} indicatorClassName={done === o.counts.total ? 'bg-emerald-500' : undefined} />
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>What {o.employee.fullName.split(' ')[0]} gets</CardTitle>
            {open && manage && <ApplyKit caseId={o.id} onDone={refresh} />}
          </CardHeader>
          {o.items.length ? (
            <ul className="divide-y border-t">
              {o.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  open={open}
                  it={it}
                  canEdit={manage || it}
                  busy={act.isPending}
                  onPick={() => setPickFor(item)}
                  onIssue={() => setIssueFor(item)}
                  onSkip={async () => {
                    const r = await confirm({ title: `Skip ${item.itemName}?`, description: 'It won’t be given and won’t become a request.', confirmText: 'Skip', note: { label: 'Reason (optional)' } });
                    if (r.confirmed) act.mutate({ path: `/items/${item.id}`, method: 'patch', body: { status: 'SKIPPED', skipReason: r.note } });
                  }}
                  onUndo={() => act.mutate({ path: `/items/${item.id}`, method: 'patch', body: { status: 'PLANNED' } })}
                  onRemove={() => act.mutate({ path: `/items/${item.id}`, method: 'del' })}
                />
              ))}
            </ul>
          ) : (
            <CardContent>
              <p className="text-sm text-muted-foreground">Nothing planned yet. Add what they should get below{manage ? ', or apply a kit' : ''}.</p>
            </CardContent>
          )}
          {open && (manage || it) && <AddItem caseId={o.id} onDone={refresh} />}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Day-1 checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Check ok={o.items.length > 0 && o.counts.planned === 0} label={`Assets ready (${done}/${o.counts.total})`} />
              <Check ok={o.status !== 'DRAFT'} label={o.submittedAt ? `Sent to IT ${formatDateTime(o.submittedAt)}` : 'Sent to IT'} />
              <Check
                ok={!!o.login?.isActive}
                label="Portal login"
                action={
                  !o.login?.isActive && can('user:manage') ? (
                    <Link to={`/employees/${o.employee.id}`} className="text-xs font-medium text-primary hover:underline">
                      <KeyRound className="mr-1 inline size-3" />
                      Give login
                    </Link>
                  ) : undefined
                }
              />
              <Check
                ok={false}
                neutral
                label="ID card with QR"
                action={
                  <Link to={`/id-cards?ids=${o.employee.id}`} className="text-xs font-medium text-primary hover:underline">
                    <IdCard className="mr-1 inline size-3" />
                    Print
                  </Link>
                }
              />
              {o.notes && <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">{o.notes}</p>}
              {o.status === 'CANCELLED' && o.cancelReason && <p className="text-xs text-muted-foreground">Cancelled: {o.cancelReason}</p>}
              {o.status === 'COMPLETED' && <p className="text-xs text-muted-foreground">Joined — marked by {o.completedByName} on {formatDateTime(o.completedAt)}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline events={history.data?.items} loading={history.isLoading} />
            </CardContent>
          </Card>
        </div>
      </div>

      {pickFor && <PickAssetDialog caseId={o.id} item={pickFor} onClose={() => setPickFor(null)} onDone={refresh} />}
      {issueFor && <IssueDialog caseId={o.id} item={issueFor} personName={o.employee.fullName} onClose={() => setIssueFor(null)} onDone={refresh} />}
      {dateOpen && <DateDialog caseId={o.id} current={o.joinDate} onClose={() => setDateOpen(false)} onDone={refresh} />}
    </div>
  );
}

function Check({ ok, label, action, neutral }: { ok: boolean; label: string; action?: React.ReactNode; neutral?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <Circle className={cn('size-4 shrink-0', neutral ? 'text-muted-foreground' : 'text-amber-500')} />}
      <span className="min-w-0 flex-1">{label}</span>
      {action}
    </div>
  );
}

function ItemRow({
  item,
  open,
  it,
  canEdit,
  busy,
  onPick,
  onIssue,
  onSkip,
  onUndo,
  onRemove,
}: {
  item: OnboardingItem;
  open: boolean;
  it: boolean;
  canEdit: boolean;
  busy: boolean;
  onPick: () => void;
  onIssue: () => void;
  onSkip: () => void;
  onUndo: () => void;
  onRemove: () => void;
}) {
  const a = item.preparedAsset;
  return (
    <li className="flex flex-wrap items-start gap-3 px-5 py-3">
      <AssetIcon icon={item.typeIcon ?? 'gift'} color={null} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('font-medium', item.status === 'SKIPPED' && 'text-muted-foreground line-through')}>
            {item.quantity > 1 ? `${item.quantity} × ` : ''}
            {item.itemName}
          </span>
          <EnumBadge value={item.status} tones={ONBOARDING_ITEM_TONE} dot={false} />
          {!item.assetTypeId && <span className="text-[11px] text-muted-foreground">not in catalog</span>}
        </div>
        {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
        {a && item.status !== 'SKIPPED' && (
          <p className="mt-0.5 text-xs">
            {item.status === 'ISSUED' ? 'Given: ' : 'Set aside: '}
            <Link to={`/assets/${a.id}`} className="font-mono text-primary hover:underline">
              {a.assetTag}
            </Link>{' '}
            {a.name}
            {item.status === 'ISSUED' && item.issuedByName ? ` · by ${item.issuedByName} on ${formatDate(item.issuedAt)}` : item.preparedByName ? ` · by ${item.preparedByName}` : ''}
          </p>
        )}
        {item.preparedUnavailable && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-600">
            <AlertTriangle className="size-3" /> {a?.holderName ? `Now with ${a.holderName}` : 'No longer available'} — pick another
          </p>
        )}
        {item.status === 'SKIPPED' && item.skipReason && <p className="text-xs text-muted-foreground">Skipped: {item.skipReason}</p>}
      </div>
      {open && item.status !== 'ISSUED' && (
        <div className="flex flex-wrap items-center gap-1">
          {it && item.status !== 'SKIPPED' && (
            <>
              <Button size="xs" variant={item.status === 'PLANNED' ? 'outline' : 'ghost'} onClick={onPick} disabled={busy}>
                {item.status === 'PLANNED' ? 'Pick asset' : 'Change'}
              </Button>
              <Button size="xs" variant={item.status === 'PREPARED' ? 'default' : 'ghost'} onClick={onIssue} disabled={busy}>
                <Gift /> Hand over
              </Button>
              <Button size="xs" variant="ghost" onClick={onSkip} disabled={busy}>
                Skip
              </Button>
            </>
          )}
          {it && item.status === 'SKIPPED' && (
            <Button size="xs" variant="ghost" onClick={onUndo} disabled={busy}>
              <Undo2 /> Undo skip
            </Button>
          )}
          {canEdit && (
            <Button size="icon-xs" variant="ghost" aria-label={`Remove ${item.itemName}`} onClick={onRemove} disabled={busy}>
              <Trash2 />
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function AddItem({ caseId, onDone }: { caseId: string; onDone: () => Promise<unknown> }) {
  const types = useAssetTypes();
  const [typeId, setTypeId] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const add = useMutation({
    mutationFn: () => api.post(`/onboarding/${caseId}/items`, { items: [{ assetTypeId: typeId ?? '', itemName: typeId ? '' : custom, quantity, notes }] }),
    onSuccess: async () => {
      setTypeId(null);
      setCustom('');
      setQuantity(1);
      setNotes('');
      await onDone();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <div className="grid gap-2 border-t bg-muted/30 p-4 sm:grid-cols-[minmax(0,2fr)_80px_minmax(0,2fr)_auto] sm:items-end">
      <Field label="Add item">
        <Combobox
          value={typeId ?? (custom ? '__custom__' : null)}
          selectedLabel={custom || null}
          onChange={(v) => {
            setCustom('');
            setTypeId(v);
          }}
          onCreate={(text) => {
            if (!text) return;
            setTypeId(null);
            setCustom(text);
          }}
          createWithoutText={false}
          createLabel={(t) => `Add “${t}”`}
          options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name, description: `${t.categoryName} · ${t.availableCount} available`, icon: <AssetIcon icon={t.icon ?? t.categoryIcon} color={t.categoryColor} size="sm" /> }))}
          placeholder="Laptop, SIM card, helmet…"
        />
      </Field>
      <Field label="Qty">
        <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
      </Field>
      <Field label="Note for IT">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="i5, 16 GB, Windows" />
      </Field>
      <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!typeId && !custom}>
        <Plus /> Add
      </Button>
    </div>
  );
}

function ApplyKit({ caseId, onDone }: { caseId: string; onDone: () => Promise<unknown> }) {
  const kits = useQuery({ queryKey: ['onboarding-kits'], queryFn: () => api.get<OnboardingKit[]>('/onboarding-kits') });
  const apply = useMutation({
    mutationFn: (kit: OnboardingKit) => api.post(`/onboarding/${caseId}/items`, { items: kit.items.map((i) => ({ assetTypeId: i.assetTypeId ?? '', itemName: i.itemName ?? '', quantity: i.quantity, notes: i.notes ?? '' })) }),
    onSuccess: async (_r, kit) => {
      await onDone();
      toast.success(`Added ${kit.items.length} items from “${kit.name}”`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (!kits.data?.length) return null;
  return (
    <NativeSelect
      className="h-8 w-auto text-[13px]"
      value=""
      disabled={apply.isPending}
      onChange={(e) => {
        const kit = kits.data?.find((k) => k.id === e.target.value);
        if (kit) apply.mutate(kit);
      }}
    >
      <option value="">Add from a kit…</option>
      {kits.data.map((k) => (
        <option key={k.id} value={k.id}>
          {k.name} ({k.items.length})
        </option>
      ))}
    </NativeSelect>
  );
}

function PickAssetDialog({ caseId, item, onClose, onDone }: { caseId: string; item: OnboardingItem; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [assetId, setAssetId] = useState<string | null>(item.preparedAssetId);
  const save = useMutation({
    mutationFn: () => api.patch(`/onboarding/${caseId}/items/${item.id}`, { status: 'PREPARED', preparedAssetId: assetId }),
    onSuccess: async () => {
      await onDone();
      toast.success(`${item.itemName} set aside`);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pick {item.itemName}</DialogTitle>
          <DialogDescription>Choose the one you’ll hand over. This is a note for IT — it isn’t locked, so hand it over before someone else uses it.</DialogDescription>
        </DialogHeader>
        <EntityPicker kind="asset" value={assetId} onChange={setAssetId} assetFilter={{ assetTypeId: item.assetTypeId ?? undefined, status: 'AVAILABLE,IN_INVENTORY' }} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!assetId} loading={save.isPending} onClick={() => save.mutate()}>
            Set aside
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueDialog({ caseId, item, personName, onClose, onDone }: { caseId: string; item: OnboardingItem; personName: string; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [assetId, setAssetId] = useState<string | null>(item.preparedUnavailable ? null : item.preparedAssetId);
  const [photos, setPhotos] = useState<File[]>([]);
  const save = useMutation({
    mutationFn: async () => {
      const r = await api.post<{ allocationId: string; assetId: string }>(`/onboarding/${caseId}/items/${item.id}/issue`, { assetId });
      if (photos.length) {
        try {
          await uploadPhotos(r.assetId, r.allocationId, 'HANDOVER', photos);
        } catch (err) {
          toast.error(`Handed over, but the photos did not upload: ${errorMessage(err)}`);
        }
      }
    },
    onSuccess: async () => {
      await Promise.all([onDone(), invalidateAssetData()]);
      toast.success(`${item.itemName} handed over to ${personName}`);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hand over {item.itemName}</DialogTitle>
          <DialogDescription>Assigns it to {personName} now, with optional handover photos.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Asset" required>
            <EntityPicker kind="asset" value={assetId} selectedLabel={item.preparedAsset && !item.preparedUnavailable ? `${item.preparedAsset.assetTag} · ${item.preparedAsset.name}` : undefined} onChange={setAssetId} assetFilter={{ assetTypeId: item.assetTypeId ?? undefined, status: 'AVAILABLE,IN_INVENTORY' }} />
          </Field>
          <Field label="Handover photos">
            <PhotoPicker files={photos} onChange={setPhotos} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!assetId} loading={save.isPending} onClick={() => save.mutate()}>
            <Gift /> Hand over
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DateDialog({ caseId, current, onClose, onDone }: { caseId: string; current: string; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [date, setDate] = useState(current);
  const save = useMutation({
    mutationFn: () => api.patch(`/onboarding/${caseId}`, { joinDate: date }),
    onSuccess: async () => {
      await onDone();
      toast.success('Joining date updated');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change joining date</DialogTitle>
        </DialogHeader>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!date || date === current} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
