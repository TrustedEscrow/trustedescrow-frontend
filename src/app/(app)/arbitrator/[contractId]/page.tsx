'use client';

import { StrKey } from '@stellar/stellar-sdk';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Chat } from '@/components/Chat';
import { CodeInput } from '@/components/code';
import { Amount, Countdown, StateBadge, TermsSummary, Timeline } from '@/components/escrow-bits';
import { EvidencePanel } from '@/components/Evidence';
import { RequireAuth } from '@/components/SignIn';
import { Addr, Alert, Button, Card, ErrorText, Field, Hash, Input, Modal, PageTitle, Row, Spinner } from '@/components/ui';
import { termsHashHex } from '@/sdk/canonical-json';
import { escrowCalls } from '@/sdk/chain';
import { hashFile, PROOF_KIND_HELP } from '@/sdk/proof';
import { payoutOnRelease, type EscrowSnapshot, type Outcome } from '@/sdk/types';
import { api } from '@/lib/api';
import { isArbitrator, useAuth } from '@/lib/auth';
import { useEscrow } from '@/lib/queries';
import { formatDate, useNow } from '@/lib/time';
import { chain, useTx } from '@/lib/tx';

function gatewayUrl(uri: string): string | null {
  if (uri.startsWith('https://')) return uri;
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice('ipfs://'.length)}`;
  if (uri.startsWith('ar://')) return `https://arweave.net/${uri.slice('ar://'.length)}`;
  return null;
}

/** For `Content` proofs: hash the delivered file and compare with the on-chain hash. Automatic and objective (§7 step 4). */
function ContentCheck({ expected, uri }: { expected: string; uri: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const url = gatewayUrl(uri);
  const show = (hash: string) => setResult(hash === expected ? 'match' : `mismatch (${hash.slice(0, 12)}…)`);
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <p className="text-sm font-medium">Verify the delivered content</p>
      {url && (
        <Button
          variant="secondary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await fetch(url);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              show(await hashFile(await res.blob()));
            } catch (e) {
              setError(new Error(`Could not fetch the link from the browser (${e instanceof Error ? e.message : 'blocked'}). Download it and choose the file below.`));
            } finally {
              setBusy(false);
            }
          }}
        >
          Fetch link and hash
        </Button>
      )}
      <Field label="Or choose the file">
        <Input type="file" onChange={async (e) => e.target.files?.[0] && show(await hashFile(e.target.files[0]))} />
      </Field>
      {result === 'match' && <Alert tone="success">✓ The content matches the hash the seller committed.</Alert>}
      {result && result !== 'match' && <Alert tone="danger">✗ The content does not match: {result}</Alert>}
      <ErrorText error={error} />
    </div>
  );
}

function ResolvePanel({ e, onDone }: { e: EscrowSnapshot; onDone: () => void }) {
  const { walletAddress } = useAuth();
  const tx = useTx();
  const now = useNow();
  const [choice, setChoice] = useState<Outcome | null>(null);
  const [ack, setAck] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const deadline = e.dispute?.deadline ?? 0;
  const { payout } = payoutOnRelease(e.amount, e.feeBps);

  if (e.state !== 'Disputed') return <p className="text-sm text-slate-600">This escrow is no longer in dispute.</p>;
  if (now >= deadline) return <Alert tone="warning">The arbitration deadline has passed. You can no longer rule; anyone can refund the buyer.</Alert>;
  if (walletAddress !== e.arbitrator) {
    return (
      <Alert tone="warning">
        Switch Freighter to the arbitrator account <span className="font-mono">{e.arbitrator}</span> to rule.
      </Alert>
    );
  }

  const executeRuling = () => {
    if (!choice) return;
    void tx
      .run(choice === 'Release' ? 'Rule: release to seller' : 'Rule: refund buyer', ({ sign, address, onStep }) =>
        chain.escrow(e.contractId, address, sign, onStep)(escrowCalls.resolve(choice)),
      )
      .then(onDone)
      .catch(() => undefined);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant={choice === 'Release' ? 'primary' : 'secondary'} onClick={() => setChoice('Release')}>
          Release to seller
        </Button>
        <Button variant={choice === 'Refund' ? 'primary' : 'secondary'} onClick={() => setChoice('Refund')}>
          Refund buyer
        </Button>
      </div>
      {choice && (
        <>
          <Alert tone="warning">
            {choice === 'Release' ? (
              <>
                The seller receives <Amount token={e.token} units={payout} />. Final.
              </>
            ) : (
              <>
                The buyer receives <Amount token={e.token} units={e.amount} />. Final.
              </>
            )}
          </Alert>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={ack} onChange={(ev) => setAck(ev.target.checked)} />
            <span>I have reviewed the proof, the terms, the messages and the evidence.</span>
          </label>
          <Button disabled={!ack} onClick={() => setShowConfirm(true)}>
            Sign ruling
          </Button>

          <Modal open={showConfirm} title="Confirm Irrevocable Ruling" onClose={() => setShowConfirm(false)}>
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Please review this dispute ruling carefully. Once signed, this decision cannot be undone and transfers funds immediately on-chain.
              </p>
              <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Ruling Decision:</span>
                  <span className="font-semibold text-slate-900">{choice === 'Release' ? 'Release funds to seller' : 'Refund funds to buyer'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Recipient Account:</span>
                  <span className="truncate font-mono text-xs">{choice === 'Release' ? e.seller : e.buyer}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payout to Party:</span>
                  <span className="font-medium text-slate-900">
                    {choice === 'Release' ? <Amount token={e.token} units={payout} /> : <Amount token={e.token} units={e.amount} />}
                  </span>
                </div>
                {choice === 'Release' && e.feeBps > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Platform Fee ({(e.feeBps / 100).toFixed(2)}%):</span>
                    <span><Amount token={e.token} units={e.amount - payout} /></span>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShowConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  variant={choice === 'Release' ? 'primary' : 'danger'}
                  onClick={() => {
                    setShowConfirm(false);
                    executeRuling();
                  }}
                >
                  Confirm and sign ruling
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}

function CaseFile({ id }: { id: string }) {
  const escrow = useEscrow(id);
  const caseFile = useQuery({ queryKey: ['case', id], queryFn: () => api.caseFile(id) });
  const localTermsHash = useQuery({
    queryKey: ['case-terms-hash', id],
    queryFn: () => termsHashHex(caseFile.data!.draft!.terms),
    enabled: !!caseFile.data?.draft,
  });
  const onCode = useCallback(() => undefined, []);

  if (escrow.isLoading || caseFile.isLoading) return <Spinner />;
  if (escrow.error) return <ErrorText error={escrow.error} />;
  const e = escrow.data;
  if (!e) return null;
  const cf = caseFile.data;
  const termsOk = localTermsHash.data ? localTermsHash.data === e.termsHash : null;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/arbitrator" className="text-sm text-brand-700">
          ← All disputes
        </Link>
        <PageTitle sub={<span className="font-mono text-xs">{id}</span>}>{cf?.draft?.terms.item.title ?? 'Dispute'}</PageTitle>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <StateBadge state={e.state} />
                <Amount token={e.token} units={e.amount} className="block text-2xl font-bold" />
                {e.dispute && (
                  <p className="text-sm text-slate-700">
                    {e.dispute.openedBy === 'ReceiptTimeout' ? 'The buyer gave no receipt and no objection before the deadline.' : `Opened by the ${e.dispute.openedBy.toLowerCase()}`}{' '}
                    from {e.dispute.fromState}, {formatDate(e.dispute.openedAt)}.
                  </p>
                )}
              </div>
              {e.dispute && e.state === 'Disputed' && <Countdown at={e.dispute.deadline} label="Rule before" after="The buyer can now be refunded by anyone." />}
            </div>
          </Card>

          <Card title="Ruling">
            <ResolvePanel e={e} onDone={() => void escrow.refetch()} />
          </Card>

          <Card title="Agreed terms">
            {cf?.draft ? (
              <>
                {termsOk === false && <Alert tone="danger" title="Terms hash mismatch">The terms on file do not hash to the on-chain terms_hash. Treat the stored terms as unreliable.</Alert>}
                {termsOk === true && <p className="mb-2 text-xs font-medium text-emerald-700">✓ Recomputed on this device: matches the on-chain terms hash</p>}
                <TermsSummary terms={cf.draft.terms} feeBps={e.feeBps} />
              </>
            ) : (
              <Alert tone="warning">No agreed terms are linked to this escrow. On-chain terms hash: <Hash value={e.termsHash} /></Alert>
            )}
          </Card>

          <Card title="Seller's proof">
            {e.proof ? (
              <div className="space-y-3">
                <dl className="divide-y divide-slate-100">
                  <Row label="Kind">{PROOF_KIND_HELP[e.proof.kind].label}</Row>
                  <Row label="Link">{e.proof.uri ? <span className="break-all">{e.proof.uri}</span> : '—'}</Row>
                  <Row label="Hash">
                    <Hash value={e.proof.hash} />
                  </Row>
                  <Row label="Submitted">{formatDate(e.proof.submittedAt)}</Row>
                </dl>
                {e.proof.kind === 'Content' && <ContentCheck expected={e.proof.hash} uri={e.proof.uri} />}
                {e.proof.kind === 'Tracking' && <Alert tone="info">Check the carrier independently. Don&apos;t rely on the link alone.</Alert>}
                {e.proof.kind === 'Attestation' && <Alert tone="info">A seller statement: the weakest tier. Compare its hash with the statement in the evidence below.</Alert>}
              </div>
            ) : (
              <p className="text-sm text-slate-600">The seller never submitted proof.</p>
            )}
          </Card>

          <Card title="Seller says they hold the buyer's code?">
            <p className="mb-2 text-sm text-slate-600">
              Type it here. It is hashed on this device and compared with the escrow&apos;s committed hash. Nothing is sent to the server. A match is strong evidence the buyer handed it
              over, but a coerced handover looks the same.
            </p>
            <CodeInput expectedHash={e.releaseCodeHash} onValid={onCode} />
          </Card>

          {cf?.draft && (
            <>
              <Card title="Statements and evidence">
                <EvidencePanel draftId={cf.draft.id} releaseCodeHash={e.releaseCodeHash} canUpload canStatement={false} statementHash={e.dispute?.statementHash} rulingHash={e.dispute?.rulingHash} />
              </Card>
              <Card title="Messages">
                <Chat draftId={cf.draft.id} releaseCodeHash={e.releaseCodeHash} readOnly={e.state !== 'Disputed'} />
              </Card>
            </>
          )}
          {caseFile.error && <ErrorText error={caseFile.error} />}
        </div>

        <aside className="space-y-5">
          <Card title="Parties">
            <dl className="divide-y divide-slate-100">
              <Row label="Buyer">
                <Addr value={e.buyer} />
              </Row>
              <Row label="Seller">
                <Addr value={e.seller} />
              </Row>
              <Row label="Arbitrator">
                <Addr value={e.arbitrator} />
              </Row>
            </dl>
          </Card>
          <Card title="Timeline">
            <Timeline e={e} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function ArbitratorCasePage() {
  const { contractId } = useParams<{ contractId: string }>();
  const { me, status } = useAuth();
  if (!StrKey.isValidContract(contractId)) return <Alert tone="danger">That is not a Stellar contract address.</Alert>;
  return <RequireAuth>{status === 'signed_in' && !isArbitrator(me) ? <Alert tone="danger">This account is not an arbitrator.</Alert> : <CaseFile id={contractId} />}</RequireAuth>;
}
