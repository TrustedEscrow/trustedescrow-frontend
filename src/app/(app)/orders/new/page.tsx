'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/SignIn';
import { TermsForm } from '@/components/TermsForm';
import { Card, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';

function NewOrder() {
  const router = useRouter();
  const qc = useQueryClient();
  return (
    <div className="space-y-4">
      <PageTitle sub="Propose terms. Nothing is on-chain until both of you accept and the buyer deposits.">New order</PageTitle>
      <Card>
        <TermsForm
          withParties
          submitLabel="Send proposal"
          onSubmit={async ({ role, counterpartyAddress, terms, note }) => {
            const draft = await api.createDraft({ role: role!, counterpartyAddress: counterpartyAddress!, terms, note });
            await qc.invalidateQueries({ queryKey: ['drafts'] });
            router.push(`/orders/${draft.id}`);
          }}
        />
      </Card>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <RequireAuth>
      <NewOrder />
    </RequireAuth>
  );
}
