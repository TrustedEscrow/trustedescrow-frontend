'use client';

import { formatAmount } from '@/sdk/amount';
import { DELIVERY_METHOD_LABEL, type AgreedTerms } from '@/sdk/terms';
import { type EscrowSnapshot, type EscrowState, payoutOnRelease } from '@/sdk/types';
import { tokenDisplay } from '@/lib/config';
import { formatDate, formatDuration, formatWindow, useNow } from '@/lib/time';
import { Addr, Badge, Row } from './ui';

const STATE_STYLE: Record<EscrowState, string> = {
  Created: 'bg-surface-2 text-muted',
  Funded: 'bg-sky-100 text-sky-800',
  Delivered: 'bg-violet-100 text-violet-800',
  Disputed: 'bg-amber-100 text-amber-900',
  Released: 'bg-emerald-100 text-emerald-800',
  Refunded: 'bg-teal-100 text-teal-800',
  Cancelled: 'bg-surface-2 text-faint',
};

const STATE_LABEL: Record<EscrowState, string> = {
  Created: 'Awaiting deposit',
  Funded: 'Funded, awaiting delivery',
  Delivered: 'Delivered, awaiting receipt',
  Disputed: 'With the arbitrator',
  Released: 'Paid to seller',
  Refunded: 'Refunded to buyer',
  Cancelled: 'Cancelled',
};

export function StateBadge({ state }: { state: EscrowState | null | undefined }) {
  if (!state) return <Badge>Pending</Badge>;
  return <Badge className={STATE_STYLE[state]}>{STATE_LABEL[state]}</Badge>;
}

export function Amount({ token, units, className }: { token: string; units: bigint | string; className?: string }) {
  const t = tokenDisplay(token);
  return (
    <span className={className} title={t.known ? undefined : `Unknown token ${token}`}>
      {formatAmount(units, t.decimals, t.symbol)}
    </span>
  );
}

export function Countdown({ at, label, after }: { at: number; label: string; after?: string }) {
  const now = useNow();
  const left = at - now;
  const passed = left <= 0;
  return (
    <div className={passed ? 'rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200' : 'rounded-lg bg-surface-2 p-3 ring-1 ring-line'}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="text-lg font-semibold">{passed ? 'Passed' : formatDuration(left)}</p>
      <p className="text-xs text-muted">{formatDate(at)}</p>
      {passed && after && <p className="mt-1 text-xs text-amber-900">{after}</p>}
    </div>
  );
}

export function TermsSummary({ terms, feeBps }: { terms: AgreedTerms; feeBps?: number }) {
  const amount = BigInt(terms.amount);
  const t = tokenDisplay(terms.token);
  const split = feeBps !== undefined ? payoutOnRelease(amount, feeBps) : null;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-lg font-semibold">{terms.item.title}</p>
        {terms.item.description && <p className="whitespace-pre-wrap text-sm text-muted">{terms.item.description}</p>}
      </div>
      <dl className="divide-y divide-slate-100">
        <Row label="Price">{formatAmount(amount, t.decimals, t.symbol)}</Row>
        {split && (
          <Row label="Seller receives on release">
            {formatAmount(split.payout, t.decimals, t.symbol)} <span className="text-xs text-muted">(fee {formatAmount(split.fee, t.decimals, t.symbol)}, only on release)</span>
          </Row>
        )}
        <Row label="Delivery">{DELIVERY_METHOD_LABEL[terms.delivery.method]}{terms.delivery.carrier ? ` · ${terms.delivery.carrier}` : ''}</Row>
        <Row label="Seller's proof">{terms.delivery.proofKind}</Row>
        <Row label="Seller must deliver within">{formatWindow(terms.windows.delivery)} of funding</Row>
        <Row label="Buyer must give receipt within">{formatWindow(terms.windows.receipt)} of proof</Row>
        <Row label="Arbitrator must rule within">{formatWindow(terms.windows.arbitration)}</Row>
        <Row label="Fund by">{formatDate(terms.fundingDeadline)}</Row>
        <Row label="Buyer">
          <Addr value={terms.buyer} />
        </Row>
        <Row label="Seller (paid at)">
          <Addr value={terms.seller} />
        </Row>
      </dl>
      {terms.delivery.notes && <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm text-muted">{terms.delivery.notes}</p>}
    </div>
  );
}

const SETTLEMENT_TEXT: Record<string, string> = {
  Code: 'Released with the buyer’s delivery code',
  Confirmation: 'Released on the buyer’s confirmation',
  Arbitration: 'Decided by the arbitrator',
  SellerRefund: 'Refunded by the seller',
  DeliveryTimeout: 'Refunded: the seller did not deliver in time',
  ArbitrationTimeout: 'Refunded: the arbitrator did not rule in time',
};

export function settlementText(e: EscrowSnapshot): string | null {
  if (e.settlement.status === 'Open') return null;
  const how = SETTLEMENT_TEXT[e.settlement.path] ?? e.settlement.path;
  return e.settlement.status === 'Released' ? how : e.settlement.path === 'Arbitration' ? 'Refunded by the arbitrator' : how;
}

const STEPS: { state: EscrowState; label: string; at: (e: EscrowSnapshot) => number }[] = [
  { state: 'Created', label: 'Created', at: (e) => e.createdAt },
  { state: 'Funded', label: 'Funded', at: (e) => e.fundedAt },
  { state: 'Delivered', label: 'Proof submitted', at: (e) => e.proof?.submittedAt ?? 0 },
];

export function Timeline({ e }: { e: EscrowSnapshot }) {
  const final = settlementText(e);
  return (
    <ol className="space-y-2 text-sm">
      {STEPS.map((s) => {
        const at = s.at(e);
        return (
          <li key={s.state} className="flex items-center gap-3">
            <span className={at ? 'h-2.5 w-2.5 rounded-full bg-brand-600' : 'h-2.5 w-2.5 rounded-full bg-slate-300'} />
            <span className={at ? 'font-medium' : 'text-faint'}>{s.label}</span>
            {at > 0 && <span className="text-xs text-muted">{formatDate(at)}</span>}
          </li>
        );
      })}
      {e.dispute && (
        <li className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span className="font-medium">
            Disputed ({e.dispute.openedBy === 'ReceiptTimeout' ? 'buyer gave no receipt in time' : `by the ${e.dispute.openedBy.toLowerCase()}`})
          </span>
          <span className="text-xs text-muted">{formatDate(e.dispute.openedAt)}</span>
        </li>
      )}
      {final && (
        <li className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
          <span className="font-medium">{final}</span>
        </li>
      )}
    </ol>
  );
}
