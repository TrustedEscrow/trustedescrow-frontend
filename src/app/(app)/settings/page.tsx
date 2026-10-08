'use client';

import { StrKey } from '@stellar/stellar-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { type ReactNode, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/SignIn';
import { Addr, Alert, Badge, Button, Card, ErrorText, Field, Input, PageTitle } from '@/components/ui';
import { knownPasskeys, rememberPasskey } from '@/components/Vault';
import { createVaultPasskey, passkeysSupported } from '@/sdk/vault';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { useStepUp } from '@/lib/step-up';
import { formatDate } from '@/lib/time';

function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

function Profile() {
  const { me, refreshMe } = useAuth();
  const [name, setName] = useState(me?.displayName ?? '');
  const { busy, error, run } = useAction();
  return (
    <Card title="Profile">
      <div className="space-y-3">
        <p className="text-sm">
          Signed in as <Addr value={me?.address} />
        </p>
        <Field label="Display name" hint="Shown to people you trade with.">
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <Button busy={busy === 'name'} onClick={() => void run('name', async () => (await api.updateMe(name.trim() || null), refreshMe()))}>
          Save
        </Button>
      </div>
    </Card>
  );
}

function Email() {
  const { me, refreshMe } = useAuth();
  const [email, setEmail] = useState(me?.email ?? '');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <Card title="Email reminders">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Deadline reminders by email. Delivery codes are never sent by email or SMS.</p>
        {me?.email && <p className="text-sm">{me.email} {me.emailVerified ? <Badge className="bg-emerald-100 text-emerald-800">verified</Badge> : <Badge>not verified</Badge>}</p>}
        <Field label="Email address">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {sent && <Alert tone="success">Check your inbox for a verification link.</Alert>}
        <ErrorText error={error} />
        <Button busy={busy === 'email'} disabled={!email.includes('@')} onClick={() => void run('email', async () => (await api.setEmail(email.trim()), setSent(true), refreshMe()))}>
          Send verification link
        </Button>
      </div>
    </Card>
  );
}

function Payout() {
  const { me, refreshMe } = useAuth();
  const { withStepUp } = useStepUp();
  const [address, setAddress] = useState('');
  const { busy, error, run } = useAction();
  const valid = StrKey.isValidEd25519PublicKey(address.trim()) || StrKey.isValidContract(address.trim());
  return (
    <Card title="Payout address">
      <div className="space-y-3">
        <p className="text-sm">
          When you sell, you are paid at <Addr value={me?.payoutAddress} />
        </p>
        <Alert tone="warning">Changing this redirects future sales. Open orders keep the address in their agreed terms. You&apos;ll need to verify again, and you&apos;ll be notified.</Alert>
        <Field label="New payout address">
          <Input className="font-mono" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="G…" spellCheck={false} />
        </Field>
        <ErrorText error={error} />
        <Button
          variant="secondary"
          busy={busy === 'payout'}
          disabled={!valid}
          onClick={() => void run('payout', async () => (await withStepUp(() => api.setPayoutAddress(address.trim())), setAddress(''), refreshMe()))}
        >
          Change payout address
        </Button>
      </div>
    </Card>
  );
}

function TwoFactor() {
  const { me, refreshMe } = useAuth();
  const { withStepUp } = useStepUp();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState<string[] | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (setup) void QRCode.toDataURL(setup.otpauthUri, { margin: 1, width: 200 }).then(setQr);
  }, [setup]);

  let body: ReactNode;
  if (backup) {
    body = (
      <div className="space-y-3">
        <Alert tone="warning" title="Save these backup codes now">
          Each works once if you lose your authenticator. They won&apos;t be shown again.
        </Alert>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
          {backup.map((c) => (
            <li key={c} className="rounded bg-slate-50 px-2 py-1">
              {c}
            </li>
          ))}
        </ul>
        <Button onClick={() => setBackup(null)}>I&apos;ve saved them</Button>
      </div>
    );
  } else if (me?.twoFactorEnabled) {
    body = (
      <div className="space-y-3">
        <p className="text-sm">
          <Badge className="bg-emerald-100 text-emerald-800">On</Badge> Required for new devices, revealing delivery codes, payout changes and dispute statements.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" busy={busy === 'backup'} onClick={() => void run('backup', async () => setBackup((await withStepUp(() => api.backupCodes())).backupCodes))}>
            New backup codes
          </Button>
        </div>
        <Field label="Code to turn 2FA off">
          <Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Button variant="danger" busy={busy === 'disable'} disabled={!code} onClick={() => void run('disable', async () => (await withStepUp(() => api.twoFactorDisable(code.trim())), setCode(''), refreshMe()))}>
          Turn off 2FA
        </Button>
      </div>
    );
  } else if (setup) {
    body = (
      <div className="space-y-3">
        <p className="text-sm">Scan this with an authenticator app, then enter the 6-digit code.</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on device */}
        {qr && <img src={qr} alt="Authenticator QR code" width={200} height={200} />}
        <p className="break-all font-mono text-xs">{setup.secret}</p>
        <Field label="6-digit code">
          <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Alert tone="info">Turning on 2FA signs out your other sessions.</Alert>
        <Button
          busy={busy === 'enable'}
          disabled={!/^\d{6}$/.test(code.trim())}
          onClick={() =>
            void run('enable', async () => {
              const res = await withStepUp(() => api.twoFactorEnable(code.trim()));
              setBackup(res.backupCodes);
              setSetup(null);
              setCode('');
              await refreshMe();
            })
          }
        >
          Turn on 2FA
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Without 2FA, sensitive actions ask for a fresh wallet signature. An authenticator app adds a second factor your wallet can&apos;t replace.</p>
        <Button busy={busy === 'setup'} onClick={() => void run('setup', async () => setSetup(await withStepUp(() => api.twoFactorSetup())))}>
          Set up 2FA
        </Button>
      </div>
    );
  }
  return (
    <Card title="Two-factor authentication">
      {body}
      <div className="mt-3">
        <ErrorText error={error} />
      </div>
    </Card>
  );
}

function Passkeys() {
  const { me } = useAuth();
  // Rendered only on the client after sign-in, so localStorage is readable here.
  const [list, setList] = useState<string[]>(knownPasskeys);
  const { busy, error, run } = useAction();
  return (
    <Card title="Delivery code passkeys on this device">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Passkeys unlock your delivery codes. They are separate from your wallet and never leave your device or password manager.</p>
        {list.length ? <p className="text-sm">{list.length} passkey{list.length > 1 ? 's' : ''} created here.</p> : <p className="text-sm text-slate-500">None created on this device.</p>}
        {passkeysSupported() ? (
          <Button
            variant="secondary"
            busy={busy === 'passkey'}
            onClick={() =>
              void run('passkey', async () => {
                const id = await createVaultPasskey({ rpId: config.webauthnRpId, userName: me?.address ?? 'buyer' });
                rememberPasskey(id);
                setList(knownPasskeys());
              })
            }
          >
            Create a passkey
          </Button>
        ) : (
          <Alert tone="info">This browser doesn&apos;t support passkeys. Use a vault password instead.</Alert>
        )}
        <ErrorText error={error} />
      </div>
    </Card>
  );
}

function SessionsAndDevices() {
  const qc = useQueryClient();
  const { withStepUp } = useStepUp();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.sessions() });
  const devices = useQuery({ queryKey: ['devices'], queryFn: () => api.devices() });
  const { error, run } = useAction();
  return (
    <Card title="Sessions and devices">
      <div className="space-y-4">
        <ul className="divide-y divide-slate-100 text-sm">
          {sessions.data?.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {s.device_label ?? 'Unknown device'} {s.current && <Badge className="bg-brand-100 text-brand-800">this session</Badge>}
                <span className="block text-xs text-slate-500">
                  since {formatDate(s.created_at)} · {s.ip ?? ''}
                </span>
              </span>
              {!s.current && (
                <Button variant="ghost" onClick={() => void run('revoke', async () => (await api.revokeSession(s.id), qc.invalidateQueries({ queryKey: ['sessions'] })))}>
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
        <h3 className="text-sm font-semibold">Trusted devices</h3>
        <ul className="divide-y divide-slate-100 text-sm">
          {devices.data?.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {d.label ?? 'Unknown device'} {d.trusted_at ? <Badge>trusted</Badge> : <Badge className="bg-amber-100 text-amber-900">untrusted</Badge>}
                <span className="block text-xs text-slate-500">last seen {formatDate(d.last_seen_at)}</span>
              </span>
              {d.trusted_at && (
                <Button variant="ghost" onClick={() => void run('forget', async () => (await withStepUp(() => api.forgetDevice(d.id)), qc.invalidateQueries({ queryKey: ['devices'] }), qc.invalidateQueries({ queryKey: ['sessions'] })))}>
                  Forget
                </Button>
              )}
            </li>
          ))}
        </ul>
        <ErrorText error={error} />
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <div className="space-y-5">
        <PageTitle>Settings</PageTitle>
        <div className="grid gap-5 lg:grid-cols-2">
          <Profile />
          <Email />
          <Payout />
          <TwoFactor />
          <Passkeys />
          <SessionsAndDevices />
        </div>
      </div>
    </RequireAuth>
  );
}
