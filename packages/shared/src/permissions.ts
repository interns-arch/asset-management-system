export const PERMISSIONS = {
  'dashboard:view': 'View the organisation dashboard',
  'asset:view': 'View all assets',
  'asset:create': 'Add assets',
  'asset:edit': 'Edit asset details',
  'asset:assign': 'Assign, transfer and return assets',
  'asset:lifecycle': 'Receive, retire, dispose and mark assets lost/found',
  'catalog:manage': 'Manage categories, asset types and custom fields',
  'org:manage': 'Manage companies, departments, locations and vendors',
  'employee:view': 'View employees',
  'employee:manage': 'Add and edit employees',
  'employee:status': 'Change employee status (notice period, leave, exit)',
  'exit:view': 'View exit cases',
  'exit:manage': 'Recover assets from exiting employees',
  'exit:override': 'Complete an exit with uncleared assets (override)',
  'request:create': 'Raise asset requests',
  'request:approve': 'Approve or reject asset requests',
  'request:fulfil': 'Fulfil approved requests',
  'ticket:create': 'Raise tickets',
  'ticket:manage': 'Manage all tickets',
  'maintenance:manage': 'Manage maintenance',
  'history:view': 'View the organisation-wide activity log',
  'user:manage': 'Manage users and roles',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  {
    label: 'Assets',
    permissions: ['asset:view', 'asset:create', 'asset:edit', 'asset:assign', 'asset:lifecycle', 'catalog:manage'],
  },
  { label: 'People & organisation', permissions: ['employee:view', 'employee:manage', 'employee:status', 'org:manage'] },
  { label: 'Employee exit', permissions: ['exit:view', 'exit:manage', 'exit:override'] },
  {
    label: 'Service',
    permissions: ['request:create', 'request:approve', 'request:fulfil', 'ticket:create', 'ticket:manage', 'maintenance:manage'],
  },
  { label: 'Administration', permissions: ['dashboard:view', 'history:view', 'user:manage'] },
];

export interface RoleTemplate {
  name: string;
  description: string;
  permissions: Permission[];
}

export const SYSTEM_ROLES: RoleTemplate[] = [
  { name: 'Admin', description: 'Full access to everything', permissions: ALL_PERMISSIONS },
  { name: 'IT / Asset Manager', description: 'Full access: assets, people, logins and settings', permissions: ALL_PERMISSIONS },
  {
    name: 'HR',
    description: 'Manages employees, notice periods and exits',
    permissions: [
      'dashboard:view',
      'asset:view',
      'employee:view',
      'employee:manage',
      'employee:status',
      'exit:view',
      'exit:override',
      'request:create',
      'ticket:create',
    ],
  },
  {
    name: 'Manager',
    description: 'Views assets and employees, approves requests',
    permissions: ['dashboard:view', 'asset:view', 'employee:view', 'exit:view', 'request:create', 'request:approve', 'ticket:create'],
  },
  {
    name: 'Employee',
    description: 'View only: my assets and my QR, plus requests and tickets',
    permissions: ['request:create', 'ticket:create'],
  },
];
