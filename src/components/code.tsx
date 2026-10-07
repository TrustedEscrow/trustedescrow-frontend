'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { display, InvalidCodeError, normalise, releaseCodeHash } from '@/sdk/code';
import { Alert, Button, cx, Input } from './ui';

/** The warning ARCHITECTURE §7 requires at the moment the code is revealed. */
export function CodeWarning() {
  return (
    <Alert tone="danger" title="This code is the money">
      <p>Whoever holds this code can release the payment once the seller has submitted proof.</p>
      <p>
        <strong>Only give it when the item is in your hands and you have checked it.</strong> Never give it before, never send it in chat, never read it
        out to someone who calls you. TrustEscrow will never ask for it.
      </p>
    </Alert>
  );
}

/**
 * Shows the buyer's code only after they confirm they are holding the goods, then
 * as a grouped string and a QR code for in-person handover.
 */
export function DeliveryCodeDisplay({ code, onHide }: { code: string; onHide?: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!acknowledged) return;
    let cancelled = false;
    void QRCode.toDataURL(display(code), { errorCorrectionLevel: 'M', margin: 1, width: 240 }).then((url) => !cancelled && setQr(url));
    return () => {
      cancelled = true;
    };
  }, [acknowledged, code]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(display(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <CodeWarning />
      {!acknowledged ? (
        <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
          <input type="checkbox" className="mt-1 h-4 w-4" onChange={(e) => setAcknowledged(e.target.checked)} />
          <span>I have the item in my hands and I have checked it matches the agreed terms.</span>
        </label>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-4 ring-2 ring-brand-600">
          <p className="font-code select-all text-center text-2xl font-bold sm:text-3xl" aria-label={`Delivery code ${[...code].join(' ')}`}>
            {display(code)}
          </p>
          <Button variant="ghost" onClick={() => void copyCode()} className="text-xs">
            {copied ? '✓ Copied to clipboard' : 'Copy delivery code'}
          </Button>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on device */}
          {qr && <img src={qr} alt="QR code of the delivery code" width={240} height={240} className="rounded" />}
          <p className="text-xs text-slate-500">The seller scans or types this. Letters I, L and O are read as 1, 1 and 0.</p>
        </div>
      )}
      {onHide && (
        <Button variant="secondary" onClick={onHide} className="w-full">
          Hide code
        </Button>
      )}
    </div>
  );
}

type CodeStatus = { kind: 'empty' } | { kind: 'invalid'; message: string } | { kind: 'checking' } | { kind: 'mismatch' } | { kind: 'ok'; canonical: string };

/**
 * Input for a code the seller was handed. Normalises as the contract expects and, when
 * the committed hash is known, checks it on this device before anything is signed.
 */
export function CodeInput({ expectedHash, onValid, autoFocus }: { expectedHash?: string; onValid: (canonical: string | null) => void; autoFocus?: boolean }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<CodeStatus>({ kind: 'empty' });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!value.trim()) {
        setStatus({ kind: 'empty' });
        onValid(null);
        return;
      }
      let canonical: string;
      try {
        canonical = normalise(value);
      } catch (e) {
        setStatus({ kind: 'invalid', message: e instanceof InvalidCodeError ? e.message : 'Invalid code' });
        onValid(null);
        return;
      }
      if (!expectedHash) {
        setStatus({ kind: 'ok', canonical });
        onValid(canonical);
        return;
      }
      setStatus({ kind: 'checking' });
      const matches = (await releaseCodeHash(canonical)) === expectedHash.toLowerCase();
      if (cancelled) return;
      setStatus(matches ? { kind: 'ok', canonical } : { kind: 'mismatch' });
      onValid(matches ? canonical : null);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [value, expectedHash, onValid]);

  return (
    <div className="space-y-1">
      <Input
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        className={cx('font-code text-lg uppercase', status.kind === 'ok' && 'ring-emerald-500', (status.kind === 'mismatch' || status.kind === 'invalid') && 'ring-red-400')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <p className="text-xs">
        {status.kind === 'invalid' && <span className="text-red-700">{status.message}</span>}
        {status.kind === 'mismatch' && <span className="text-red-700">This is not the code for this escrow. Check each character.</span>}
        {status.kind === 'ok' && expectedHash && <span className="text-emerald-700">✓ Matches this escrow&apos;s committed code (checked on this device)</span>}
        {status.kind === 'ok' && !expectedHash && <span className="text-slate-600">Reads as {display(status.canonical)}</span>}
        {status.kind === 'empty' && <span className="text-slate-500">16 characters. Hyphens and spaces are ignored.</span>}
      </p>
    </div>
  );
}
