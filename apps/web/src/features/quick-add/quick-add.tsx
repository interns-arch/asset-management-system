import { createContext, lazy, type ReactNode, Suspense, useCallback, useContext, useMemo, useState } from 'react';

export type QuickAddKind =
  | 'asset'
  | 'employee'
  | 'assetType'
  | 'category'
  | 'department'
  | 'location'
  | 'vendor'
  | 'company'
  | 'request'
  | 'ticket'
  | 'maintenance'
  | 'onboarding';

interface OpenState {
  kind: QuickAddKind;
  /** Existing record to edit, or defaults for a new one. */
  record?: Record<string, any>;
  defaults?: Record<string, any>;
}

interface QuickAddApi {
  open: (kind: QuickAddKind, opts?: { record?: Record<string, any>; defaults?: Record<string, any> }) => void;
  close: () => void;
}

const QuickAddContext = createContext<QuickAddApi | null>(null);

const AssetForm = lazy(() => import('@/features/assets/asset-form'));
const EmployeeForm = lazy(() => import('@/features/employees/employee-form'));
const CategoryForm = lazy(() => import('@/features/catalog/category-form'));
const AssetTypeForm = lazy(() => import('@/features/catalog/asset-type-form'));
const OrgForm = lazy(() => import('@/features/org/org-form'));
const RequestForm = lazy(() => import('@/features/service/request-form'));
const TicketForm = lazy(() => import('@/features/service/ticket-form'));
const MaintenanceForm = lazy(() => import('@/features/service/maintenance-form'));
const OnboardingForm = lazy(() => import('@/features/onboarding/onboarding-form'));

/** One place that can open any "+ Add" form from anywhere (menu, palette, shortcuts, pages). */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpenState | null>(null);
  const [open, setOpen] = useState(false);

  const api = useMemo<QuickAddApi>(
    () => ({
      open: (kind, opts) => {
        setState({ kind, record: opts?.record, defaults: opts?.defaults });
        setOpen(true);
      },
      close: () => setOpen(false),
    }),
    [],
  );
  const onOpenChange = useCallback((o: boolean) => setOpen(o), []);
  const props = { open, onOpenChange, record: state?.record, defaults: state?.defaults };

  return (
    <QuickAddContext.Provider value={api}>
      {children}
      <Suspense fallback={null}>
        {state?.kind === 'asset' && <AssetForm key={state.record?.id ?? 'new'} {...props} />}
        {state?.kind === 'employee' && <EmployeeForm key={state.record?.id ?? 'new'} {...props} />}
        {state?.kind === 'category' && <CategoryForm key={state.record?.id ?? 'new'} {...props} />}
        {state?.kind === 'assetType' && <AssetTypeForm key={state.record?.id ?? 'new'} {...props} />}
        {(state?.kind === 'department' || state?.kind === 'location' || state?.kind === 'vendor' || state?.kind === 'company') && (
          <OrgForm key={`${state.kind}-${state.record?.id ?? 'new'}`} kind={state.kind} {...props} />
        )}
        {state?.kind === 'request' && <RequestForm key="request" {...props} />}
        {state?.kind === 'ticket' && <TicketForm key="ticket" {...props} />}
        {state?.kind === 'maintenance' && <MaintenanceForm key="maintenance" {...props} />}
        {state?.kind === 'onboarding' && <OnboardingForm key="onboarding" {...props} />}
      </Suspense>
    </QuickAddContext.Provider>
  );
}

export function useQuickAdd(): QuickAddApi {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error('useQuickAdd must be used inside QuickAddProvider');
  return ctx;
}

export interface FormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: Record<string, any>;
  defaults?: Record<string, any>;
}
