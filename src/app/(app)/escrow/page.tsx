'use client';

import { StrKey } from '@stellar/stellar-sdk';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Input, PageTitle } from '@/components/ui';
import { config, explorerContractUrl } from '@/lib/config';

export default function EscrowLookupPage() {
  const router = useRouter();
  const [contractId, setContractId] = useState('');
  const trimmed = contractId.trim();
  const isValid = StrKey.isValidContract(trimmed);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      router.push(`/escrow/${trimmed}`);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-4">
      <div>
        <Link href="/" className="text-sm text-brand-700">
          ← Home
        </Link>
        <PageTitle sub="Open any escrow straight from the chain, with or without an account here.">Open an escrow by address</PageTitle>
      </div>

      <Card title="Escrow contract address">
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted">
            An escrow page reads the contract itself, not this site’s cache. It works while the backend is down, and it works for escrows this backend has never
            seen.
          </p>

          <Field label="Address (C…)" hint={trimmed && !isValid ? 'That is not a valid Soroban contract address.' : undefined}>
            <Input
              autoFocus
              className="font-mono text-sm"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              placeholder="C..."
              spellCheck={false}
            />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button type="submit" disabled={!isValid}>
              Open escrow →
            </Button>
            {config.factoryContractId && (
              <a href={explorerContractUrl(config.factoryContractId)} target="_blank" rel="noreferrer" className="text-xs text-brand-700 underline">
                Factory on Stellar Expert ↗
              </a>
            )}
          </div>
        </form>
      </Card>

      <aside className="space-y-2 rounded-xl border border-line bg-surface p-4 text-xs text-muted">
        <p className="font-semibold text-ink">What still holds when this site is down</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>The seller is paid only with their proof plus the buyer’s code or confirmation, or an arbitrator’s ruling.</li>
          <li>No deadline ever pays the seller.</li>
          <li>Every value on the escrow page is read live from the contract over Soroban RPC.</li>
        </ul>
      </aside>
    </div>
  );
}
