'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { RequireAuth } from '@/components/SignIn';
import { Button, Card, cx, Empty, ErrorText, PageTitle, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/queries';
import { formatDate } from '@/lib/time';

function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useNotifications();
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub="Deadlines and changes on your orders. Delivery codes are never sent here.">Alerts</PageTitle>
        <Button
          variant="secondary"
          onClick={async () => {
            await api.readAllNotifications();
            await refresh();
          }}
        >
          Mark all read
        </Button>
      </div>
      <Card>
        {isLoading ? <Spinner /> : error ? <ErrorText error={error} /> : !data?.length ? <Empty>Nothing yet.</Empty> : (
          <ul className="divide-y divide-slate-100">
            {data.map((n) => {
              const href = n.escrow_contract_id ? `/escrow/${n.escrow_contract_id}` : n.draft_id ? `/orders/${n.draft_id}` : null;
              return (
                <li key={n.id} className={cx('flex flex-wrap items-start justify-between gap-2 py-3', !n.read_at && 'font-medium')}>
                  <div className="space-y-0.5">
                    <p className="text-sm">
                      {!n.read_at && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand-600" />}
                      {n.title}
                    </p>
                    <p className="text-sm font-normal text-slate-600">{n.body}</p>
                    <p className="text-xs font-normal text-slate-400">{formatDate(n.send_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    {href && (
                      <Link
                        href={href}
                        className="text-sm font-medium text-brand-700"
                        onClick={() => {
                          if (!n.read_at) void api.readNotification(n.id).then(refresh);
                        }}
                      >
                        Open
                      </Link>
                    )}
                    {!n.read_at && (
                      <button className="text-sm text-slate-500" onClick={() => void api.readNotification(n.id).then(refresh)}>
                        Mark read
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Notifications />
    </RequireAuth>
  );
}
