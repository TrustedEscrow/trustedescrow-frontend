'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { formatAmount } from '@/sdk/amount';
import { fromHex, generateCode, releaseCodeHash, toHex } from '@/sdk/code';
import { ChainError } from '@/sdk/errors';
import { orderFromTerms, termsMismatches } from '@/sdk/terms';
import { sealCode, type VaultSecret } from '@/sdk/vault';
import { ApiError, api, type Draft } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { configProblems, railForToken, tokenDisplay } from '@/lib/config';
import { useAgreedTerms } from '@/lib/queries';
import { useStepUp } from '@/lib/step-up';
import { chain, useTx } from '@/lib/tx';
import { TermsSummary } from './escrow-bits';
import { WalletMismatch } from './SignIn';
import { Alert, Button, Card, ErrorText, Spinner } from './ui';
import { ProtectionChooser } from './Vault';

/**
 * The buyer's path from agreed terms to a deployed, verified escrow (ARCHITECTURE §7
 * "Deposit"). Funding happens on the escrow page, after the WASM pin check.
 *
 * Progress survives a reload in localStorage: the salt (so the escrow address is
 * stable), the committed code hash and, once created, the escrow address. The code
 * itself is never stored anywhere but the encrypted vault.
 */

interface Progress {
  salt: string;
  releaseCodeHash?: string;
  escrow?: string;
}

const key = (draftId: string) => `trustescrow.create.${draftId}`;

function loadProgress(draftId: string): Progress {
  try {
    const raw = localStorage.getItem(key(draftId));
    if (raw) return JSON.parse(raw) as Progress;
  } catch {
    /* fall through */
  }
  return { salt: toHex(crypto.getRandomValues(new Uint8Array(32))) };
}

export function CreateEscrow({ draft }: { draft: Draft }) {
  const { walletAddress } = useAuth();
  const { withStepUp } = useStepUp();
  const tx = useTx();
  const router = useRouter();
  const qc = useQueryClient();
  const terms = useAgreedTerms(draft.id);
  // Rendered only after the draft loads on the client, so localStorage is available here.
  const [progress, setProgressState] = useState<Progress>(() => loadProgress(draft.id));
  const [error, setError] = useState<unknown>(null);
  const [linking, setLinking] = useState(false);

  const setProgress = useCallback(
    (p: Progress) => {
      setProgressState(p);
      try {
        localStorage.setItem(key(draft.id), JSON.stringify(p));
      } catch {
        /* storage unavailable: the flow still completes in one sitting */
      }
    },
    [draft.id],
  );

  const factory = useQuery({ queryKey: ['factory-config'], queryFn: () => chain.assertPinnedFactory(), retry: false, staleTime: 60_000 });
  const problems = configProblems();

  // Stays above the early returns: a hook can't be called conditionally, or React sees a
  // different number of hooks once the terms load. `enabled` keeps it from running until
  // the terms are in and the buyer's own wallet is connected.
  const agreed = terms.data?.terms;
  const readiness = useQuery({
    queryKey: ['readiness', agreed?.token, walletAddress, agreed?.amount],
    queryFn: () => chain.readiness(agreed!.token, walletAddress!, BigInt(agreed!.amount)),
    enabled: !!agreed && !!walletAddress && walletAddress === agreed.buyer,
  });

  if (problems.length) return <Alert tone="danger" title="This build can't create escrows">{problems.join('; ')}</Alert>;
  if (terms.isLoading) return <Spinner />;
  if (terms.error) return <ErrorText error={terms.error} />;
  if (!terms.data) return null;

  const t = terms.data.terms;
  const rail = railForToken(t.token);
  const tok = tokenDisplay(t.token);
  const wrongWallet = !!walletAddress && walletAddress !== t.buyer;

  const r = readiness.data;
  const isNotReady = !!r && (!r.accountExists || !r.hasTrustline || !r.enough);

  const protect = async (secret: VaultSecret) => {
    setError(null);
    const code = generateCode();
    const hash = await releaseCodeHash(code);
    const envelope = await sealCode({ code, draftId: draft.id, releaseCodeHash: hash, secret });
    try {
      await api.putVault(draft.id, hash, envelope);
      setProgress({ ...progress, releaseCodeHash: hash });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CODE_HASH_IMMUTABLE') {
        // A code was already committed for this order (an earlier attempt). Codes are
        // never rotated, so continue with that one.
        const existing = await withStepUp(() => api.getVault(draft.id));
        setProgress({ ...progress, releaseCodeHash: existing.releaseCodeHash });
        return;
      }
      throw e;
    }
  };

  const verifyAndLink = async (escrow: string, codeHash: string) => {
    setLinking(true);
    setError(null);
    try {
      const snapshot = await chain.getEscrow(escrow);
      const mismatches = termsMismatches(t, terms.data!.termsHash, snapshot);
      if (snapshot.releaseCodeHash !== codeHash) mismatches.push('release_code_hash');
      if (mismatches.length) throw new Error(`The escrow does not commit the agreed terms (${mismatches.join(', ')}). Do not fund it.`);
      await chain.assertPinnedEscrow(escrow);
      try {
        await api.link(draft.id, escrow);
      } catch (e) {
        // The indexer links automatically when it sees the factory event; the escrow works regardless.
        if (!(e instanceof ApiError && e.code === 'ALREADY_LINKED')) console.warn('link failed', e);
      }
      try {
        localStorage.removeItem(key(draft.id));
      } catch {
        /* ignore */
      }
      await qc.invalidateQueries({ queryKey: ['draft', draft.id] });
      router.push(`/escrow/${escrow}`);
    } catch (e) {
      setError(e);
    } finally {
      setLinking(false);
    }
  };

  const create = async () => {
    if (!progress.releaseCodeHash) return;
    setError(null);
    const codeHash = progress.releaseCodeHash;
    const salt = fromHex(progress.salt);
    try {
      const res = await tx.run('Create escrow', async ({ sign, address, onStep }) => {
        if (address !== t.buyer) throw new Error('Switch Freighter to the buyer account named in the terms.');
        await chain.assertPinnedFactory();
        if (!(await chain.isTokenAllowed(t.token))) throw new Error('The factory does not allow this token.');
        const predicted = await chain.escrowAddress(address, salt);
        // A reload after a successful create reuses the salt; the address is then already taken.
        try {
          await chain.getEscrow(predicted);
          return { hash: undefined, escrow: predicted };
        } catch (e) {
          if (!(e instanceof ChainError && e.kind === 'not_found')) throw e;
        }
        const order = orderFromTerms(t, terms.data!.termsHash, codeHash);
        const created = await chain.createEscrow({ order, salt, sign, onStep });
        if (created.escrow !== predicted) throw new Error(`The factory deployed to ${created.escrow}, not the expected ${predicted}.`);
        return created;
      });
      setProgress({ ...progress, escrow: res.escrow });
      await verifyAndLink(res.escrow, codeHash);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="1. Check the agreed terms">
        <TermsSummary terms={t} feeBps={factory.data?.feeBps} />
        <p className="mt-3 text-xs text-muted">
          Terms hash <span className="font-mono">{terms.data.termsHash}</span>, computed on this device from revision {terms.data.revision}. This is what goes on-chain.
        </p>
        {!rail && <Alert tone="danger" className="mt-3">This order settles in a token this app does not know ({t.token}). Do not continue.</Alert>}
        {factory.error && <ErrorText error={factory.error} />}
        {factory.data && (
          <p className="mt-2 text-xs text-muted">
            Arbitrator <span className="font-mono">{factory.data.arbitrator}</span>. Platform fee {factory.data.feeBps / 100}% on release only.
          </p>
        )}
      </Card>

      <WalletMismatch expected={t.buyer} role="buyer" />

      <Card title="2. Protect your delivery code">
        {progress.releaseCodeHash ? (
          <Alert tone="success" title="Code created and stored encrypted">
            You&apos;ll reveal it from the escrow page when the item is in your hands.
          </Alert>
        ) : (
          <ProtectionChooser onChoose={protect} />
        )}
      </Card>

      <Card title="3. Create the escrow on-chain">
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Your wallet signs one transaction that deploys a contract for this trade only. Next you deposit {rail ? '' : 'the funds '}from the escrow page.
          </p>
          {r && !r.accountExists && (
            <Alert tone="warning" title="Account not created">
              Your wallet account is not funded on the network. Please add XLM to fund your account first.
            </Alert>
          )}
          {r && r.accountExists && !r.hasTrustline && (
            <div className="space-y-2">
              <Alert tone="warning" title="Trustline missing">
                Your wallet needs a {tok.symbol} trustline before creating or funding this escrow.
              </Alert>
              {r.asset && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void tx
                      .run(`Add ${tok.symbol} trustline`, ({ sign, address, onStep }) => chain.addTrustline(address, r.asset!, sign, onStep))
                      .then(() => readiness.refetch())
                      .catch(() => undefined)
                  }
                >
                  Add {tok.symbol} trustline
                </Button>
              )}
            </div>
          )}
          {r && r.hasTrustline && !r.enough && (
            <Alert tone="warning" title="Insufficient token balance">
              Wallet balance is {formatAmount(r.balance, tok.decimals, tok.symbol)}, but this escrow requires {formatAmount(BigInt(t.amount), tok.decimals, tok.symbol)}.
            </Alert>
          )}
          {progress.escrow ? (
            <Button busy={linking} onClick={() => void verifyAndLink(progress.escrow!, progress.releaseCodeHash!)}>
              Verify and open the escrow
            </Button>
          ) : (
            <Button disabled={!progress.releaseCodeHash || wrongWallet || !rail || !!factory.error || isNotReady} busy={linking} onClick={() => void create()}>
              Create escrow
            </Button>
          )}
          <ErrorText error={error} />
        </div>
      </Card>
    </div>
  );
}
