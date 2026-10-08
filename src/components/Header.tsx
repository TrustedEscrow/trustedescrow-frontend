'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { isArbitrator, useAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { useNotifications } from '@/lib/queries';
import { Wordmark } from './Logo';
import { Badge, Button, cx, shortAddress } from './ui';

export function Header() {
  const { status, me, walletAddress, signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const unread = useNotifications(true).data?.length ?? 0;
  const signedIn = status === 'signed_in';

  const links = signedIn
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/orders', label: 'Orders' },
        { href: '/orders/new', label: 'New order' },
        { href: '/notifications', label: unread ? `Alerts (${unread})` : 'Alerts' },
        { href: '/settings', label: 'Settings' },
        ...(isArbitrator(me) ? [{ href: '/arbitrator', label: 'Arbitration' }] : []),
      ]
    : [];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Wordmark />
          {config.network !== 'public' && <Badge className="bg-amber-100 text-amber-900">{config.network}</Badge>}
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cx('rounded-md px-3 py-1.5 text-sm font-medium', pathname.startsWith(l.href) ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:text-ink')}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {signedIn && me && (
            <div className="hidden text-right text-xs sm:block">
              <p className="font-mono text-slate-700">{me.displayName ?? shortAddress(me.address)}</p>
              {walletAddress && walletAddress !== me.address && <p className="text-amber-700">Wallet: {shortAddress(walletAddress)}</p>}
            </div>
          )}
          {signedIn ? (
            <Button variant="secondary" className="hidden md:inline-flex" onClick={() => void signOut()}>
              Sign out
            </Button>
          ) : null}
          {signedIn && (
            <button className="rounded-md p-2 text-slate-700 md:hidden" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
              ☰
            </button>
          )}
        </div>
      </div>
      {open && signedIn && (
        <nav className="border-t border-slate-200 px-4 py-2 md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-md px-2 py-2 text-sm font-medium text-slate-700">
              {l.label}
            </Link>
          ))}
          <button className="block w-full rounded-md px-2 py-2 text-left text-sm font-medium text-slate-700" onClick={() => void signOut()}>
            Sign out
          </button>
        </nav>
      )}
    </header>
  );
}
