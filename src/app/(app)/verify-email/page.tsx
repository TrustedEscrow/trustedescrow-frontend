'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Alert, Card, PageTitle, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

type Result = { state: 'ok' } | { state: 'error'; message: string };

function Verify() {
  const token = useSearchParams().get('token');
  const [result, setResult] = useState<Result | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api
      .verifyEmail(token)
      .then(() => setResult({ state: 'ok' }))
      .catch((e: Error) => setResult({ state: 'error', message: e.message }));
  }, [token]);

  const view: Result | null = token ? result : { state: 'error', message: 'This link has no verification token.' };

  return (
    <Card>
      {!view && <Spinner />}
      {view?.state === 'ok' && (
        <Alert tone="success" title="Email verified">
          You will get deadline reminders by email. Delivery codes are never sent by email. <Link className="underline" href="/dashboard">Go to your dashboard</Link>
        </Alert>
      )}
      {view?.state === 'error' && <Alert tone="danger" title="Could not verify">{view.message}</Alert>}
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="max-w-lg space-y-4">
      <PageTitle>Verify email</PageTitle>
      <Suspense fallback={<Spinner />}>
        <Verify />
      </Suspense>
    </div>
  );
}
