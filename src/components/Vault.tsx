'use client';

import { useState } from 'react';
import { createVaultPasskey, openEnvelope, passkeyRawId, passkeysSupported, sealCode, type VaultEnvelope, type VaultSecret } from '@/sdk/vault';
import { ApiError, api, type VaultRead } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { useStepUp } from '@/lib/step-up';
import { DeliveryCodeDisplay } from './code';
import { Alert, Button, ErrorText, Field, Input } from './ui';

/**
 * Passkeys created on this device for the vault. Convenience only: an envelope names the
 * credential that opens it, so a synced passkey works from any device.
 */
const PASSKEYS_KEY = 'trustescrow.vaultPasskeys';

export function knownPasskeys(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PASSKEYS_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function rememberPasskey(rawId: string) {
  try {
    const all = new Set(knownPasskeys());
    all.add(rawId);
    localStorage.setItem(PASSKEYS_KEY, JSON.stringify([...all]));
  } catch {
    /* storage unavailable */
  }
}

export const MIN_PASSWORD = 10;

/** Lets the buyer choose how their code is protected: a passkey (PRF) or a password. */
export function ProtectionChooser({ onChoose, busy }: { onChoose: (secret: VaultSecret) => Promise<void>; busy?: boolean }) {
  const { me, walletAddress } = useAuth();
  const [mode, setMode] = useState<'passkey' | 'password'>(passkeysSupported() ? 'passkey' : 'password');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const existing = typeof window !== 'undefined' ? knownPasskeys() : [];

  const go = async (fn: () => Promise<void>) => {
    setWorking(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Your delivery code is created on this device and stored encrypted. TrustEscrow cannot read it. You&apos;ll reveal it only when the item is in your hands.
      </p>
      <div className="flex gap-2">
        {passkeysSupported() && (
          <Button variant={mode === 'passkey' ? 'primary' : 'secondary'} onClick={() => setMode('passkey')}>
            Passkey
          </Button>
        )}
        <Button variant={mode === 'password' ? 'primary' : 'secondary'} onClick={() => setMode('password')}>
          Password
        </Button>
      </div>

      {mode === 'passkey' ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">Recommended. Your phone or computer unlocks the code with your fingerprint, face or PIN. Synced passkeys also work on your other devices.</p>
          {existing.length > 0 && (
            <Button busy={working || busy} onClick={() => void go(() => onChoose({ kind: 'passkey', credentialId: existing[existing.length - 1]!, rpId: config.webauthnRpId }))}>
              Use my vault passkey
            </Button>
          )}
          <Button
            variant={existing.length ? 'secondary' : 'primary'}
            busy={working || busy}
            onClick={() =>
              void go(async () => {
                const rawId = await createVaultPasskey({ rpId: config.webauthnRpId, userName: walletAddress ?? me?.address ?? 'buyer' });
                rememberPasskey(rawId);
                await onChoose({ kind: 'passkey', credentialId: rawId, rpId: config.webauthnRpId });
              })
            }
          >
            {existing.length ? 'Create a new passkey' : 'Create a passkey'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Vault password" hint={`At least ${MIN_PASSWORD} characters. It never leaves this device, and nobody can reset it.`}>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Repeat password" error={confirm && confirm !== password ? 'Passwords differ' : undefined}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button
            busy={working || busy}
            disabled={password.length < MIN_PASSWORD || password !== confirm}
            onClick={() => void go(() => onChoose({ kind: 'password', password }))}
          >
            Protect with password
          </Button>
        </div>
      )}
      <Alert tone="info">If you lose access to your code, you can still confirm receipt by signing with your wallet. Nobody else can recover the code for you.</Alert>
      <ErrorText error={error} />
    </div>
  );
}

function EnvelopeUnlock({ envelope, onOpen }: { envelope: VaultEnvelope; onOpen: (secret: VaultSecret) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (secret: VaultSecret) => {
    setBusy(true);
    setError(null);
    try {
      await onOpen(secret);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const rawId = passkeyRawId(envelope.credentialId);
  return (
    <div className="space-y-2 rounded-lg p-3 ring-1 ring-line">
      {envelope.kdf.name === 'pbkdf2-sha256' ? (
        <>
          <Field label="Vault password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run({ kind: 'password', password })} />
          </Field>
          <Button busy={busy} disabled={!password} onClick={() => void run({ kind: 'password', password })}>
            Unlock
          </Button>
        </>
      ) : rawId ? (
        <Button busy={busy} onClick={() => void run({ kind: 'passkey', credentialId: rawId, rpId: config.webauthnRpId })}>
          Unlock with passkey
        </Button>
      ) : (
        <p className="text-sm text-muted">This copy of the code uses a method this browser can&apos;t open.</p>
      )}
      <ErrorText error={error} />
    </div>
  );
}

/**
 * Reveals the buyer's code: step up, fetch the ciphertext, decrypt on this device, check
 * it against the committed on-chain hash, then show it behind the handover warning.
 */
export function RevealCode({ draftId, releaseCodeHash }: { draftId: string; releaseCodeHash: string }) {
  const { withStepUp } = useStepUp();
  const [vault, setVault] = useState<VaultRead | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [added, setAdded] = useState(false);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const v = await withStepUp(() => api.getVault(draftId));
      if (v.releaseCodeHash !== releaseCodeHash.toLowerCase()) throw new Error('The stored code does not match this escrow’s on-chain code. Do not use it.');
      setVault(v);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? new Error('No delivery code is stored for this order. Confirm receipt with your wallet instead.') : e);
    } finally {
      setBusy(false);
    }
  };

  const addPasskey = async (plain: string) => {
    const rawId = await createVaultPasskey({ rpId: config.webauthnRpId, userName: 'buyer' });
    rememberPasskey(rawId);
    const envelope = await sealCode({ code: plain, draftId, releaseCodeHash, secret: { kind: 'passkey', credentialId: rawId, rpId: config.webauthnRpId } });
    await withStepUp(() => api.putVault(draftId, releaseCodeHash, envelope));
    setAdded(true);
  };

  if (code) {
    return (
      <div className="space-y-3">
        <DeliveryCodeDisplay code={code} onHide={() => setCode(null)} />
        {passkeysSupported() && vault && !vault.envelopes.some((e) => e.kdf.name === 'webauthn-prf') && !added && (
          <Button variant="ghost" onClick={() => void addPasskey(code).catch(setError)}>
            Also protect this code with a passkey on this device
          </Button>
        )}
        {added && <Alert tone="success">Passkey added.</Alert>}
        <ErrorText error={error} />
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="space-y-2">
        <Button variant="secondary" busy={busy} onClick={() => void load()}>
          Reveal my delivery code
        </Button>
        <ErrorText error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Unlock your code. It is decrypted on this device and never sent anywhere.</p>
      {vault.envelopes.map((env) => (
        <EnvelopeUnlock
          key={env.credentialId}
          envelope={env}
          onOpen={async (secret) => setCode(await openEnvelope({ envelope: env, draftId, releaseCodeHash, secret }))}
        />
      ))}
    </div>
  );
}
