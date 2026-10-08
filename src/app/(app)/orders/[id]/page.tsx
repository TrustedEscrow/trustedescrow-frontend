'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Chat } from '@/components/Chat';
import { CreateEscrow } from '@/components/CreateEscrow';
import { TermsSummary } from '@/components/escrow-bits';
import { RequireAuth } from '@/components/SignIn';
import { TermsForm } from '@/components/TermsForm';
import { Addr, Alert, Badge, Button, Card, ErrorText, PageTitle, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDraft } from '@/lib/queries';
import { formatDate } from '@/lib/time';

const STATUS_LABEL = { negotiating: 'Negotiating', agreed: 'Terms agreed', linked: 'Escrow created', withdrawn: 'Withdrawn' } as const;

function Order({ id }: { id: string }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data: draft, isLoading, error } = useDraft(id);
  const [revising, setRevising] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!draft) return null;

  const current = draft.revisions[draft.revisions.length - 1];
  const role = draft.role;
  const counterparty = role === 'buyer' ? draft.sellerAddress : draft.buyerAddress;
  const iAccepted = !!current && !!me && current.acceptedBy.includes(me.address);
  const theyAccepted = !!current && current.acceptedBy.includes(counterparty);
  const payoutMismatch = role === 'seller' && !!current && !!me && current.terms.seller !== me.payoutAddress;
  const open = draft.status === 'negotiating' || draft.status === 'agreed';

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setActionError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['draft', id] });
      await qc.invalidateQueries({ queryKey: ['drafts'] });
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard" className="text-sm text-brand-700">
          ← Dashboard
        </Link>
        <PageTitle
          sub={
            <>
              You are the <strong>{role}</strong>. {role === 'buyer' ? 'Seller' : 'Buyer'}: <Addr value={counterparty} />
            </>
          }
        >
          {current?.terms.item.title ?? 'Order'} <Badge className="align-middle">{STATUS_LABEL[draft.status]}</Badge>
        </PageTitle>
      </div>

      {draft.status === 'linked' && draft.escrowContractId && (
        <Alert tone="success" title="The escrow exists on-chain">
          <Link className="font-semibold underline" href={`/escrow/${draft.escrowContractId}`}>
            Open the escrow →
          </Link>
        </Alert>
      )}

      {draft.status === 'agreed' && role === 'buyer' && <CreateEscrow draft={draft} />}
      {draft.status === 'agreed' && role === 'seller' && (
        <Alert tone="info" title="Terms agreed">
          Waiting for the buyer to create and fund the escrow. Don&apos;t hand anything over before the escrow shows as funded.
        </Alert>
      )}

      {current && draft.status !== 'agreed' && (
        <Card
          title={`Revision ${current.revision}${current.proposedBy === me?.address ? ' (your proposal)' : ''}`}
          actions={<span className="text-xs text-slate-500">{formatDate(current.createdAt)}</span>}
        >
          <TermsSummary terms={current.terms} />
          {current.note && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm italic text-slate-700">“{current.note}”</p>}
          {draft.status === 'negotiating' && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-600">
                {iAccepted ? 'You accepted this revision.' : 'You have not accepted this revision.'}{' '}
                {theyAccepted ? 'The other party accepted it.' : 'Waiting for the other party.'}
              </p>
              {payoutMismatch && (
                <Alert tone="warning">
                  These terms pay <span className="font-mono">{current.terms.seller}</span>, which is not your current payout address. Propose a new revision to use your current
                  one.
                </Alert>
              )}
              <div className="flex flex-wrap gap-2">
                {!iAccepted && (
                  <Button busy={busy === 'accept'} disabled={payoutMismatch} onClick={() => void act('accept', () => api.accept(id, current.revision))}>
                    Accept revision {current.revision}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setRevising((r) => !r)}>
                  {revising ? 'Close' : 'Propose changes'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {open && revising && current && (
        <Card title="Counter-proposal">
          <TermsForm
            initial={current.terms}
            submitLabel="Send counter-proposal"
            onSubmit={async ({ terms, note }) => {
              await api.revise(id, terms, note);
              setRevising(false);
              await qc.invalidateQueries({ queryKey: ['draft', id] });
            }}
          />
        </Card>
      )}

      <ErrorText error={actionError} />

      <Card title="Messages">
        <Chat draftId={id} releaseCodeHash={draft.releaseCodeHash} readOnly={draft.status === 'withdrawn'} />
      </Card>

      {draft.revisions.length > 1 && (
        <Card title="History">
          <ol className="space-y-2 text-sm">
            {draft.revisions
              .slice()
              .reverse()
              .map((r) => (
                <li key={r.revision} className="flex flex-wrap justify-between gap-2">
                  <span>
                    Revision {r.revision} by {r.proposedBy === me?.address ? 'you' : 'the other party'}
                    {r.acceptedBy.length === 2 && <Badge className="ml-2 bg-brand-100 text-brand-800">agreed</Badge>}
                  </span>
                  <span className="text-slate-500">{formatDate(r.createdAt)}</span>
                </li>
              ))}
          </ol>
        </Card>
      )}

      {open && draft.status === 'negotiating' && (
        <div>
          <Button variant="ghost" busy={busy === 'withdraw'} onClick={() => confirm('Withdraw this proposal? This cannot be undone.') && void act('withdraw', () => api.withdraw(id))}>
            Withdraw proposal
          </Button>
        </div>
      )}
    </div>
  );
}

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <Order id={id} />
    </RequireAuth>
  );
}
