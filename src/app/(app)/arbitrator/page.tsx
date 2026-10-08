'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Amount } from '@/components/escrow-bits';
import { RequireAuth } from '@/components/SignIn';
import { Alert, Badge, Card, Empty, ErrorText, PageTitle, shortAddress, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { isArbitrator, useAuth } from '@/lib/auth';
import { formatDuration, useNow } from '@/lib/time';

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Console() {
  const now = useNow(30_000);
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: () => api.disputes(), refetchInterval: 30_000 });
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api.stats(), refetchInterval: 60_000 });

  return (
    <div className="space-y-5">
      <PageTitle sub="You choose between release and refund, before each deadline. You can't do anything else, and you can't act once the deadline passes.">Arbitration</PageTitle>

      {stats.data && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Open disputes" value={stats.data.openDisputes} />
          <Stat label="Two-sided releases" value={pct(stats.data.twoSidedReleaseShare)} hint="By code or confirmation" />
          <Stat label="Escalation rate" value={pct(stats.data.escalationRate)} hint="Silent buyers per proof" />
          <Stat label="Proofs submitted" value={stats.data.proofsSubmitted} />
        </div>
      )}
      {stats.error && <ErrorText error={stats.error} />}

      <Card title="Open disputes, soonest deadline first">
        {disputes.isLoading ? <Spinner /> : disputes.error ? <ErrorText error={disputes.error} /> : !disputes.data?.length ? <Empty>No open disputes.</Empty> : (
          <ul className="space-y-2">
            {disputes.data.map((d) => {
              const deadline = d.dispute ? Math.floor(new Date(d.dispute.deadline).getTime() / 1000) : 0;
              const left = deadline - now;
              return (
                <li key={d.contractId}>
                  <Link href={`/arbitrator/${d.contractId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 ring-1 ring-slate-200 hover:bg-slate-50">
                    <div className="space-y-1">
                      <p className="font-mono text-sm">{shortAddress(d.contractId, 6)}</p>
                      <p className="text-xs text-slate-500">
                        {d.dispute?.openedBy === 'ReceiptTimeout' ? 'Buyer silent after proof' : `Opened by ${d.dispute?.openedBy?.toLowerCase()}`} · proof{' '}
                        {d.proof ? d.proof.kind : 'none'}
                      </p>
                    </div>
                    <div className="text-right">
                      {d.token && d.amount && <Amount token={d.token} units={d.amount} className="block font-semibold" />}
                      <Badge className={left < 86400 ? 'bg-red-100 text-red-800' : left < 3 * 86400 ? 'bg-amber-100 text-amber-900' : undefined}>
                        {left > 0 ? `${formatDuration(left)} left` : 'deadline passed'}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function ArbitratorPage() {
  const { me, status } = useAuth();
  return (
    <RequireAuth>
      {status === 'signed_in' && !isArbitrator(me) ? <Alert tone="danger">This account is not an arbitrator.</Alert> : <Console />}
    </RequireAuth>
  );
}
