import { loginSchema } from '@eam/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Boxes, LogOut, ScanLine, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { errorOf, Field, useZodForm } from '@/components/common/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCompanyName } from '@/lib/config';

const DEMO = [
  { email: 'admin@cartrend.test', role: 'Admin' },
  { email: 'it@cartrend.test', role: 'IT / Asset manager' },
  { email: 'hr@cartrend.test', role: 'HR' },
  { email: 'manager@cartrend.test', role: 'Manager' },
  { email: 'rahul@cartrend.test', role: 'Employee (view only)' },
  { email: 'CT000099', role: 'Employee ID, no email' },
];

export default function LoginPage() {
  const { me, refresh } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(loginSchema, { login: '', password: '' });
  const next = params.get('next') || '/';
  const company = useCompanyName();

  if (me) return <Navigate to={next} replace />;

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/auth/login', values);
      // Drop anything cached for a previous user, then load the new session.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      await refresh();
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
            <svg viewBox="0 0 32 32" className="size-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 22 16 8l7 14M11.8 17h8.4" />
            </svg>
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-semibold">{company.full ?? 'Asset Portal'}</span>
            {company.full && <span className="block text-xs text-indigo-100">Asset Portal</span>}
          </span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Every asset your company owns, in one place.</h1>
          <p className="mt-4 text-lg text-indigo-100">Laptops to forklifts, SIM cards to software licences — track who has what, where it is and what happened to it.</p>
          <ul className="mt-10 space-y-4 text-indigo-50">
            {[
              { icon: Boxes, text: 'Any asset type with your own fields — no code changes' },
              { icon: LogOut, text: 'Exit clearance that finds every asset a leaver holds' },
              { icon: ScanLine, text: 'QR & barcode labels, scan to find or return' },
              { icon: ShieldCheck, text: 'Roles, permissions and a tamper-proof history' },
            ].map((f) => (
              <li key={f.text} className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <f.icon className="size-4" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-center p-6 sm:p-10">
        <div className="w-full min-w-0 max-w-sm">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <svg viewBox="0 0 32 32" className="size-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 22 16 8l7 14M11.8 17h8.4" />
              </svg>
            </span>
            <span className="leading-tight">
              <span className="block font-semibold">{company.short ?? 'Asset Portal'}</span>
              <span className="block text-xs text-muted-foreground">Asset Portal</span>
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use your login ID, employee ID (e.g. CT000099) or email.</p>
          {(next.startsWith('/id/') || next.startsWith('/scan/')) && (
            <p className="mt-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              QR scanned — sign in once and it opens {next.startsWith('/id/') ? `employee ${decodeURIComponent(next.slice(4))}` : 'the asset'}.
            </p>
          )}
          <form className="mt-8 grid gap-4" onSubmit={submit} noValidate>
            <Field label="Login ID, employee ID or email" error={errorOf(form, 'login')} htmlFor="login">
              <Input
                id="login"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                placeholder="CT000099 or you@company.com"
                className="h-11 text-base sm:h-9 sm:text-sm"
                {...form.register('login')}
              />
            </Field>
            <Field label="Password" error={errorOf(form, 'password')} htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" className="h-11 text-base sm:h-9 sm:text-sm" {...form.register('password')} />
            </Field>
            {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
            <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
              Sign in <ArrowRight />
            </Button>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-10 rounded-xl border bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground">Demo accounts · password Demo@1234</p>
              <div className="mt-2.5 grid gap-1.5">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    className="flex cursor-pointer items-center justify-between rounded-md border bg-card px-3 py-2 text-left text-sm transition hover:border-primary/40"
                    onClick={() => {
                      form.setValue('login', d.email);
                      form.setValue('password', 'Demo@1234');
                      void submit();
                    }}
                  >
                    <span className="min-w-0 truncate font-medium">{d.email}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{d.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
