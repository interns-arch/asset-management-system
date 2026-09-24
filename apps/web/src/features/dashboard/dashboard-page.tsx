import { ASSET_STATUS_LABELS, ASSET_STATUSES, type AssetStatus, HOLDER_TYPE_LABELS, type HolderType } from '@eam/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, ClipboardList, LifeBuoy, LogOut, PackageCheck, Plus, QrCode, ScanLine, ShieldAlert, UserPlus, Wrench } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { AssetStatusBadge, EnumBadge, HOLDER_ICONS } from '@/components/common/badges';
import { EmptyState, ErrorState, PageHeader, PageLoader, StatCard } from '@/components/common/page';
import { Timeline } from '@/components/common/timeline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from '@/components/ui/primitives';
import { useQuickAdd } from '@/features/quick-add/quick-add';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AssetIcon, COLORS } from '@/lib/icons';
import { ASSET_STATUS_BAR, REQUEST_TONE, TICKET_TONE } from '@/lib/status';
import type { HeldAsset, HistoryEvent } from '@/lib/types';
import { cn, daysUntil, formatDate, formatMoney, formatNumber, plural } from '@/lib/utils';

interface OrgDashboard {
  scope: 'organisation';
  totals: {
    assets: number;
    assigned: number;
    available: number;
    inMaintenance: number;
    lost: number;
    value: number;
    employees: number;
    onNotice: number;
    pendingRequests: number;
    approvedRequests: number;
    openTickets: number;
    warrantyExpiring: number;
    exitPendingItems: number;
  };
  byStatus: Partial<Record<AssetStatus, number>>;
  byCategory: { id: string; name: string; icon: string | null; color: string | null; count: number; assigned: number; value: number }[];
  byLocation: { id: string; name: string; count: number }[];
  byHolder: Partial<Record<HolderType, number>>;
  byType: { id: string; name: string; icon: string | null; available: number; total: number }[];
  expiring: { id: string; assetTag: string; name: string; warrantyExpiry: string; holderName: string | null }[];
  exits: { id: string; caseNumber: string; lastWorkingDate: string; employeeName: string; employeeId: string; total: number; pending: number }[];
  activity: HistoryEvent[];
}

interface PersonalDashboard {
  scope: 'personal';
  myAssets: HeldAsset[];
  requests: { id: string; number: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED' | 'CANCELLED'; createdAt: string; typeName: string }[];
  tickets: { id: string; number: string; title: string; status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; createdAt: string }[];
  openExit: { id: string; caseNumber: string; lastWorkingDate: string } | null;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  const { me } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<OrgDashboard | PersonalDashboard>('/dashboard'), refetchInterval: 60_000 });
  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const first = me?.user.name.split(' ')[0];
  return q.data.scope === 'organisation' ? <OrgView data={q.data} name={first} /> : <PersonalView data={q.data} name={first} />;
}

function QuickActions() {
  const quickAdd = useQuickAdd();
  const navigate = useNavigate();
  const { can } = useAuth();
  const actions = [
    can('asset:create') && { label: 'Add asset', icon: Plus, onClick: () => quickAdd.open('asset') },
    can('employee:manage') && { label: 'Add employee', icon: UserPlus, onClick: () => quickAdd.open('employee') },
    { label: 'Scan', icon: ScanLine, onClick: () => navigate('/scan') },
    can('request:create') && { label: 'Request', icon: ClipboardList, onClick: () => quickAdd.open('request') },
    can('maintenance:manage') && { label: 'Maintenance', icon: Wrench, onClick: () => quickAdd.open('maintenance') },
  ].filter(Boolean) as { label: string; icon: typeof Plus; onClick: () => void }[];
  return (
    <>
      {actions.map((a, i) => (
        <Button key={a.label} variant={i === 0 ? 'default' : 'outline'} size="sm" onClick={a.onClick}>
          <a.icon /> {a.label}
        </Button>
      ))}
    </>
  );
}

function OrgView({ data, name }: { data: OrgDashboard; name?: string }) {
  const t = data.totals;
  const statusTotal = ASSET_STATUSES.reduce((n, s) => n + (s === 'DISPOSED' ? 0 : data.byStatus[s] ?? 0), 0) || 1;
  const maxLoc = Math.max(1, ...data.byLocation.map((l) => l.count));
  const utilisation = t.assets ? Math.round((t.assigned / t.assets) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader title={`${greeting()}${name ? `, ${name}` : ''}`} description="Here’s what’s happening with your assets today." actions={<QuickActions />} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total assets" value={formatNumber(t.assets)} hint={`${formatMoney(t.value, 'INR', true)} book value`} icon={Boxes} tone="blue" to="/assets" />
        <StatCard label="Assigned" value={formatNumber(t.assigned)} hint={`${utilisation}% in use`} icon={PackageCheck} tone="violet" to="/assets?status=ASSIGNED" />
        <StatCard label="Available" value={formatNumber(t.available)} hint="Ready to assign" icon={CheckCircle2} tone="green" to="/assets?status=AVAILABLE" />
        <StatCard
          label="Pending exit recoveries"
          value={formatNumber(t.exitPendingItems)}
          hint={`${plural(t.onNotice, 'employee')} on notice`}
          icon={LogOut}
          tone={t.exitPendingItems ? 'amber' : 'default'}
          to="/exits"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="In maintenance" value={t.inMaintenance} icon={Wrench} to="/assets?status=IN_MAINTENANCE" />
        <StatCard label="Open tickets" value={t.openTickets} icon={LifeBuoy} to="/tickets" tone={t.openTickets ? 'red' : 'default'} />
        <StatCard label="Requests to action" value={t.pendingRequests + t.approvedRequests} hint={`${t.pendingRequests} pending · ${t.approvedRequests} to fulfil`} icon={ClipboardList} to="/requests" />
        <StatCard label="Warranties expiring (30d)" value={t.warrantyExpiring} hint={t.lost ? `${t.lost} lost asset(s)` : undefined} icon={ShieldAlert} tone={t.warrantyExpiring ? 'amber' : 'default'} to="/assets?warranty=expiring" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Assets by status</CardTitle>
              <CardDescription>{formatNumber(statusTotal)} in the register (excluding disposed)</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {ASSET_STATUSES.filter((s) => s !== 'DISPOSED' && data.byStatus[s]).map((s) => (
                <div key={s} className={cn('h-full transition-all', ASSET_STATUS_BAR[s])} style={{ width: `${((data.byStatus[s] ?? 0) / statusTotal) * 100}%` }} title={`${ASSET_STATUS_LABELS[s]}: ${data.byStatus[s]}`} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {ASSET_STATUSES.filter((s) => data.byStatus[s]).map((s) => (
                <Link key={s} to={`/assets?status=${s}`} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted">
                  <span className={cn('size-2.5 rounded-sm', ASSET_STATUS_BAR[s])} />
                  <span className="flex-1 text-muted-foreground">{ASSET_STATUS_LABELS[s]}</span>
                  <span className="font-medium tabular">{data.byStatus[s]}</span>
                </Link>
              ))}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">By category</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.byCategory.map((c) => {
                  const pct = c.count ? Math.round((c.assigned / c.count) * 100) : 0;
                  return (
                    <Link key={c.id} to={`/assets?categoryId=${c.id}`} className="flex items-center gap-3 rounded-lg border p-2.5 transition hover:border-primary/40">
                      <AssetIcon icon={c.icon} color={c.color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{c.name}</span>
                          <span className="tabular text-muted-foreground">{c.count}</span>
                        </div>
                        <Progress value={pct} className="mt-1.5 h-1" indicatorClassName={COLORS[c.color ?? '']?.bar} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Exits in progress</CardTitle>
              <CardDescription>Assets still to recover</CardDescription>
            </div>
            <Button variant="ghost" size="xs" asChild>
              <Link to="/exits">
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!data.exits.length ? (
              <EmptyState icon={LogOut} title="No one is leaving" description="Exit checklists appear here when HR moves someone to notice period." className="py-8" />
            ) : (
              <ul className="space-y-3">
                {data.exits.map((x) => {
                  const days = daysUntil(x.lastWorkingDate) ?? 0;
                  const done = x.total - x.pending;
                  return (
                    <li key={x.id}>
                      <Link to={`/exits/${x.id}`} className="block rounded-lg border p-3 transition hover:border-primary/40">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{x.employeeName}</span>
                          <span className={cn('text-xs font-medium', days < 0 ? 'text-red-600' : days <= 3 ? 'text-amber-600' : 'text-muted-foreground')}>
                            {days < 0 ? `${-days}d overdue` : days === 0 ? 'Last day today' : `${days}d left`}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Progress value={x.total ? (done / x.total) * 100 : 100} className="h-1.5" indicatorClassName={x.pending ? 'bg-amber-500' : 'bg-emerald-500'} />
                          <span className="shrink-0 text-xs tabular text-muted-foreground">
                            {done}/{x.total}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Availability by type</CardTitle>
              <CardDescription>What can be handed out right now</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {data.byType.map((ty) => (
                <li key={ty.id}>
                  <Link to={`/assets?assetTypeId=${ty.id}&status=AVAILABLE`} className="flex items-center gap-3 text-sm hover:text-primary">
                    <AssetIcon icon={ty.icon} color="indigo" size="sm" />
                    <span className="min-w-0 flex-1 truncate">{ty.name}</span>
                    <span className={cn('tabular font-medium', ty.available === 0 && 'text-red-600')}>{ty.available}</span>
                    <span className="w-12 text-right tabular text-xs text-muted-foreground">of {ty.total}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Where assets are</CardTitle>
              <CardDescription>By location and holder</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {data.byLocation.map((l) => (
                <li key={l.id}>
                  <Link to={`/assets?locationId=${l.id}`} className="block text-sm hover:text-primary">
                    <div className="flex justify-between">
                      <span className="truncate">{l.name}</span>
                      <span className="tabular text-muted-foreground">{l.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${(l.count / maxLoc) * 100}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5 border-t pt-3">
              {(Object.entries(data.byHolder) as [HolderType, number][]).map(([h, n]) => {
                const I = HOLDER_ICONS[h];
                return (
                  <Link key={h} to={`/assets?holderType=${h}`} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:border-primary/40">
                    <I className="size-3.5 text-muted-foreground" /> {HOLDER_TYPE_LABELS[h]} <span className="font-semibold tabular">{n}</span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Warranty expiring soon</CardTitle>
              <CardDescription>Next 30 days</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!data.expiring.length ? (
              <EmptyState icon={CheckCircle2} title="Nothing expiring" className="py-8" />
            ) : (
              <ul className="divide-y">
                {data.expiring.map((a) => (
                  <li key={a.id}>
                    <Link to={`/assets/${a.id}`} className="flex items-center gap-2 py-2 text-sm hover:text-primary">
                      <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{a.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.assetTag}
                          {a.holderName ? ` · ${a.holderName}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.warrantyExpiry)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Every change is recorded permanently</CardDescription>
          </div>
          <Button variant="ghost" size="xs" asChild>
            <Link to="/activity">
              Activity log <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Timeline events={data.activity} showEntity />
        </CardContent>
      </Card>
    </div>
  );
}

function PersonalView({ data, name }: { data: PersonalDashboard; name?: string }) {
  const quickAdd = useQuickAdd();
  const { me } = useAuth();
  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting()}${name ? `, ${name}` : ''}`}
        description="Everything assigned to you. View only - ask IT for any change."
        actions={
          <>
            <Button size="sm" onClick={() => quickAdd.open('request')}>
              <ClipboardList /> Request an asset
            </Button>
            <Button size="sm" variant="outline" onClick={() => quickAdd.open('ticket')}>
              <LifeBuoy /> Report an issue
            </Button>
          </>
        }
      />
      {me?.employee && (
        <Link to={`/employees/${me.employee.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 transition hover:border-primary/40 active:bg-muted">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <QrCode className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">My QR · {me.employee.employeeCode}</span>
            <span className="block text-xs text-muted-foreground">Show it to IT to check or return your assets</span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground" />
        </Link>
      )}
      {data.openExit && (
        <Link to={`/exits/${data.openExit.id}`} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <LogOut className="size-5" />
          <span className="flex-1 text-sm">
            <span className="font-medium">Asset return checklist</span> — please return all company assets by {formatDate(data.openExit.lastWorkingDate)}.
          </span>
          <ArrowRight className="size-4" />
        </Link>
      )}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>My assets</CardTitle>
            <CardDescription>{plural(data.myAssets.length, 'item')} assigned to you</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {!data.myAssets.length ? (
            <EmptyState icon={Boxes} title="No assets assigned to you" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.myAssets.map((a) => (
                <Link key={a.allocationId} to={`/assets/${a.assetId}`} className="flex items-center gap-3 rounded-lg border p-3 transition hover:border-primary/40">
                  <AssetIcon icon={a.typeIcon ?? a.categoryIcon} color={a.categoryColor} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.assetTag} · {a.typeName}
                      {a.quantity > 1 ? ` · ×${a.quantity}` : ''}
                    </span>
                    <AssetStatusBadge status={a.status} className="mt-1 sm:hidden" />
                  </span>
                  <AssetStatusBadge status={a.status} className="hidden sm:inline-flex" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My requests</CardTitle>
            <Button variant="ghost" size="xs" asChild>
              <Link to="/requests">
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!data.requests.length ? (
              <EmptyState icon={ClipboardList} title="No requests yet" className="py-8" />
            ) : (
              <ul className="divide-y">
                {data.requests.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{r.number}</span>
                    <span className="flex-1 truncate">{r.typeName}</span>
                    <EnumBadge value={r.status} tones={REQUEST_TONE} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>My tickets</CardTitle>
            <Button variant="ghost" size="xs" asChild>
              <Link to="/tickets">
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!data.tickets.length ? (
              <EmptyState icon={LifeBuoy} title="No tickets" className="py-8" />
            ) : (
              <ul className="divide-y">
                {data.tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{t.number}</span>
                    <span className="flex-1 truncate">{t.title}</span>
                    <EnumBadge value={t.status} tones={TICKET_TONE} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
