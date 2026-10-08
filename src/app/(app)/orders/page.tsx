'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RequireAuth } from '@/components/SignIn';
import { Badge, Button, Card, Empty, ErrorText, PageTitle, shortAddress, Spinner } from '@/components/ui';
import type { Draft } from '@/lib/api';
import { useDrafts } from '@/lib/queries';

type StatusFilter = 'all' | 'negotiating' | 'agreed' | 'linked' | 'withdrawn';

function DraftRow({ d }: { d: Draft }) {
  const label = { negotiating: 'Negotiating', agreed: 'Terms agreed', linked: 'Escrow created', withdrawn: 'Withdrawn' }[d.status];
  return (
    <Link href={`/orders/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 ring-1 ring-slate-200 hover:bg-slate-50">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge>{d.role === 'buyer' ? 'Buying' : 'Selling'}</Badge>
          <Badge className={d.status === 'agreed' ? 'bg-brand-100 text-brand-800' : d.status === 'linked' ? 'bg-emerald-100 text-emerald-800' : undefined}>
            {label}
          </Badge>
        </div>
        <p className="text-sm text-slate-600">
          with <span className="font-mono">{shortAddress(d.role === 'buyer' ? d.sellerAddress : d.buyerAddress)}</span> · revision {d.currentRevision}
        </p>
      </div>
      {d.status === 'agreed' && d.role === 'buyer' && <span className="text-sm font-medium text-brand-700">Create escrow →</span>}
    </Link>
  );
}

function OrdersContent() {
  const drafts = useDrafts();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const allDrafts = drafts.data ?? [];
  const filtered = allDrafts.filter((d) => (filter === 'all' ? true : d.status === filter));

  const counts: Record<StatusFilter, number> = {
    all: allDrafts.length,
    negotiating: allDrafts.filter((d) => d.status === 'negotiating').length,
    agreed: allDrafts.filter((d) => d.status === 'agreed').length,
    linked: allDrafts.filter((d) => d.status === 'linked').length,
    withdrawn: allDrafts.filter((d) => d.status === 'withdrawn').length,
  };

  const tabs: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All Orders' },
    { id: 'negotiating', label: 'Negotiating' },
    { id: 'agreed', label: 'Agreed' },
    { id: 'linked', label: 'Linked' },
    { id: 'withdrawn', label: 'Withdrawn' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub="Manage all active and past order proposals">Orders</PageTitle>
        <Link href="/orders/new">
          <Button>New order</Button>
        </Link>
      </div>

      <div className="flex flex-wrap border-b border-slate-200 text-sm font-medium text-slate-500">
        {tabs.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`mr-4 border-b-2 pb-2 transition-colors ${
                active ? 'border-brand-600 font-semibold text-brand-600' : 'border-transparent hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {tab.label} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{counts[tab.id]}</span>
            </button>
          );
        })}
      </div>

      <Card>
        {drafts.isLoading ? (
          <Spinner />
        ) : drafts.error ? (
          <ErrorText error={drafts.error} />
        ) : filtered.length === 0 ? (
          <Empty>No orders found for status &quot;{filter}&quot;.</Empty>
        ) : (
          <div className="space-y-2">
            {filtered.map((d) => (
              <DraftRow key={d.id} d={d} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <RequireAuth>
      <OrdersContent />
    </RequireAuth>
  );
}
