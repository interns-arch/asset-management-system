import JsBarcode from 'jsbarcode';
import QRCodeLib from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** The URL encoded in an asset's QR code. Scanning it with a phone opens the asset. */
export function qrUrl(qrCode: string): string {
  return `${window.location.origin}/scan/${qrCode}`;
}

export function QRCode({ value, size = 128, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCodeLib.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M' })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src ? (
    <img src={src} width={size} height={size} alt="QR code" className={cn('rounded bg-white', className)} />
  ) : (
    <div style={{ width: size, height: size }} className={cn('animate-pulse rounded bg-muted', className)} />
  );
}

export function Barcode({ value, height = 36, className }: { value: string; height?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', height, displayValue: false, margin: 0, width: 1.4, background: 'transparent' });
    } catch {
      /* invalid value: leave empty */
    }
  }, [value, height]);
  return <svg ref={ref} className={cn('max-w-full', className)} />;
}
