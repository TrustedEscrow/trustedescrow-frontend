'use client';

import { Account, Contract, StrKey, TransactionBuilder, rpc, scValToNative } from '@stellar/stellar-sdk';
import { useEffect, useMemo, useState } from 'react';
import { fromBaseUnits, toBaseUnits } from '@/sdk/amount';
import { DELIVERY_METHOD_LABEL, PROOF_KINDS_BY_METHOD, WINDOW_MAX_SECONDS, WINDOW_MIN_SECONDS } from '@/sdk/terms';
import type { CanonicalTerms, DeliveryMethod, ProofKindName, TermsInput } from '@/lib/api';
import { config, railById, railForToken, type Rail } from '@/lib/config';
import { useNow } from '@/lib/time';
import { Alert, Button, ErrorText, Field, Input, Select, Textarea } from './ui';

async function queryTokenMetadata(
  tokenAddress: string,
  rpcUrl: string,
  networkPassphrase: string,
): Promise<{ symbol: string; decimals: number } | null> {
  const trimmed = tokenAddress.trim();
  if (!StrKey.isValidContract(trimmed) && !StrKey.isValidEd25519PublicKey(trimmed)) {
    return null;
  }
  const known = railForToken(trimmed);
  if (known) return { symbol: known.displaySymbol, decimals: known.decimals };

  try {
    const server = new rpc.Server(rpcUrl);
    const contract = new Contract(trimmed);
    const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');

    let decimals = 7;
    let symbol = 'TOKEN';

    try {
      const simDec = await server.simulateTransaction(
        new TransactionBuilder(dummyAccount, { fee: '100', networkPassphrase })
          .addOperation(contract.call('decimals'))
          .setTimeout(30)
          .build(),
      );
      if (rpc.Api.isSimulationSuccess(simDec) && simDec.result) {
        decimals = Number(scValToNative(simDec.result.retval));
      }
    } catch {
      // fallback
    }

    try {
      const simSym = await server.simulateTransaction(
        new TransactionBuilder(dummyAccount, { fee: '100', networkPassphrase })
          .addOperation(contract.call('symbol'))
          .setTimeout(30)
          .build(),
      );
      if (rpc.Api.isSimulationSuccess(simSym) && simSym.result) {
        const val = scValToNative(simSym.result.retval);
        if (typeof val === 'string' && val.length > 0) {
          symbol = val;
        }
      }
    } catch {
      // fallback
    }

    return { symbol, decimals };
  } catch {
    return null;
  }
}

type Unit = 'hours' | 'days';
interface WindowValue {
  n: string;
  unit: Unit;
}

function toSeconds(w: WindowValue): number {
  return Math.round(Number(w.n) * (w.unit === 'days' ? 86400 : 3600));
}

function fromSeconds(s: number): WindowValue {
  return s % 86400 === 0 ? { n: String(s / 86400), unit: 'days' } : { n: String(s / 3600), unit: 'hours' };
}

function toLocalInput(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function WindowInput({ label, hint, value, onChange }: { label: string; hint: string; value: WindowValue; onChange: (v: WindowValue) => void }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Input type="number" min={1} step="any" value={value.n} onChange={(e) => onChange({ ...value, n: e.target.value })} />
        <Select className="w-28" value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value as Unit })}>
          <option value="hours">hours</option>
          <option value="days">days</option>
        </Select>
      </div>
    </Field>
  );
}

export interface TermsFormResult {
  role?: 'buyer' | 'seller';
  counterpartyAddress?: string;
  terms: TermsInput;
  note?: string;
}

export function TermsForm({
  initial,
  withParties,
  submitLabel,
  onSubmit,
}: {
  initial?: CanonicalTerms;
  withParties?: boolean;
  submitLabel: string;
  onSubmit: (r: TermsFormResult) => Promise<void>;
}) {
  const rails = config.rails;
  const isCustomInitial = !!initial && !railById(initial.rail);
  const initialRail = (initial && railById(initial.rail)) ?? rails[0];
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer');
  const [counterparty, setCounterparty] = useState('');
  const [railId, setRailId] = useState(isCustomInitial ? 'custom' : (initialRail?.id ?? ''));
  const [customToken, setCustomToken] = useState(isCustomInitial ? initial.rail : '');
  const [customMetadata, setCustomMetadata] = useState<{ symbol: string; decimals: number } | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);

  useEffect(() => {
    if (railId !== 'custom' || !customToken.trim()) {
      setCustomMetadata(null);
      return;
    }
    const trimmed = customToken.trim();
    if (!StrKey.isValidContract(trimmed) && !StrKey.isValidEd25519PublicKey(trimmed)) {
      setCustomMetadata(null);
      return;
    }
    let cancelled = false;
    setLoadingMetadata(true);
    void queryTokenMetadata(trimmed, config.rpcUrl, config.networkPassphrase).then((meta) => {
      if (cancelled) return;
      setCustomMetadata(meta);
      setLoadingMetadata(false);
    });
    return () => {
      cancelled = true;
    };
  }, [railId, customToken]);

  const customRail: Rail | undefined = useMemo(() => {
    if (railId !== 'custom') return undefined;
    return {
      id: customToken.trim() || 'custom',
      tokenAddress: customToken.trim(),
      displaySymbol: customMetadata?.symbol ?? 'units',
      decimals: customMetadata?.decimals ?? 7,
    };
  }, [railId, customToken, customMetadata]);

  const rail = railId === 'custom' ? customRail : railById(railId);
  const [amount, setAmount] = useState(
    initial
      ? fromBaseUnits(initial.amount, initialRail?.decimals ?? 7).replace(/,/g, '')
      : '',
  );
  const [title, setTitle] = useState(initial?.item.title ?? '');
  const [description, setDescription] = useState(initial?.item.description ?? '');
  const [method, setMethod] = useState<DeliveryMethod>(initial?.delivery.method ?? 'in_person');
  const [proofKind, setProofKind] = useState<ProofKindName>(initial?.delivery.proofKind ?? 'Attestation');
  const [carrier, setCarrier] = useState(initial?.delivery.carrier ?? '');
  const [notes, setNotes] = useState(initial?.delivery.notes ?? '');
  const [delivery, setDelivery] = useState<WindowValue>(initial ? fromSeconds(initial.windows.delivery) : { n: '3', unit: 'days' });
  const [receipt, setReceipt] = useState<WindowValue>(initial ? fromSeconds(initial.windows.receipt) : { n: '2', unit: 'days' });
  const [arbitration, setArbitration] = useState<WindowValue>(initial ? fromSeconds(initial.windows.arbitration) : { n: '7', unit: 'days' });
  const [fundBy, setFundBy] = useState(() =>
    toLocalInput(initial && initial.fundingDeadline > Date.now() / 1000 + 600 ? initial.fundingDeadline : Math.floor(Date.now() / 1000) + 2 * 86400),
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const now = useNow(10_000);
  const allowedKinds = PROOF_KINDS_BY_METHOD[method] as readonly ProofKindName[];

  const problems = useMemo(() => {
    const p: string[] = [];
    if (withParties && !StrKey.isValidEd25519PublicKey(counterparty.trim())) p.push('Enter the other party’s Stellar account (G…).');
    if (!title.trim()) p.push('Describe the item.');
    if (railId === 'custom') {
      const trimmed = customToken.trim();
      if (!trimmed || (!StrKey.isValidContract(trimmed) && !StrKey.isValidEd25519PublicKey(trimmed))) {
        p.push('Enter a valid custom token contract address (C…).');
      }
    }
    if (!rail) p.push('Choose a settlement currency.');
    else {
      try {
        if (toBaseUnits(amount || '0', rail.decimals) <= 0n) p.push('Enter a price.');
      } catch (e) {
        p.push((e as Error).message);
      }
    }
    for (const [name, w] of [
      ['Delivery', delivery],
      ['Receipt', receipt],
      ['Arbitration', arbitration],
    ] as const) {
      const s = toSeconds(w);
      if (!Number.isFinite(s) || s < WINDOW_MIN_SECONDS || s > WINDOW_MAX_SECONDS) p.push(`${name} window must be between 1 hour and 365 days.`);
    }
    if (method === 'shipped' && !carrier.trim()) p.push('Shipped goods must name a carrier.');
    const deadline = Math.floor(new Date(fundBy).getTime() / 1000);
    if (!Number.isFinite(deadline) || deadline < now + 300) p.push('The funding deadline must be at least 5 minutes away.');
    return p;
  }, [withParties, counterparty, title, rail, amount, delivery, receipt, arbitration, method, carrier, fundBy, now]);

  if (rails.length === 0) return <Alert tone="danger">This build has no settlement rails configured (NEXT_PUBLIC_RAILS).</Alert>;

  const submit = async () => {
    if (!rail || problems.length) return;
    setBusy(true);
    setError(null);
    try {
      const terms: TermsInput = {
        rail: rail.id,
        amount: toBaseUnits(amount, rail.decimals).toString(),
        item: { title: title.trim(), description },
        delivery: {
          method,
          proofKind,
          ...(carrier.trim() ? { carrier: carrier.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        windows: { delivery: toSeconds(delivery), receipt: toSeconds(receipt), arbitration: toSeconds(arbitration) },
        fundingDeadline: Math.floor(new Date(fundBy).getTime() / 1000),
      };
      await onSubmit({ role: withParties ? role : undefined, counterpartyAddress: withParties ? counterparty.trim() : undefined, terms, note: note.trim() || undefined });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {withParties && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <Field label="I am the">
            <Select value={role} onChange={(e) => setRole(e.target.value as 'buyer' | 'seller')}>
              <option value="buyer">Buyer (I pay)</option>
              <option value="seller">Seller (I deliver)</option>
            </Select>
          </Field>
          <Field label={role === 'buyer' ? 'Seller’s Stellar account' : 'Buyer’s Stellar account'} hint="Their G… address. They will see and accept these terms.">
            <Input className="font-mono" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="G…" spellCheck={false} />
          </Field>
        </fieldset>
      )}

      <fieldset className="space-y-4">
        <Field label="What is being sold">
          <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="iPhone 13, 128GB, blue" />
        </Field>
        <Field label="Description" hint="Condition, model, what's included. The arbitrator reads this if there's a dispute.">
          <Textarea value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={rail ? `Price (${rail.displaySymbol})` : 'Price'}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Settled in">
            <Select value={railId} onChange={(e) => setRailId(e.target.value)}>
              {rails.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displaySymbol}
                </option>
              ))}
              <option value="custom">Custom asset address...</option>
            </Select>
          </Field>
        </div>
        {railId === 'custom' && (
          <Field
            label="Custom token contract address"
            hint={
              loadingMetadata
                ? 'Querying token metadata on-chain...'
                : customMetadata
                  ? `Detected token symbol: ${customMetadata.symbol} (precision: ${customMetadata.decimals} decimals)`
                  : 'Enter contract address (C…) to automatically detect symbol and decimals'
            }
          >
            <Input
              className="font-mono"
              value={customToken}
              onChange={(e) => setCustomToken(e.target.value)}
              placeholder="C…"
              spellCheck={false}
            />
          </Field>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery method">
            <Select
              value={method}
              onChange={(e) => {
                const m = e.target.value as DeliveryMethod;
                setMethod(m);
                setProofKind(PROOF_KINDS_BY_METHOD[m][0] as ProofKindName);
              }}
            >
              {(Object.keys(DELIVERY_METHOD_LABEL) as DeliveryMethod[]).map((m) => (
                <option key={m} value={m}>
                  {DELIVERY_METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Seller’s proof of delivery">
            <Select value={proofKind} onChange={(e) => setProofKind(e.target.value as ProofKindName)}>
              {allowedKinds.map((k) => (
                <option key={k} value={k}>
                  {k === 'Tracking' ? 'Carrier tracking' : k === 'Content' ? 'File hash' : 'Seller statement'}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {(method === 'shipped' || proofKind === 'Tracking') && (
          <Field label="Carrier" hint="The courier or waybill company.">
            <Input value={carrier} maxLength={100} onChange={(e) => setCarrier(e.target.value)} placeholder="GIG Logistics" />
          </Field>
        )}
        {proofKind === 'Attestation' && (
          <Alert tone="info">A seller statement is the weakest proof. For in-person trades, the buyer&apos;s code handed over at the same moment is what gives it weight.</Alert>
        )}
        <Field label="Delivery notes" hint="Optional: meeting place, packaging, anything the arbitrator should know.">
          <Textarea value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <WindowInput label="Delivery window" hint="From deposit until the seller must submit proof." value={delivery} onChange={setDelivery} />
          <WindowInput label="Receipt window" hint="From proof until the buyer must give receipt or dispute." value={receipt} onChange={setReceipt} />
          <WindowInput label="Arbitration window" hint="How long the arbitrator has to rule." value={arbitration} onChange={setArbitration} />
        </div>
        <Field label="Buyer must deposit by">
          <Input type="datetime-local" value={fundBy} onChange={(e) => setFundBy(e.target.value)} />
        </Field>
      </fieldset>

      <Field label="Note to the other party" hint="Optional. Not part of the terms.">
        <Input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {problems.length > 0 && (
        <ul className="list-inside list-disc text-sm text-slate-600">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <ErrorText error={error} />
      <Button busy={busy} disabled={problems.length > 0} onClick={() => void submit()}>
        {submitLabel}
      </Button>
    </div>
  );
}
