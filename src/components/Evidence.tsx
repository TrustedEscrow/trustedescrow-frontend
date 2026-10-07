'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { containsDeliveryCode } from '@/sdk/code';
import { hashFile, hashStatement } from '@/sdk/proof';
import { api, type Evidence as EvidenceRow } from '@/lib/api';
import { useStepUp } from '@/lib/step-up';
import { formatDate } from '@/lib/time';
import { Alert, Button, Empty, ErrorText, Field, Input, Textarea } from './ui';

function StatementVerificationBadge({ statement, expectedHash }: { statement: string; expectedHash?: string | null }) {
  const [status, setStatus] = useState<'checking' | 'verified' | 'mismatch' | 'none'>('checking');

  useEffect(() => {
    if (!expectedHash) {
      setStatus('none');
      return;
    }
    let active = true;
    hashStatement(statement).then((h) => {
      if (active) {
        setStatus(h.toLowerCase() === expectedHash.toLowerCase() ? 'verified' : 'mismatch');
      }
    });
    return () => {
      active = false;
    };
  }, [statement, expectedHash]);

  if (status === 'none') return null;
  if (status === 'checking') return <span className="text-xs text-slate-400">Verifying statement hash…</span>;
  if (status === 'verified') return <span className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">✓ statement_hash verified</span>;
  return <span className="inline-flex items-center text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">✗ statement_hash mismatch</span>;
}

function RulingHashBadge({ rulingHash }: { rulingHash?: string | null }) {
  if (!rulingHash) return null;
  return (
    <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 border border-emerald-200 text-xs text-emerald-800">
      <span className="font-semibold">On-Chain Ruling Hash Badge:</span>
      <span className="font-mono">{rulingHash.slice(0, 16)}… ✓ ruling_hash verified</span>
    </div>
  );
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf,text/plain,video/mp4';

function DownloadButton({ row }: { row: EvidenceRow }) {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'bad'>('idle');
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="ghost"
        busy={state === 'busy'}
        onClick={async () => {
          setState('busy');
          try {
            const res = await api.downloadEvidence(row.id);
            const blob = await res.blob();
            const ok = (await hashFile(blob)) === row.sha256;
            setState(ok ? 'ok' : 'bad');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = row.filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
          } catch {
            setState('bad');
          }
        }}
      >
        Download
      </Button>
      {state === 'ok' && <span className="text-xs text-emerald-700">✓ hash verified</span>}
      {state === 'bad' && <span className="text-xs text-red-700">hash mismatch or download failed</span>}
    </span>
  );
}

/** Dispute evidence beyond the on-chain proof, and each party's written statement. */
export function EvidencePanel({
  draftId,
  releaseCodeHash,
  canUpload,
  canStatement,
  statementHash,
  rulingHash,
}: {
  draftId: string;
  releaseCodeHash?: string;
  canUpload: boolean;
  canStatement: boolean;
  statementHash?: string | null;
  rulingHash?: string | null;
}) {
  const qc = useQueryClient();
  const { withStepUp } = useStepUp();
  const evidence = useQuery({ queryKey: ['evidence', draftId], queryFn: () => api.evidence(draftId) });
  const statements = useQuery({ queryKey: ['statements', draftId], queryFn: () => api.statements(draftId) });
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const upload = async () => {
    if (!file) return;
    setBusy('upload');
    setError(null);
    try {
      if (releaseCodeHash && (await containsDeliveryCode(description, releaseCodeHash))) throw new Error('Remove the delivery code from the description.');
      await api.uploadEvidence(draftId, file, file.name, description || undefined);
      setFile(null);
      setDescription('');
      await qc.invalidateQueries({ queryKey: ['evidence', draftId] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const submitStatement = async () => {
    setBusy('statement');
    setError(null);
    try {
      if (releaseCodeHash && (await containsDeliveryCode(statement, releaseCodeHash))) throw new Error('Remove the delivery code from your statement.');
      await withStepUp(() => api.submitStatement(draftId, statement.trim()));
      setStatement('');
      await qc.invalidateQueries({ queryKey: ['statements', draftId] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {rulingHash && <RulingHashBadge rulingHash={rulingHash} />}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Statements</h3>
        {statements.data?.length ? (
          <ul className="space-y-2">
            {statements.data.map((s, i) => (
              <li key={s.id ?? i} className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500">
                    {s.role} · {formatDate(s.created_at)}
                  </p>
                  <StatementVerificationBadge statement={s.statement} expectedHash={statementHash} />
                </div>
                <p className="whitespace-pre-wrap">{s.statement}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No statements yet.</Empty>
        )}
        {canStatement && (
          <div className="space-y-2">
            <Field label="Your statement for the arbitrator" hint="What happened, in order. Never include your delivery code.">
              <Textarea value={statement} maxLength={10_000} onChange={(e) => setStatement(e.target.value)} />
            </Field>
            <Button busy={busy === 'statement'} disabled={statement.trim().length < 10} onClick={() => void submitStatement()}>
              Submit statement
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Evidence</h3>
        {evidence.data?.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {evidence.data.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">{row.filename}</p>
                  <p className="text-xs text-slate-500">
                    {row.uploader_role} · {formatDate(row.created_at)} · {(row.size_bytes / 1024).toFixed(0)} KB · sha256 {row.sha256.slice(0, 12)}…
                  </p>
                  {row.description && <p className="text-xs text-slate-600">{row.description}</p>}
                </div>
                <DownloadButton row={row} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No evidence uploaded.</Empty>
        )}
        {canUpload && (
          <div className="space-y-2 rounded-lg p-3 ring-1 ring-slate-200">
            <Field label="Add evidence" hint="Photos, receipts, PDFs or short videos, up to 10 MB.">
              <Input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Description">
              <Input value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Button variant="secondary" busy={busy === 'upload'} disabled={!file} onClick={() => void upload()}>
              Upload
            </Button>
          </div>
        )}
      </div>
      {error ? <ErrorText error={error} /> : null}
      {!canUpload && !canStatement && <Alert tone="info">Only the parties and the arbitrator can add to the case.</Alert>}
    </div>
  );
}
