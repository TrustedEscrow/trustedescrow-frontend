'use client';

import { type ReactNode, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Alert, Button, Card, ErrorText, Field, Input, Spinner } from './ui';

export function SignInPanel() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Card title="Sign in with your Stellar wallet">
      <div className="space-y-3 text-sm text-slate-600">
        <p>TrustEscrow uses Freighter. Your wallet signs a message to prove you own the account. The message authorises no transaction.</p>
        <ErrorText error={error} />
        <Button
          busy={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await signIn();
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Connect Freighter and sign in
        </Button>
      </div>
    </Card>
  );
}

const TESTNET_STEPS: { title: string; body: ReactNode }[] = [
  {
    title: 'Install Freighter',
    body: (
      <>
        The Stellar wallet extension, from{' '}
        <a className="font-medium text-brand-700 underline underline-offset-2" href="https://www.freighter.app" target="_blank" rel="noreferrer">
          freighter.app
        </a>
        .
      </>
    ),
  },
  { title: 'Switch it to Testnet', body: 'In Freighter’s settings. Nothing here touches real funds.' },
  { title: 'Fund the account', body: 'Freighter offers to fund a new testnet account with Friendbot, Stellar’s free test-XLM faucet.' },
  {
    title: 'Get testnet USDC',
    body: (
      <>
        Add a USDC trustline, then claim some from{' '}
        <a className="font-medium text-brand-700 underline underline-offset-2" href="https://faucet.circle.com" target="_blank" rel="noreferrer">
          Circle’s faucet
        </a>{' '}
        to fund an escrow.
      </>
    ),
  },
];

/** The signed-out screen inside the app: sign-in, plus what a first-time testnet user needs. */
function SignInScreen() {
  return (
    <div className="mx-auto grid max-w-4xl gap-6 pt-4 md:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-4xl">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">Propose orders, fund escrows and release payment from one place.</p>
        </div>
        <SignInPanel />
      </div>
      <aside className="rounded-2xl bg-night p-6 text-white">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-300">First time on testnet?</p>
        <ol className="mt-4 space-y-4">
          {TESTNET_STEPS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[1.75rem_1fr] gap-2">
              <span className="font-display text-xl leading-none text-brand-300">{i + 1}</span>
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="mt-0.5 text-sm text-white/60 [&_a]:text-brand-300">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-xs text-white/40">To try a full trade, use two Freighter accounts: one as the buyer, one as the seller.</p>
      </aside>
    </div>
  );
}

function TwoFactorPanel() {
  const { completeTwoFactor, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeTwoFactor(code);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="New device: enter your 2FA code">
      <div className="space-y-3">
        <Field label="Authenticator or backup code">
          <Input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        </Field>
        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button busy={busy} disabled={!code} onClick={() => void submit()}>
            Verify
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Backend features need a session. On-chain escrow pages do not: see `allowAnonymous`. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Loading
      </p>
    );
  }
  if (status === 'pending_2fa') return <TwoFactorPanel />;
  if (status === 'signed_out') return <SignInScreen />;
  return <>{children}</>;
}

export function WalletMismatch({ expected, role }: { expected: string; role: string }) {
  const { walletAddress } = useAuth();
  if (!walletAddress || walletAddress === expected) return null;
  return (
    <Alert tone="warning" title={`Freighter is on a different account`}>
      This escrow&apos;s {role} is <span className="font-mono">{expected}</span>. Switch Freighter to that account to act as the {role}.
    </Alert>
  );
}
