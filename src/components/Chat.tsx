'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { containsDeliveryCode, looksLikeCode } from '@/sdk/code';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMessages } from '@/lib/queries';
import { formatDate } from '@/lib/time';
import { Alert, Button, cx, ErrorText, shortAddress, Textarea } from './ui';

/**
 * Chat between the parties (and the arbitrator once disputed). Codes are caught here
 * first, by exact hash match when the committed hash is known and by shape otherwise;
 * the backend refuses them again as a backstop.
 */
export function Chat({ draftId, releaseCodeHash, readOnly }: { draftId: string; releaseCodeHash?: string | null; readOnly?: boolean }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data, error } = useMessages(draftId);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const [shapeWarning, setShapeWarning] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [count]);

  const send = async (force = false) => {
    setSendError(null);
    const text = body.trim();
    if (!text) return;
    if (releaseCodeHash && (await containsDeliveryCode(text, releaseCodeHash))) {
      setSendError(new Error('This message contains your delivery code. The code is the money: never send it in chat. Give it only when the item is in your hands.'));
      return;
    }
    if (!force && looksLikeCode(text)) {
      setShapeWarning(true);
      return;
    }
    setBusy(true);
    try {
      await api.sendMessage(draftId, text);
      setBody('');
      setShapeWarning(false);
      await qc.invalidateQueries({ queryKey: ['messages', draftId] });
    } catch (e) {
      setSendError(e instanceof ApiError && e.code === 'DELIVERY_CODE_IN_MESSAGE' ? new Error(e.message) : e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg bg-surface-2 p-3">
        {error && <ErrorText error={error} />}
        {count === 0 && <p className="text-center text-sm text-muted">No messages yet.</p>}
        {data?.messages.map((m) => {
          const mine = m.senderAddress === me?.address;
          if (m.senderRole === 'system') {
            return (
              <p key={m.seq} className="text-center text-xs text-muted">
                {m.body}
              </p>
            );
          }
          return (
            <div key={m.seq} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[85%] rounded-2xl px-3 py-2 text-sm', mine ? 'bg-brand-700 text-white' : m.senderRole === 'arbitrator' ? 'bg-amber-100' : 'bg-surface ring-1 ring-line')}>
                <p className={cx('mb-0.5 text-[11px] font-medium', mine ? 'text-brand-100' : 'text-muted')}>
                  {mine ? 'You' : m.senderRole === 'arbitrator' ? 'Arbitrator' : `${m.senderRole} · ${shortAddress(m.senderAddress)}`} · {formatDate(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {!readOnly && (
        <div className="space-y-2">
          <Textarea
            value={body}
            maxLength={4000}
            placeholder="Write a message. Never share your delivery code here."
            onChange={(e) => {
              setBody(e.target.value);
              setShapeWarning(false);
            }}
            className="min-h-16"
          />
          {shapeWarning && (
            <Alert tone="warning" title="That looks like a delivery code">
              <p>If this is your code, delete it. Codes are given only in person or by phone, once the item is in your hands.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void send(true)}>
                It&apos;s not a code, send anyway
              </Button>
            </Alert>
          )}
          <ErrorText error={sendError} />
          <div className="flex justify-end">
            <Button busy={busy} disabled={!body.trim()} onClick={() => void send()}>
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
