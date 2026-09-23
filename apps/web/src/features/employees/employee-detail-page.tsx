import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRightLeft, Boxes, LogOut, Mail, Pencil, Phone, UserCog, UserPlus, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AssetStatusBadge, EmployeeStatusBadge, EnumBadge } from '@/components/common/badges';
import { DetailList, EmptyState, ErrorState, PageLoader } from '@/components/common/page';
import { EntityPicker } from '@/components/common/pickers';
import { Timeline } from '@/components/common/timeline';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { Avatar, Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { AssetActionDialog, type AssetDialog } from '@/features/assets/asset-actions';
import { useQuickAdd } from '@/features/quick-add/quick-add';
import { api, type Page } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AssetIcon } from '@/lib/icons';
import { EXIT_CASE_TONE } from '@/lib/status';
import type { AssetListItem, EmployeeDetail, HeldAsset, HistoryEvent } from '@/lib/types';
import { cn, daysUntil, formatDate, relativeTime } from '@/lib/utils';
import { StatusDialog } from './status-dialog';

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const quickAdd = useQuickAdd();
  const [statusOpen, setStatusOpen] = useState(false);
  const [dialog, setDialog] = useState<AssetDialog | null>(null);
  const [pickAsset, setPickAsset] = useState(false);
  const q = useQuery({ queryKey: ['employee', id], queryFn: () => api.get<EmployeeDetail>(`/employees/${id}`), placeholderData: undefined });
  const history = useQuery({ queryKey: ['history', 'employee', id], queryFn: () => api.get<Page<HistoryEvent>>(`/employees/${id}/history`), enabled: !!q.data });

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const e = q.data;
  const exited = e.status === 'EXITED';
  const lwd = daysUntil(e.lastWorkingDate);
  const assetOf = (h: HeldAsset) => ({ id: h.assetId, assetTag: h.assetTag, name: h.name, trackingMode: h.trackingMode, holderType: 'EMPLOYEE' as const, holderName: e.fullName });
  const fakeAllocation = (h: HeldAsset) =>
    ({ id: h.allocationId, holderName: e.fullName, quantity: h.quantity, holderType: 'EMPLOYEE' }) as unknown as NonNullable<Extract<AssetDialog, { kind: 'return' }>['allocation']>;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/employees" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Employees
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <Avatar name={e.fullName} className="size-14 text-base" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{e.fullName}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{e.employeeCode}</span>
                <EmployeeStatusBadge status={e.status} />
                {e.designation && <span>{e.designation}</span>}
                {e.departmentName && <span>· {e.departmentName}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {e.email && (
                  <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                    <Mail className="size-3.5" /> {e.email}
                  </a>
                )}
                {e.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3.5" /> {e.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can('asset:assign') && !exited && (
              <Button size="sm" onClick={() => setPickAsset(true)}>
                <UserPlus /> Assign asset
              </Button>
            )}
            {can('employee:status') && (
              <Button size="sm" variant="outline" onClick={() => setStatusOpen(true)}>
                <UserCog /> Change status
              </Button>
            )}
            {can('employee:manage') && (
              <Button size="sm" variant="outline" onClick={() => quickAdd.open('employee', { record: e })}>
                <Pencil /> Edit
              </Button>
            )}
          </div>
        </div>
      </div>

      {e.openExitCase && (
        <Link
          to={`/exits/${e.openExitCase.id}`}
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:border-amber-300 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <LogOut className="size-4 shrink-0" />
          <span className="flex-1">
            On notice — last working day <span className="font-semibold">{formatDate(e.openExitCase.lastWorkingDate)}</span>
            {lwd !== null && <> ({lwd < 0 ? `${-lwd} days overdue` : lwd === 0 ? 'today' : `${lwd} days left`})</>}. {e.assets.length} asset(s) still with them.
          </span>
          <span className="text-xs font-medium">Recovery checklist {e.openExitCase.caseNumber} →</span>
        </Link>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Assets held</CardTitle>
                <p className="text-xs text-muted-foreground">{e.assets.length} item(s) currently assigned</p>
              </div>
              {e.assets.length > 0 && can('asset:view') && (
                <Button size="xs" variant="ghost" onClick={() => navigate(`/assets?employeeId=${e.id}`)}>
                  <Boxes /> Open in assets
                </Button>
              )}
            </CardHeader>
            {e.assets.length === 0 ? (
              <EmptyState icon={Boxes} title="No assets assigned" className="py-8" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Asset</TH>
                    <TH className="hidden md:table-cell">Type</TH>
                    <TH>Status</TH>
                    <TH className="hidden md:table-cell">Since</TH>
                    {can('asset:assign') && <TH className="w-20" />}
                  </TR>
                </THead>
                <TBody>
                  {e.assets.map((h) => (
                    <TR key={h.allocationId} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/assets/${h.assetId}`)}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <AssetIcon icon={h.typeIcon ?? h.categoryIcon} color={h.categoryColor} size="sm" />
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {h.name}
                              {h.quantity > 1 && <span className="ml-1 text-xs text-muted-foreground">×{h.quantity}</span>}
                            </div>
                            <div className="truncate font-mono text-xs text-muted-foreground">{h.assetTag}</div>
                          </div>
                        </div>
                      </TD>
                      <TD className="hidden text-muted-foreground md:table-cell">{h.typeName}</TD>
                      <TD>
                        <AssetStatusBadge status={h.status} />
                      </TD>
                      <TD className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{relativeTime(h.assignedAt)}</TD>
                      {can('asset:assign') && (
                        <TD onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex justify-end gap-0.5">
                            <Button size="icon-xs" variant="ghost" title="Transfer" onClick={() => setDialog({ kind: 'transfer', asset: assetOf(h), allocation: fakeAllocation(h) })}>
                              <ArrowRightLeft />
                            </Button>
                            <Button size="icon-xs" variant="ghost" title="Return" onClick={() => setDialog({ kind: 'return', asset: assetOf(h), allocation: fakeAllocation(h) })}>
                              <Undo2 />
                            </Button>
                          </div>
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card>
            <Tabs defaultValue="history">
              <div className="px-5 pt-2">
                <TabsList>
                  <TabsTrigger value="history">History</TabsTrigger>
                  <TabsTrigger value="exits">Exit cases ({e.exitCases.length})</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="history" className="p-5">
                <Timeline events={history.data?.items} loading={history.isLoading} showEntity />
              </TabsContent>
              <TabsContent value="exits">
                {!e.exitCases.length ? (
                  <EmptyState icon={LogOut} title="No exit cases" />
                ) : (
                  <ul className="divide-y">
                    {e.exitCases.map((x) => (
                      <li key={x.id}>
                        <Link to={`/exits/${x.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-muted/50">
                          <span className="font-mono text-xs">{x.caseNumber}</span>
                          <span className="flex-1 text-muted-foreground">Last working day {formatDate(x.lastWorkingDate)}</span>
                          <EnumBadge value={x.status} tones={EXIT_CASE_TONE} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                columns={1}
                items={[
                  { label: 'Company', value: e.companyName },
                  { label: 'Department', value: e.departmentName },
                  { label: 'Location', value: e.locationName },
                  { label: 'Reports to', value: e.managerName },
                  { label: 'Joined', value: e.joinDate && formatDate(e.joinDate) },
                  ...(e.noticeDate ? [{ label: 'Notice given', value: formatDate(e.noticeDate) }] : []),
                  ...(e.lastWorkingDate ? [{ label: 'Last working day', value: <span className={cn(lwd !== null && lwd <= 3 && 'font-medium text-amber-600')}>{formatDate(e.lastWorkingDate)}</span> }] : []),
                  ...(e.exitDate ? [{ label: 'Exited on', value: formatDate(e.exitDate) }] : []),
                  ...(e.notes ? [{ label: 'Notes', value: e.notes }] : []),
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Portal login</CardTitle>
            </CardHeader>
            <CardContent>
              {e.login ? (
                <DetailList
                  columns={1}
                  items={[
                    { label: 'Email', value: e.login.email },
                    { label: 'Role', value: e.login.roleName },
                    { label: 'Access', value: e.login.isActive ? 'Active' : 'Disabled' },
                    { label: 'Last sign-in', value: e.login.lastLoginAt ? relativeTime(e.login.lastLoginAt) : 'Never' },
                  ]}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No login. {can('user:manage') && <Link to="/settings/users" className="text-primary hover:underline">Create one</Link>}</p>
              )}
            </CardContent>
          </Card>
          {e.directReports.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Direct reports</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {e.directReports.map((r) => (
                    <li key={r.id}>
                      <Link to={`/employees/${r.id}`} className="flex items-center gap-2 text-sm hover:text-primary">
                        <Avatar name={r.fullName} className="size-6" />
                        <span className="flex-1 truncate">{r.fullName}</span>
                        <span className="truncate text-xs text-muted-foreground">{r.designation}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {statusOpen && <StatusDialog employee={e} open={statusOpen} onOpenChange={setStatusOpen} />}
      <AssetActionDialog dialog={dialog} onClose={() => setDialog(null)} />
      <PickAssetDialog
        open={pickAsset}
        onOpenChange={setPickAsset}
        onPick={(a) => {
          setPickAsset(false);
          setDialog({
            kind: 'assign',
            asset: { id: a.id, assetTag: a.assetTag, name: a.name, trackingMode: a.trackingMode, availableQuantity: a.availableQuantity },
            defaults: { holderType: 'EMPLOYEE', holderId: e.id },
          });
        }}
      />
    </div>
  );
}

/** Step 1 of "Assign asset" from a person: choose an available asset. */
function PickAssetDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (a: AssetListItem) => void }) {
  const [value, setValue] = useState<string | null>(null);
  const [picked, setPicked] = useState<AssetListItem | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign an asset</DialogTitle>
          <DialogDescription>Choose an available asset (or one in a store).</DialogDescription>
        </DialogHeader>
        <PickerWithRow
          value={value}
          onChange={(v, row) => {
            setValue(v);
            setPicked(row);
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!picked} onClick={() => picked && onPick(picked)}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickerWithRow({ value, onChange }: { value: string | null; onChange: (v: string | null, row: AssetListItem | null) => void }) {
  return (
    <EntityPicker
      kind="asset"
      value={value}
      assetFilter={{ status: 'AVAILABLE,IN_INVENTORY' }}
      onChange={async (v) => {
        if (!v) return onChange(null, null);
        const row = await api.get<AssetListItem & { type: { trackingMode: 'INDIVIDUAL' | 'QUANTITY' } }>(`/assets/${v}`);
        onChange(v, row);
      }}
    />
  );
}
