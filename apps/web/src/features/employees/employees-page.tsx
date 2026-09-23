import { EMPLOYEE_STATUS_LABELS, type EmployeeStatus } from '@eam/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { EmployeeStatusBadge } from '@/components/common/badges';
import { type Column, DataTable, Pagination } from '@/components/common/data-table';
import { EmptyState, PageHeader } from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Avatar, Card } from '@/components/ui/primitives';
import { useQuickAdd } from '@/features/quick-add/quick-add';
import { api, type Page } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDepartments, useLocations } from '@/lib/queries';
import type { Employee } from '@/lib/types';
import { useSearchBox, useUrlFilters } from '@/lib/url-state';
import { cn, daysUntil, formatDate, formatNumber } from '@/lib/utils';

const TABS: { value: string; label: string }[] = [
  { value: '', label: 'Current' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'NOTICE_PERIOD', label: 'Notice period' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'EXITED', label: 'Exited' },
];

export default function EmployeesPage() {
  const navigate = useNavigate();
  const quickAdd = useQuickAdd();
  const { can } = useAuth();
  const { values: f, set, clear } = useUrlFilters({ page: '1', pageSize: '25', sort: 'name', dir: 'asc' });
  const [search, setSearch] = useSearchBox(f.search ?? '', (v) => set({ search: v }));
  const departments = useDepartments();
  const locations = useLocations();
  const q = useQuery({ queryKey: ['employees', f], queryFn: () => api.get<Page<Employee>>('/employees', f) });

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Employee',
      sortKey: 'name',
      cell: (e) => (
        <div className="flex min-w-52 items-center gap-3">
          <Avatar name={e.fullName} />
          <div className="min-w-0">
            <div className="truncate font-medium">{e.fullName}</div>
            <div className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{e.employeeCode}</span>
              {e.email ? ` · ${e.email}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    { key: 'designation', header: 'Designation', hideOnMobile: true, cell: (e) => <span className="text-muted-foreground">{e.designation ?? '—'}</span> },
    { key: 'department', header: 'Department', hideOnMobile: true, cell: (e) => e.departmentName ?? <span className="text-muted-foreground">—</span> },
    { key: 'location', header: 'Location', hideOnMobile: true, cell: (e) => <span className="text-muted-foreground">{e.locationName ?? '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      cell: (e) => {
        const d = daysUntil(e.lastWorkingDate);
        return (
          <div className="flex flex-col gap-0.5">
            <EmployeeStatusBadge status={e.status} />
            {e.status === 'NOTICE_PERIOD' && e.lastWorkingDate && (
              <span className={cn('text-[11px]', d !== null && d <= 3 ? 'font-medium text-amber-600' : 'text-muted-foreground')}>LWD {formatDate(e.lastWorkingDate)}</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'assets',
      header: 'Assets',
      cell: (e) => (
        <span className={cn('tabular', e.assetCount === 0 ? 'text-muted-foreground' : 'font-medium')}>
          {e.assetCount}
          {e.status === 'NOTICE_PERIOD' && e.assetCount > 0 && <span className="ml-1 text-xs font-normal text-amber-600">to recover</span>}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Employees"
        description={q.data ? `${formatNumber(q.data.total)} ${f.status ? EMPLOYEE_STATUS_LABELS[f.status as EmployeeStatus]?.toLowerCase() : 'current'} employees` : 'People who can hold company assets.'}
        actions={
          can('employee:manage') && (
            <Button size="sm" onClick={() => quickAdd.open('employee')}>
              <Plus /> Add employee
            </Button>
          )
        }
      />
      <div className="mb-3 flex gap-1 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map((t) => {
          const active = (f.status ?? '') === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => set({ status: t.value || null, includeExited: null })}
              className={cn(
                'shrink-0 cursor-pointer rounded-lg border px-3 py-1.5 text-[13px] font-medium transition',
                active ? 'border-primary/30 bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, email, designation…" className="pl-8" />
          </div>
          <NativeSelect className="w-auto min-w-40" value={f.departmentId ?? ''} onChange={(e) => set({ departmentId: e.target.value })}>
            <option value="">All departments</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect className="w-auto min-w-40" value={f.locationId ?? ''} onChange={(e) => set({ locationId: e.target.value })}>
            <option value="">All locations</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <input type="checkbox" className="accent-[var(--primary)]" checked={f.hasAssets === '1'} onChange={(e) => set({ hasAssets: e.target.checked ? '1' : null })} />
            Holding assets
          </label>
        </div>
        <DataTable
          columns={columns}
          rows={q.data?.items}
          rowKey={(e) => e.id}
          loading={q.isLoading}
          fetching={q.isFetching}
          error={q.error}
          onRetry={() => q.refetch()}
          onRowClick={(e) => navigate(`/employees/${e.id}`)}
          sort={{ key: f.sort, dir: f.dir as 'asc' | 'desc' }}
          onSortChange={(s) => set({ sort: s.key, dir: s.dir }, { keepPage: true })}
          keyboard
          empty={
            <EmptyState
              icon={Users}
              title="No employees found"
              action={
                f.search || f.departmentId || f.locationId ? (
                  <Button variant="outline" size="sm" onClick={() => clear(['status'])}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          }
        />
        {q.data && q.data.total > 0 && (
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPageChange={(p) => set({ page: p }, { keepPage: true })} onPageSizeChange={(s) => set({ pageSize: s })} />
        )}
      </Card>
    </div>
  );
}
