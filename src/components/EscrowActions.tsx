'use client';

import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useCallback, useState } from 'react';
import { type AvailableAction, availableActions, has, type Viewer } from '@/sdk/actions';
import { formatAmount } from '@/sdk/amount';
import { type Call, escrowCalls } from '@/sdk/chain';
import { hashFile, hashStatement, PROOF_KIND_HELP, uriProblem } from '@/sdk/proof';
import { PROOF_KINDS_BY_METHOD, termsMismatches, type AgreedTerms } from '@/sdk/terms';
import { type EscrowSnapshot, payoutOnRelease, type ProofKind } from '@/sdk/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { config, tokenDisplay } from '@/lib/config';
import { useEscrowWasm } from '@/lib/queries';
import { formatDate, useNow } from '@/lib/time';
import { chain, useTx } from '@/lib/tx';
import { CodeInput } from './code';
import { Amount } from './escrow-bits';
import { Alert, Button, ErrorText, Field, Input, Select, Textarea } from './ui';
import { RevealCode } from './Vault';

interface Ctx {
  e: EscrowSnapshot;
  terms?: { terms: AgreedTerms; termsHash: string } | null;
  draftId: string | null;
  signedIn: boolean;
  onChanged: () => void;
}

function useRunCall(ctx: Ctx) {
  const tx = useTx();
  return useCallback(
    async (title: string, call: Call | (() => Promise<Call>), before?: () => Promise<void>) => {
      try {
        await tx.run(title, async ({ sign, address, onStep }) => {
          await before?.();
          const resolved = typeof call === 'function' ? await call() : call;
          return chain.escrow(ctx.e.contractId, address, sign, onStep)(resolved);
        });
        ctx.onChanged();
        return true;
      } catch {
        return false; // shown in the transaction dialog
      }
    },
    [tx, ctx],
  );
}

function Section({ title, children, tone }: { title: string; children: ReactNode; tone?: 'danger' }) {
  return (
    <div className={tone === 'danger' ? 'space-y-3 rounded-lg p-4 ring-1 ring-red-200' : 'space-y-3 rounded-lg p-4 ring-1 ring-slate-200'}>
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Secondary({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-lg ring-1 ring-slate-200 [&_summary]:cursor-pointer">
      <summary className="p-3 text-sm font-medium text-slate-700">{title}</summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

function Check({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className={ok === null ? 'text-slate-400' : ok ? 'text-emerald-700' : 'text-red-700'}>{ok === null ? '…' : ok ? '✓' : '✗'}</span>
      <span>{children}</span>
    </li>
  );
}

// --- buyer: deposit ---------------------------------------------------------------

function FundPanel(ctx: Ctx) {
  const { e, terms } = ctx;
  const { walletAddress } = useAuth();
  const tx = useTx();
  const run = useRunCall(ctx);
  const pin = useEscrowWasm(e.contractId);
  const t = tokenDisplay(e.token);
  const readiness = useQuery({
    queryKey: ['readiness', e.contractId, walletAddress],
    queryFn: () => chain.readiness(e.token, walletAddress!, e.amount),
    enabled: !!walletAddress,
  });
  const pinned = pin.data === undefined ? null : pin.data === config.escrowWasmHash;
  const mismatches = terms ? termsMismatches(terms.terms, terms.termsHash, e) : null;
  const r = readiness.data;
  const ready = pinned === true && !!r?.enough && (mismatches === null || mismatches.length === 0);

  return (
    <Section title={`Deposit ${formatAmount(e.amount, t.decimals, t.symbol)}`}>
      <p className="text-sm text-slate-600">
        The contract holds the funds. It pays the seller only after their proof of delivery and your receipt, or an arbitrator&apos;s ruling. Deposit before{' '}
        {formatDate(e.fundingDeadline)}.
      </p>
      <ul className="space-y-1">
        <Check ok={pinned}>Runs the audited escrow contract</Check>
        <Check ok={mismatches === null ? null : mismatches.length === 0}>
          {mismatches === null ? 'Agreed terms not loaded; sign in to compare them' : mismatches.length ? `Differs from the agreed terms: ${mismatches.join(', ')}` : 'Commits exactly the agreed terms'}
        </Check>
        {r && !r.accountExists && <Check ok={false}>Your account is not funded on {config.network}. Add some XLM first.</Check>}
        {r?.accountExists && <Check ok={r.hasTrustline}>{r.hasTrustline ? `${t.symbol} trustline present` : `Your account needs a ${t.symbol} trustline`}</Check>}
        {r?.hasTrustline && (
          <Check ok={r.enough}>
            Balance {formatAmount(r.balance, t.decimals, t.symbol)}
            {!r.enough && `, need ${formatAmount(e.amount, t.decimals, t.symbol)}`}
          </Check>
        )}
      </ul>
      {r?.accountExists && !r.hasTrustline && r.asset && (
        <Button
          variant="secondary"
          onClick={() =>
            void tx
              .run(`Add ${t.symbol} trustline`, ({ sign, address, onStep }) => chain.addTrustline(address, r.asset!, sign, onStep))
              .then(() => readiness.refetch())
              .catch(() => undefined)
          }
        >
          Add {t.symbol} trustline
        </Button>
      )}
      {pinned === false && <Alert tone="danger">This escrow is not running the audited contract. Do not deposit.</Alert>}
      <Button disabled={!ready} onClick={() => void run('Deposit', escrowCalls.fund(), () => chain.assertPinnedEscrow(e.contractId))}>
        Deposit {formatAmount(e.amount, t.decimals, t.symbol)}
      </Button>
    </Section>
  );
}

// --- seller: proof of delivery -----------------------------------------------------

function ProofForm({ ctx, withCode, warning }: { ctx: Ctx; withCode: boolean; warning?: string }) {
  const { e, terms, draftId, signedIn } = ctx;
  const run = useRunCall(ctx);
  const allowed: readonly ProofKind[] = terms ? PROOF_KINDS_BY_METHOD[terms.terms.delivery.method] : ['Tracking', 'Content', 'Attestation'];
  const preferred: ProofKind = withCode && allowed.includes('Attestation') ? 'Attestation' : terms && allowed.includes(terms.terms.delivery.proofKind) ? terms.terms.delivery.proofKind : allowed[0]!;
  const [kind, setKind] = useState<ProofKind>(preferred);
  const [uri, setUri] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [statement, setStatement] = useState(
    withCode ? `Handed over in person on ${new Date().toLocaleDateString()}. The buyer inspected the item and gave me their delivery code.` : '',
  );
  const [code, setCode] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const onCode = useCallback((c: string | null) => setCode(c), []);

  const uriErr = uri || kind !== 'Attestation' ? uriProblem(kind, uri.trim()) : null;
  const needsFile = kind === 'Content';
  const hasEvidence = kind === 'Content' ? !!file : kind === 'Attestation' ? statement.trim().length > 0 : !!file || statement.trim().length > 0;
  const canSubmit = !uriErr && hasEvidence && ack && (!withCode || !!code);

  const submit = async () => {
    setError(null);
    let hash: string;
    try {
      hash = file && kind !== 'Attestation' ? await hashFile(file) : await hashStatement(statement);
    } catch (err) {
      setError(err);
      return;
    }
    const call = withCode ? escrowCalls.submitProofWithCode(kind, uri.trim(), hash, code!) : escrowCalls.submitProof(kind, uri.trim(), hash);
    const ok = await run(withCode ? 'Record handover and release' : 'Submit proof of delivery', call);
    // Best effort: give the arbitrator the bytes behind the on-chain hash.
    if (ok && draftId && signedIn) {
      try {
        if (file && kind !== 'Attestation') await api.uploadEvidence(draftId, file, file.name, `Proof of delivery (${kind}), sha256 ${hash}`);
        else await api.uploadEvidence(draftId, new Blob([statement], { type: 'text/plain' }), 'proof-statement.txt', `Proof of delivery (${kind}), sha256 ${hash}`);
      } catch (err) {
        console.warn('evidence upload failed', err);
      }
    }
  };

  return (
    <div className="space-y-3">
      {warning && <Alert tone="danger">{warning}</Alert>}
      {allowed.length > 1 && (
        <Field label="Kind of proof">
          <Select value={kind} onChange={(ev) => setKind(ev.target.value as ProofKind)}>
            {allowed.map((k) => (
              <option key={k} value={k}>
                {PROOF_KIND_HELP[k].label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <p className="text-xs text-slate-500">{PROOF_KIND_HELP[kind].hint}</p>
      {kind !== 'Attestation' || uri ? (
        <Field label={kind === 'Tracking' ? 'Tracking link' : kind === 'Content' ? 'Link to the delivered file' : 'Link (optional)'} error={uri ? uriErr : undefined}>
          <Input value={uri} onChange={(ev) => setUri(ev.target.value)} placeholder="https://…" spellCheck={false} />
        </Field>
      ) : (
        <button className="text-xs text-brand-700" onClick={() => setUri('https://')}>
          Add a link
        </button>
      )}
      {kind !== 'Attestation' && (
        <Field label={needsFile ? 'The delivered file' : 'Waybill photo or receipt'} hint="Hashed on this device. The hash goes on-chain; the file goes to the case file for the arbitrator.">
          <Input type="file" onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} />
        </Field>
      )}
      {(kind === 'Attestation' || (kind === 'Tracking' && !file)) && (
        <Field label={kind === 'Attestation' ? 'Your statement' : 'Tracking reference and details'} hint="Its exact text is hashed and committed.">
          <Textarea value={statement} onChange={(ev) => setStatement(ev.target.value)} />
        </Field>
      )}
      {withCode && (
        <Field label="Buyer's delivery code">
          <CodeInput expectedHash={e.releaseCodeHash} onValid={onCode} />
        </Field>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={ack} onChange={(ev) => setAck(ev.target.checked)} />
        <span>I understand this proof is permanent and cannot be changed after it is submitted.</span>
      </label>
      <ErrorText error={error} />
      <Button disabled={!canSubmit} onClick={() => void submit()}>
        {withCode ? 'Record handover and get paid' : 'Submit proof of delivery'}
      </Button>
    </div>
  );
}

function ReleaseWithCode(ctx: Ctx) {
  const run = useRunCall(ctx);
  const [code, setCode] = useState<string | null>(null);
  const onCode = useCallback((c: string | null) => setCode(c), []);
  return (
    <Section title="Release with the buyer's code">
      <p className="text-sm text-slate-600">When the buyer has the item and has checked it, they give you their 16-character code. Enter it to release the payment.</p>
      <CodeInput expectedHash={ctx.e.releaseCodeHash} onValid={onCode} />
      <Button disabled={!code} onClick={() => void run('Release payment', escrowCalls.releaseWithCode(code!))}>
        Release payment
      </Button>
    </Section>
  );
}

function ConfirmReceipt(ctx: Ctx) {
  const run = useRunCall(ctx);
  const [ack, setAck] = useState(false);
  const { payout } = payoutOnRelease(ctx.e.amount, ctx.e.feeBps);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        No code needed. Your wallet signature is your receipt. This pays the seller <Amount token={ctx.e.token} units={payout} className="font-semibold" />.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={ack} onChange={(ev) => setAck(ev.target.checked)} />
        <span>I have the item and it matches the agreed terms.</span>
      </label>
      <Button disabled={!ack} onClick={() => void run('Confirm receipt', escrowCalls.confirm())}>
        Confirm receipt and pay the seller
      </Button>
    </div>
  );
}

function Simple({ ctx, label, title, call, variant = 'secondary', confirmText }: { ctx: Ctx; label: string; title: string; call: Call; variant?: 'primary' | 'secondary' | 'danger'; confirmText?: string }) {
  const run = useRunCall(ctx);
  return (
    <Button variant={variant} onClick={() => (!confirmText || confirm(confirmText)) && void run(title, call)}>
      {label}
    </Button>
  );
}

// --- the panel ------------------------------------------------------------------------

export function EscrowActions({ viewer, ...ctx }: Ctx & { viewer: Viewer }) {
  const { walletAddress } = useAuth();
  const now = useNow();
  const actions = availableActions(ctx.e, viewer, now);
  const a = (id: AvailableAction['id']) => has(actions, id);

  if (actions.length === 0) {
    return <p className="text-sm text-slate-600">{ctx.e.state === 'Created' || ctx.e.state === 'Funded' || ctx.e.state === 'Delivered' || ctx.e.state === 'Disputed' ? 'Nothing for you to do right now.' : 'This escrow is finished.'}</p>;
  }

  return (
    <div className="space-y-3">
      {!walletAddress && <Alert tone="info">Connect Freighter to act on this escrow.</Alert>}

      {a('fund') && <FundPanel {...ctx} />}

      {a('reveal_code') && (
        <Section title="When the item is in your hands">
          <p className="text-sm text-slate-600">Check the item. If it&apos;s right, give the seller your delivery code, or confirm receipt with your wallet.</p>
          {ctx.draftId && ctx.signedIn ? (
            <RevealCode draftId={ctx.draftId} releaseCodeHash={ctx.e.releaseCodeHash} />
          ) : (
            <Alert tone="info">Sign in to reveal your code. Without it you can still confirm receipt once the seller has submitted proof.</Alert>
          )}
          {a('confirm') && <ConfirmReceipt {...ctx} />}
          {ctx.e.state === 'Funded' && <p className="text-xs text-slate-500">Confirming receipt becomes possible once the seller submits proof of delivery.</p>}
        </Section>
      )}

      {a('submit_proof_with_code') && (
        <Section title="In-person handover" tone={a('submit_proof_with_code')?.warning ? 'danger' : undefined}>
          <p className="text-sm text-slate-600">Meet, let the buyer inspect the item, and get their code. Your proof and their code land in one transaction and you are paid in seconds.</p>
          <ProofForm ctx={ctx} withCode warning={a('submit_proof_with_code')?.warning} />
        </Section>
      )}

      {a('submit_proof') && (
        <Section title="Shipped it? Submit proof of delivery">
          <p className="text-sm text-slate-600">Proof starts the buyer&apos;s receipt window. It does not pay you by itself: you are paid when the buyer gives receipt, or the arbitrator rules.</p>
          <ProofForm ctx={ctx} withCode={false} />
        </Section>
      )}

      {a('release_with_code') && <ReleaseWithCode {...ctx} />}

      {a('escalate') && (
        <Section title="The buyer gave no receipt in time">
          <p className="text-sm text-slate-600">Anyone can now hand this escrow to the arbitrator. Nobody is paid by waiting.</p>
          <Simple ctx={ctx} label="Escalate to the arbitrator" title="Escalate to arbitration" call={escrowCalls.escalate()} variant="primary" />
        </Section>
      )}

      {a('refund_after_delivery_timeout') && (
        <Section title="The seller did not deliver in time">
          <p className="text-sm text-slate-600">Anyone can now return the deposit to the buyer.</p>
          <Simple ctx={ctx} label="Refund the buyer" title="Refund after delivery deadline" call={escrowCalls.refundAfterDeliveryTimeout()} variant="primary" />
        </Section>
      )}

      {a('refund_after_arbitration_timeout') && (
        <Section title="The arbitrator did not rule in time">
          <p className="text-sm text-slate-600">Anyone can now refund the buyer.</p>
          <Simple ctx={ctx} label="Refund the buyer" title="Refund after arbitration deadline" call={escrowCalls.refundAfterArbitrationTimeout()} variant="primary" />
        </Section>
      )}

      {a('resolve') && (
        <Alert tone="info" title="You are the arbitrator">
          Review and rule from the <a className="underline" href={`/arbitrator/${ctx.e.contractId}`}>arbitration console</a>.
        </Alert>
      )}

      {a('dispute') && (
        <Secondary title="Something went wrong? Open a dispute">
          <p className="text-sm text-slate-600">The arbitrator will review the proof, your messages and any evidence, and either release or refund. Automatic release by code stops once a dispute is open.</p>
          <Simple
            ctx={ctx}
            label="Open a dispute"
            title="Open dispute"
            call={escrowCalls.dispute(walletAddress ?? '')}
            variant="danger"
            confirmText="Open a dispute? The arbitrator will decide this escrow."
          />
        </Secondary>
      )}

      {a('seller_refund') && (
        <Secondary title="Can't deliver? Refund the buyer">
          <p className="text-sm text-slate-600">Returns the full deposit to the buyer now. This cannot be undone.</p>
          <Simple ctx={ctx} label="Refund the buyer" title="Seller refund" call={escrowCalls.sellerRefund()} variant="danger" confirmText="Refund the full deposit to the buyer? This cannot be undone." />
        </Secondary>
      )}

      {a('cancel') && (
        <Secondary title="Cancel this escrow">
          <p className="text-sm text-slate-600">Nothing has been deposited. Cancelling closes it for good.</p>
          <Simple ctx={ctx} label="Cancel escrow" title="Cancel escrow" call={escrowCalls.cancel(walletAddress ?? '')} variant="danger" confirmText="Cancel this escrow?" />
        </Secondary>
      )}

      {ctx.e.state === 'Funded' && <ExtendDeadline ctx={ctx} kind="delivery" />}
      {ctx.e.state === 'Delivered' && <ExtendDeadline ctx={ctx} kind="receipt" />}

      <FeeBreakdown e={ctx.e} />
    </div>
  );
}

function ExtendDeadline({ ctx, kind }: { ctx: Ctx; kind: 'delivery' | 'receipt' }) {
  const run = useRunCall(ctx);
  const [days, setDays] = useState(1);
  const seconds = days * 86400;

  const call = kind === 'delivery' ? escrowCalls.extendDelivery(seconds) : escrowCalls.extendReceipt(seconds);
  const title = kind === 'delivery' ? 'Extend delivery deadline' : 'Extend receipt deadline';
  const label = kind === 'delivery' ? 'Extend delivery' : 'Extend receipt';

  return (
    <Secondary title={`Extend ${kind} deadline`}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Add additional time to the {kind} window if more time is needed before timeouts trigger.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Field label="Extension time">
            <Select value={days} onChange={(ev) => setDays(Number(ev.target.value))}>
              <option value={1}>1 Day (24 hrs)</option>
              <option value={3}>3 Days (72 hrs)</option>
              <option value={7}>7 Days (1 week)</option>
              <option value={14}>14 Days (2 weeks)</option>
            </Select>
          </Field>
          <div className="pt-5">
            <Button variant="secondary" onClick={() => void run(title, call)}>
              {label} by {days} {days === 1 ? 'day' : 'days'}
            </Button>
          </div>
        </div>
      </div>
    </Secondary>
  );
}

function FeeBreakdown({ e }: { e: EscrowSnapshot }) {
  const t = tokenDisplay(e.token);
  const feePercent = (e.feeBps / 100).toFixed(2);
  const hasUnswept = e.unsweptFee > 0n;

  return (
    <Secondary title="Protocol Fee & Recipient Details">
      <div className="space-y-2 text-sm text-slate-600">
        <div className="flex justify-between">
          <span>Fee Rate:</span>
          <span className="font-medium text-slate-900">{e.feeBps} BPS ({feePercent}%)</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Fee Recipient:</span>
          <span className="font-mono text-xs text-slate-900 truncate max-w-[200px]" title={e.feeRecipient}>
            {e.feeRecipient}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Unswept Fee:</span>
          <span className="font-medium text-slate-900">
            {formatAmount(e.unsweptFee, t.decimals, t.symbol)}
          </span>
        </div>
        {hasUnswept && (
          <Alert tone="info">
            There is an unswept fee balance of {formatAmount(e.unsweptFee, t.decimals, t.symbol)} pending collection.
          </Alert>
        )}
      </div>
    </Secondary>
  );
}
