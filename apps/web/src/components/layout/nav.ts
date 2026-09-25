import type { Permission } from '@eam/shared';
import {
  Activity,
  Boxes,
  Briefcase,
  CardSim,
  ClipboardList,
  GitCompareArrows,
  LayoutDashboard,
  LifeBuoy,
  ListOrdered,
  LogOut,
  MapPin,
  ScanLine,
  Shapes,
  ShieldCheck,
  Truck,
  Users,
  UsersRound,
  Wrench,
} from 'lucide-react';
import type { QuickAddKind } from '@/features/quick-add/quick-add';

export interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  perms?: Permission[];
  shortcut?: string;
}

export const MAIN_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, shortcut: 'G D' },
  { label: 'Priority queue', to: '/queue', icon: ListOrdered, perms: ['ticket:manage', 'request:approve', 'request:fulfil'], shortcut: 'G Q' },
  { label: 'Assets', to: '/assets', icon: Boxes, shortcut: 'G A' },
  { label: 'SIM cards', to: '/sims', icon: CardSim, perms: ['asset:view'] },
  { label: 'Employees', to: '/employees', icon: Users, perms: ['employee:view'], shortcut: 'G E' },
  { label: 'Exits', to: '/exits', icon: LogOut, perms: ['exit:view'], shortcut: 'G X' },
  { label: 'Requests', to: '/requests', icon: ClipboardList, perms: ['request:create', 'request:approve', 'request:fulfil'], shortcut: 'G R' },
  { label: 'Tickets', to: '/tickets', icon: LifeBuoy, perms: ['ticket:create', 'ticket:manage'], shortcut: 'G T' },
  { label: 'Maintenance', to: '/maintenance', icon: Wrench, perms: ['maintenance:manage', 'asset:view'], shortcut: 'G M' },
  { label: 'Reconciliation', to: '/reconciliation', icon: GitCompareArrows, perms: ['asset:assign', 'employee:manage'] },
  { label: 'Activity log', to: '/activity', icon: Activity, perms: ['history:view'] },
  { label: 'Scan', to: '/scan', icon: ScanLine, perms: ['asset:view', 'employee:view'], shortcut: 'G S' },
];

export const SETTINGS_NAV: NavItem[] = [
  { label: 'Asset catalog', to: '/settings/catalog', icon: Shapes, perms: ['catalog:manage'] },
  { label: 'Departments', to: '/settings/departments', icon: Briefcase, perms: ['org:manage'] },
  { label: 'Locations', to: '/settings/locations', icon: MapPin, perms: ['org:manage'] },
  { label: 'Vendors', to: '/settings/vendors', icon: Truck, perms: ['org:manage'] },
  { label: 'Users', to: '/settings/users', icon: UsersRound, perms: ['user:manage'] },
  { label: 'Roles & permissions', to: '/settings/roles', icon: ShieldCheck, perms: ['user:manage'] },
];

export interface QuickAddItem {
  kind: QuickAddKind;
  label: string;
  perms: Permission[];
}

/** The universal "+ Add" menu, in the order from the brief. */
export const QUICK_ADD: QuickAddItem[] = [
  { kind: 'employee', label: 'Employee', perms: ['employee:manage'] },
  { kind: 'asset', label: 'Asset', perms: ['asset:create'] },
  { kind: 'assetType', label: 'Asset type', perms: ['catalog:manage'] },
  { kind: 'category', label: 'Category', perms: ['catalog:manage'] },
  { kind: 'department', label: 'Department', perms: ['org:manage'] },
  { kind: 'location', label: 'Location', perms: ['org:manage'] },
  { kind: 'vendor', label: 'Vendor', perms: ['org:manage'] },
  { kind: 'request', label: 'Request', perms: ['request:create'] },
  { kind: 'ticket', label: 'Ticket', perms: ['ticket:create'] },
  { kind: 'maintenance', label: 'Maintenance', perms: ['maintenance:manage'] },
];
