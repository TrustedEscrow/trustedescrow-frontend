'use client';

import Link from 'next/link';
import { Amount, StateBadge } from '@/components/escrow-bits';
import { RequireAuth } from '@/components/SignIn';
import { Badge, Button, Card, Empty, ErrorText, PageTitle, shortAddress, Spinner } from '@/components/ui';
import type { CachedEscrow, Draft } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { configProblems } from '@/lib/config';
import { useDrafts, useEscrowList } from '@/lib/queries';
import { relative, useNow } from '@/lib/time';

/** A hint from the cache, for the list only. The escrow page re-reads the chain before any action. */
function nextStep(e: CachedEscrow, mine: Set<string>, now: number): string | null {
  const buyer = mine.has(e.buyer);
  const seller = mine.has(e.seller);
  const secs = (iso: string | null) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : 0);
  switch (e.state) {
    case 'Created':
      return buyer ? 'Deposit the funds' : 'Waiting for the buyer’s deposit';
    case 'Funded':
      if (now >= secs(e.deadlines.delivery)) return 'Delivery deadline passed: refund available';
      return seller ? 'Deliver and submit proof' : 'Waiting for delivery';
    case 'Delivered':
      if (now >= secs(e.deadlines.receipt)) return 'Receipt deadline passed: can be escalated';
      return buyer ? 'On receipt: hand over your code or confirm' : 'Waiting for the buyer’s receipt';
    case 'Disputed':
      return 'With the arbitrator';
    default:
      return null;
  }
}

function EscrowRow({ e, mine, now }: { e: CachedEscrow; mine: Set<string>; now: number }) {
  const step = nextStep(e, mine, now);
  const role = mine.has(e.buyer) ? 'Buying' : 'Selling';
  return (
    <Link href={`/escrow/${e.contractId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 ring-1 ring-slate-200 hover:bg-slate-50">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge>{role}</Badge>
          <StateBadge state={e.state} />
        </div>
        <p className="text-sm text-slate-600">
          with <span className="font-mono">{shortAddress(role === 'Buying' ? e.seller : e.buyer)}</span>
          {step && <span className="ml-2 font-medium text-ink">· {step}</span>}
        </p>
      </div>
      {e.token && e.amount && <Amount token={e.token} units={e.amount} className="font-semibold" />}
    </Link>
  );
}

function DraftRow({ d }: { d: Draft }) {
  const label = { negotiating: 'Negotiating', agreed: 'Terms agreed', linked: 'Escrow created', withdrawn: 'Withdrawn' }[d.status];
  return (
    <Link href={`/orders/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 ring-1 ring-slate-200 hover:bg-slate-50">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge>{d.role === 'buyer' ? 'Buying' : 'Selling'}</Badge>
          <Badge className={d.status === 'agreed' ? 'bg-brand-100 text-brand-800' : undefined}>{label}</Badge>
        </div>
        <p className="text-sm text-slate-600">
          with <span className="font-mono">{shortAddress(d.role === 'buyer' ? d.sellerAddress : d.buyerAddress)}</span> · revision {d.currentRevision}
        </p>
      </div>
      {d.status === 'agreed' && d.role === 'buyer' && <span className="text-sm font-medium text-brand-700">Create escrow →</span>}
    </Link>
  );
}

function Dashboard() {
  const { me } = useAuth();
  const now = useNow(30_000);
  const escrows = useEscrowList();
  const drafts = useDrafts();
  const mine = new Set([me?.address, me?.payoutAddress].filter(Boolean) as string[]);
  const problems = configProblems();

  const open = (escrows.data ?? []).filter((e) => e.state && !['Released', 'Refunded', 'Cancelled'].includes(e.state));
  const closed = (escrows.data ?? []).filter((e) => e.state && ['Released', 'Refunded', 'Cancelled'].includes(e.state));
  const activeDrafts = (drafts.data ?? []).filter((d) => d.status === 'negotiating' || d.status === 'agreed');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub="Your orders and escrows">Dashboard</PageTitle>
        <Link href="/orders/new">
          <Button>New order</Button>
        </Link>
      </div>

      {problems.length > 0 && (
        <Card>
          <ErrorText error={new Error(`This build is not configured to create escrows: ${problems.join('; ')}.`)} />
        </Card>
      )}

      <Card title="Orders being negotiated">
        {drafts.isLoading ? <Spinner /> : drafts.error ? <ErrorText error={drafts.error} /> : activeDrafts.length === 0 ? <Empty>No open proposals.</Empty> : (
          <div className="space-y-2">
            {activeDrafts.map((d) => (
              <DraftRow key={d.id} d={d} />
            ))}
          </div>
        )}
      </Card>

      <Card title="Open escrows" actions={escrows.data?.[0]?.snapshotAt && <span className="text-xs text-slate-500">list updated {relative(Math.floor(new Date(escrows.data[0].snapshotAt).getTime() / 1000), now)}</span>}>
        {escrows.isLoading ? <Spinner /> : escrows.error ? <ErrorText error={escrows.error} /> : open.length === 0 ? <Empty>No open escrows.</Empty> : (
          <div className="space-y-2">
            {open.map((e) => (
              <EscrowRow key={e.contractId} e={e} mine={mine} now={now} />
            ))}
          </div>
        )}
      </Card>

      {closed.length > 0 && (
        <Card title="Finished">
          <div className="space-y-2">
            {closed.map((e) => (
              <EscrowRow key={e.contractId} e={e} mine={mine} now={now} />
            ))}
          </div>
        </Card>
      )}

      <p className="text-xs text-slate-500">
        Have an escrow address? Open it directly at <span className="font-mono">/escrow/C…</span>. Escrow pages read the contract itself, so they work even when this list is behind.
      </p>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
