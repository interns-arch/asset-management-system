import { KeyRound, LogOut, Menu, Moon, Plus, ScanLine, Search, Sun } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageLoader } from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/overlays';
import { Avatar } from '@/components/ui/primitives';
import { useQuickAdd } from '@/features/quick-add/quick-add';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useHotkeys, useScannerInput } from '@/lib/hotkeys';
import { cn } from '@/lib/utils';
import { CommandPalette } from './command-palette';
import { MAIN_NAV, type NavItem, QUICK_ADD, SETTINGS_NAV } from './nav';
import { NotificationBell } from './notifications';

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('eam-theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  };
  return { dark, toggle };
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30">
        <svg viewBox="0 0 32 32" className="size-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 22 16 8l7 14M11.8 17h8.4" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">Asset Portal</span>
        <span className="block text-[11px] text-muted-foreground">Enterprise asset management</span>
      </span>
    </div>
  );
}

function NavSection({ title, items, onNavigate }: { title?: string; items: NavItem[]; onNavigate?: () => void }) {
  const { can } = useAuth();
  const visible = items.filter((i) => !i.perms || can(...i.perms));
  if (!visible.length) return null;
  return (
    <div className="space-y-0.5">
      {title && <p className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{title}</p>}
      {visible.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-foreground',
              isActive && 'bg-sidebar-accent text-foreground [&_svg]:text-primary',
            )
          }
        >
          <item.icon className="size-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
          <span className="flex-1 truncate">{item.label}</span>
          {item.shortcut && <span className="hidden text-[10px] tracking-wider text-muted-foreground/60 group-hover:inline">{item.shortcut}</span>}
        </NavLink>
      ))}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { me } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-sidebar-border px-3">
        <Brand />
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 scrollbar-thin">
        <NavSection items={MAIN_NAV.map((n) => (n.to === '/assets' && me && !me.permissions.includes('asset:view') ? { ...n, label: 'My assets' } : n))} onNavigate={onNavigate} />
        <NavSection title="Settings" items={SETTINGS_NAV} onNavigate={onNavigate} />
      </nav>
      <div className="border-t border-sidebar-border p-3 text-[11px] text-muted-foreground">
        Press <Kbd>?</Kbd> for keyboard shortcuts
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl / ⌘ + K', 'Search & command palette'],
  ['/', 'Search'],
  ['N', 'Quick add menu'],
  ['G then D / A / E / X', 'Dashboard / Assets / Employees / Exits'],
  ['G then R / T / M / S', 'Requests / Tickets / Maintenance / Scan'],
  ['J / K', 'Move down / up in a table'],
  ['Enter', 'Open the highlighted row'],
  ['X', 'Select the highlighted row'],
  ['[ / ]', 'Previous / next page'],
  ['Ctrl / ⌘ + Enter', 'Save the open form'],
  ['Esc', 'Close dialogs and panels'],
];

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      toast.success('Password changed. Other devices were signed out.');
      onOpenChange(false);
      setCurrent('');
      setNext('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <input className="h-9 rounded-md border bg-card px-3 text-sm" type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          <input className="h-9 rounded-md border bg-card px-3 text-sm" type="password" placeholder="New password (min 8 characters)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <Button type="submit" loading={busy} disabled={!current || next.length < 8}>
            Update password
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AppShell() {
  const { me, can, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const quickAdd = useQuickAdd();
  const theme = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [help, setHelp] = useState(false);
  const [pwd, setPwd] = useState(false);
  const adds = QUICK_ADD.filter((a) => can(...a.perms));

  useEffect(() => setMobileNav(false), [location.pathname]);

  useHotkeys(
    {
      'mod+k': () => setPaletteOpen((o) => !o),
      '/': () => setPaletteOpen(true),
      n: () => {
        if (!adds.length) return false;
        setAddOpen(true);
      },
      question: () => setHelp(true),
      '?': () => setHelp(true),
      'g d': () => void navigate('/'),
      'g a': () => void navigate('/assets'),
      'g e': () => void navigate('/employees'),
      'g x': () => void navigate('/exits'),
      'g r': () => void navigate('/requests'),
      'g t': () => void navigate('/tickets'),
      'g m': () => void navigate('/maintenance'),
      'g s': () => void navigate('/scan'),
    },
    [adds.length],
  );

  // USB barcode / QR scanners type fast and press Enter — jump straight to the asset.
  useScannerInput(async (code) => {
    if (location.pathname.startsWith('/exits/')) return; // the exit checklist handles scans itself
    try {
      const a = await api.get<{ id: string; assetTag: string }>('/assets/lookup', { code });
      navigate(`/assets/${a.id}`);
      toast.success(`Scanned ${a.assetTag}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarContent />
      </aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" size="sm" className="w-72 bg-sidebar p-0 sm:max-w-72">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 min-w-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md sm:px-5">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-xs transition hover:border-primary/40 sm:max-w-md"
          >
            <Search className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">
              <span className="sm:hidden">Search…</span>
              <span className="hidden sm:inline">Search assets, people, tags…</span>
            </span>
            <span className="hidden items-center gap-0.5 sm:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {adds.length > 0 && (
              <DropdownMenu open={addOpen} onOpenChange={setAddOpen}>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="size-4" />
                    <span className="hidden sm:inline">Add</span>
                    <Kbd className="hidden border-white/20 bg-white/15 text-primary-foreground sm:inline-flex">N</Kbd>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56"
                  onKeyDown={(e) => {
                    const n = Number(e.key);
                    if (n >= 1 && n <= adds.length) {
                      e.preventDefault();
                      setAddOpen(false);
                      quickAdd.open(adds[n - 1].kind);
                    }
                  }}
                >
                  <DropdownMenuLabel>Quick add</DropdownMenuLabel>
                  {adds.map((a, i) => (
                    <DropdownMenuItem key={a.kind} onSelect={() => quickAdd.open(a.kind)}>
                      <Plus />
                      {a.label}
                      {i < 9 && <DropdownMenuShortcut>{i + 1}</DropdownMenuShortcut>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="icon-sm" className="hidden sm:inline-flex" onClick={() => navigate('/scan')} aria-label="Scan QR or barcode" title="Scan">
              <ScanLine />
            </Button>
            <NotificationBell />
            <Button variant="ghost" size="icon-sm" className="hidden sm:inline-flex" onClick={theme.toggle} aria-label="Toggle dark mode" title="Theme">
              {theme.dark ? <Sun /> : <Moon />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ml-1 cursor-pointer rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" aria-label="Account">
                  <Avatar name={me?.user.name} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium">{me?.user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{me?.user.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Role: <span className="font-medium text-foreground">{me?.role.name}</span>
                  </p>
                </div>
                <DropdownMenuSeparator />
                {me?.employee && <DropdownMenuItem onSelect={() => navigate(`/employees/${me.employee!.id}`)}>My profile & assets</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => setPwd(true)}>
                  <KeyRound /> Change password
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={theme.toggle}>
                  {theme.dark ? <Sun /> : <Moon />} {theme.dark ? 'Light mode' : 'Dark mode'}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setHelp(true)}>
                  Keyboard shortcuts <DropdownMenuShortcut>?</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await logout();
                    navigate('/login');
                  }}
                >
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ChangePasswordDialog open={pwd} onOpenChange={setPwd} />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <ul className="divide-y text-sm">
            {SHORTCUTS.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-4 py-2">
                <span className="text-muted-foreground">{v}</span>
                <span className="font-mono text-xs font-medium">{k}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
