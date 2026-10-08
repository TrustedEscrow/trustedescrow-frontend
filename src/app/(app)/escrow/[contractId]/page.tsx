'use client';

import { StrKey } from '@stellar/stellar-sdk';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Chat } from '@/components/Chat';
import { EscrowActions } from '@/components/EscrowActions';
import { Amount, Countdown, StateBadge, settlementText, TermsSummary, Timeline } from '@/components/escrow-bits';
import { EvidencePanel } from '@/components/Evidence';
import { WalletMismatch } from '@/components/SignIn';
import { Addr, Alert, Card, ErrorText, Hash, PageTitle, Row, Spinner } from '@/components/ui';
import { nextDeadline, viewerOf } from '@/sdk/actions';
import { PROOF_KIND_HELP } from '@/sdk/proof';
import { termsMismatches } from '@/sdk/terms';
import { payoutOnRelease, TERMINAL_STATES } from '@/sdk/types';
import { useAuth } from '@/lib/auth';
import { config, explorerContractUrl } from '@/lib/config';
import { useAgreedTerms, useEscrow, useEscrowDraftId, useEscrowProvenance, useEscrowVersion, useEscrowWasm } from '@/lib/queries';
import { formatDate } from '@/lib/time';

/**
 * One escrow, read live from contract storage. Works without a backend session: the
 * lifecycle only needs the chain and a wallet (ARCHITECTURE design goal 1). Signing in
 * adds the agreed terms, the delivery code vault, chat and the case file.
 */
function EscrowView({ id }: { id: string }) {
  const { walletAddress, me, status } = useAuth();
  const signedIn = status === 'signed_in';
  const escrow = useEscrow(id);
  const wasm = useEscrowWasm(id);
  const draftId = useEscrowDraftId(id).data ?? null;
  const terms = useAgreedTerms(draftId, !!draftId);

  if (escrow.isLoading) return <Spinner />;
  if (escrow.error) return <ErrorText error={escrow.error} />;
  const e = escrow.data;
  if (!e) return null;

  const version = useEscrowVersion(id);
  const provenance = useEscrowProvenance(id, e.buyer, e.salt);

  const viewer = viewerOf(e, walletAddress);
  const sessionViewer = viewerOf(e, me?.address);
  const pinned = wasm.data === undefined ? null : wasm.data === config.escrowWasmHash;
  const mismatches = terms.data ? termsMismatches(terms.data.terms, terms.data.termsHash, e) : null;
  const deadline = nextDeadline(e);
  const settled = settlementText(e);
  const { payout, fee } = payoutOnRelease(e.amount, e.feeBps);
  const isParty = viewer === 'buyer' || viewer === 'seller' || sessionViewer === 'buyer' || sessionViewer === 'seller';

  return (
    <div className="space-y-5">
      <div>
        {signedIn && (
          <Link href="/dashboard" className="text-sm text-brand-700">
            ← Dashboard
          </Link>
        )}
        <PageTitle
          sub={
            <a className="font-mono text-xs underline" href={explorerContractUrl(id)} target="_blank" rel="noreferrer">
              {id}
            </a>
          }
        >
          {terms.data?.terms.item.title ?? 'Escrow'}
        </PageTitle>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {version.data && (
            <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              v{version.data}
            </span>
          )}
          {provenance.data === true && (
            <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              ✓ Factory Provenance Verified
            </span>
          )}
          {provenance.data === false && (
            <span className="inline-flex items-center rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              ✗ Unverified Provenance
            </span>
          )}
        </div>
      </div>

      {pinned === false && (
        <Alert tone="danger" title="Not the audited escrow contract">
          This contract runs WASM <span className="font-mono">{wasm.data ?? 'none'}</span>, not the audited escrow this app pins. Do not deposit into it.
        </Alert>
      )}
      {mismatches && mismatches.length > 0 && (
        <Alert tone="danger" title="On-chain terms differ from the agreed terms">
          Mismatched: {mismatches.join(', ')}. Do not deposit, and tell the other party.
        </Alert>
      )}
      {sessionViewer !== 'other' && sessionViewer !== 'arbitrator' && <WalletMismatch expected={sessionViewer === 'buyer' ? e.buyer : e.seller} role={sessionViewer} />}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <StateBadge state={e.state} />
                <Amount token={e.token} units={e.amount} className="block text-2xl font-bold" />
                {settled && <p className="text-sm font-medium text-slate-700">{settled}</p>}
              </div>
              {deadline && !TERMINAL_STATES.has(e.state) && <Countdown at={deadline.at} label={deadline.label} after={deadline.after} />}
            </div>
          </Card>

          <Card title={viewer === 'other' ? 'Actions' : `Your actions as ${viewer}`}>
            <EscrowActions e={e} viewer={viewer} draftId={draftId} signedIn={signedIn} terms={terms.data ?? null} onChanged={() => void escrow.refetch()} />
          </Card>

          {e.proof && (
            <Card title="Seller's proof of delivery">
              <dl className="divide-y divide-slate-100">
                <Row label="Kind">{PROOF_KIND_HELP[e.proof.kind].label}</Row>
                {e.proof.uri && (
                  <Row label="Link">
                    <a className="break-all text-brand-700 underline" href={e.proof.uri.startsWith('https://') ? e.proof.uri : undefined} target="_blank" rel="noreferrer noopener">
                      {e.proof.uri}
                    </a>
                  </Row>
                )}
                <Row label="Content hash">
                  <Hash value={e.proof.hash} />
                </Row>
                <Row label="Submitted">{formatDate(e.proof.submittedAt)}</Row>
              </dl>
              <p className="mt-2 text-xs text-slate-500">Committed on-chain. It cannot be changed.</p>
            </Card>
          )}

          {terms.data && (
            <Card title="Agreed terms" actions={mismatches?.length === 0 && <span className="text-xs font-medium text-emerald-700">✓ matches on-chain terms hash</span>}>
              <TermsSummary terms={terms.data.terms} feeBps={e.feeBps} />
            </Card>
          )}

          {draftId && signedIn && (e.dispute || e.state === 'Disputed') && (
            <Card title="Dispute case">
              <EvidencePanel draftId={draftId} releaseCodeHash={e.releaseCodeHash} canUpload={isParty} canStatement={isParty && e.state === 'Disputed'} statementHash={e.dispute?.statementHash} rulingHash={e.dispute?.rulingHash} />
            </Card>
          )}

          {draftId && signedIn && isParty && (
            <Card title="Messages">
              <Chat draftId={draftId} releaseCodeHash={e.releaseCodeHash} />
            </Card>
          )}
        </div>

        <aside className="space-y-5">
          <Card title="Parties">
            <dl className="divide-y divide-slate-100">
              <Row label="Buyer">
                <Addr value={e.buyer} you={e.buyer === walletAddress} />
              </Row>
              <Row label="Seller">
                <Addr value={e.seller} you={e.seller === walletAddress} />
              </Row>
              <Row label="Arbitrator">
                <Addr value={e.arbitrator} you={e.arbitrator === walletAddress} />
              </Row>
            </dl>
          </Card>
          <Card title="Timeline">
            <Timeline e={e} />
          </Card>
          <Card title="Money">
            <dl className="divide-y divide-slate-100">
              <Row label="Deposit">
                <Amount token={e.token} units={e.amount} />
              </Row>
              <Row label="Seller gets on release">
                <Amount token={e.token} units={payout} />
              </Row>
              <Row label="Fee (release only)">
                <Amount token={e.token} units={fee} />
              </Row>
              <Row label="On refund, buyer gets">
                <Amount token={e.token} units={e.amount} />
              </Row>
            </dl>
          </Card>
          <p className="text-xs text-slate-500">Read from ledger {e.ledger}. Everything on this page can also be done from a CLI against the contract.</p>
        </aside>
      </div>
    </div>
  );
}

export default function EscrowPage() {
  const { contractId } = useParams<{ contractId: string }>();
  if (!StrKey.isValidContract(contractId)) return <Alert tone="danger">That is not a Stellar contract address.</Alert>;
  return <EscrowView id={contractId} />;
}
