import { Camera, CameraOff, Loader2, ScanLine, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';

/** Camera-based QR / barcode reader. Returns a stop function. */
export async function startCameraScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
    if (result) onCode(result.getText());
  });
  return () => controls.stop();
}

export function CameraScanner({ onCode, className }: { onCode: (code: string) => void; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const [state, setState] = useState<'idle' | 'starting' | 'on' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onCode);
  cb.current = onCode;

  const start = async () => {
    if (!video.current) return;
    setState('starting');
    try {
      stop.current = await startCameraScanner(video.current, (code) => {
        // Ignore repeats of the same code within 2.5s.
        if (last.current && last.current.code === code && Date.now() - last.current.at < 2500) return;
        last.current = { code, at: Date.now() };
        cb.current(code);
      });
      setState('on');
    } catch (err) {
      setError(err instanceof Error && err.name === 'NotAllowedError' ? 'Camera permission was denied.' : 'No camera available on this device.');
      setState('error');
    }
  };
  const halt = () => {
    stop.current?.();
    stop.current = null;
    setState('idle');
  };
  useEffect(() => () => stop.current?.(), []);

  return (
    <div className={className}>
      <div className="relative aspect-video overflow-hidden rounded-xl border bg-black">
        <video ref={video} className="size-full object-cover" muted playsInline />
        {state !== 'on' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-300">
            {state === 'starting' ? <Loader2 className="size-7 animate-spin" /> : <Camera className="size-8 opacity-70" />}
            {error && <p className="text-sm text-red-300">{error}</p>}
            <Button size="sm" variant="secondary" onClick={start} disabled={state === 'starting'}>
              {state === 'error' ? 'Try again' : 'Start camera'}
            </Button>
          </div>
        )}
        {state === 'on' && <div className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />}
      </div>
      {state === 'on' && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={halt}>
          <CameraOff /> Stop camera
        </Button>
      )}
    </div>
  );
}

export default function ScanPage() {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setBusy(true);
    try {
      const a = await api.get<{ id: string; assetTag: string; name: string }>('/assets/lookup', { code: value });
      toast.success(`${a.assetTag} · ${a.name}`);
      navigate(`/assets/${a.id}`, { replace: !!routeCode });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Opened from a QR code URL: /scan/<token>
  useEffect(() => {
    if (routeCode) void lookup(routeCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCode]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Scan" description="Scan a QR code or barcode, or type an asset tag or serial number." />
      <Card>
        <CardContent className="space-y-5 pt-5">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(code);
            }}
          >
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="LAP-000123, serial, or scan with a USB scanner…" className="h-11 pl-9 font-mono" />
            </div>
            <Button type="submit" className="h-11" loading={busy}>
              <Search /> Find
            </Button>
          </form>
          <CameraScanner onCode={(c) => void lookup(c)} />
        </CardContent>
      </Card>
    </div>
  );
}
