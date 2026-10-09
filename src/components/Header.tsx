'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { isArbitrator, useAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { useNotifications } from '@/lib/queries';
import { Wordmark } from './Logo';
import { ThemeSwitcher } from './ThemeSwitcher';
import { Badge, Button, cx, shortAddress } from './ui';

export function Header() {
  const { status, me, walletAddress, signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  const unread = useNotifications(true).data?.length ?? 0;
  const signedIn = status === 'signed_in';

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        menuButtonRef.current?.focus();
      } else if (e.key === 'Tab' && mobileNavRef.current) {
        const focusables = mobileNavRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const links = signedIn
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/orders', label: 'Orders' },
        { href: '/orders/new', label: 'New order' },
        { href: '/escrow', label: 'Open by address' },
        { href: '/notifications', label: unread ? `Alerts (${unread})` : 'Alerts' },
        { href: '/settings', label: 'Settings' },
        ...(isArbitrator(me) ? [{ href: '/arbitrator', label: 'Arbitration' }] : []),
      ]
    : [
        { href: '/escrow', label: 'Open by address' },
      ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Wordmark />
          {config.network !== 'public' && <Badge className="bg-amber-100 text-amber-900">{config.network}</Badge>}
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={cx('rounded-md px-3 py-1.5 text-sm font-medium', active ? 'bg-brand-50 text-brand-800' : 'text-muted hover:text-ink')}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          {signedIn && me && (
            <div className="hidden text-right text-xs sm:block">
              <p className="font-mono text-muted">{me.displayName ?? shortAddress(me.address)}</p>
              {walletAddress && walletAddress !== me.address && <p className="text-amber-700">Wallet: {shortAddress(walletAddress)}</p>}
            </div>
          )}
          {signedIn ? (
            <Button variant="secondary" className="hidden md:inline-flex" onClick={() => void signOut()}>
              Sign out
            </Button>
          ) : null}
          {signedIn && (
            <button
              ref={menuButtonRef}
              className="rounded-md p-2 text-muted md:hidden"
              aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={open}
              aria-controls="mobile-navigation-menu"
              aria-haspopup="true"
              onClick={() => setOpen((o) => !o)}
            >
              ☰
            </button>
          )}
        </div>
      </div>
      {open && signedIn && (
        <nav
          id="mobile-navigation-menu"
          ref={mobileNavRef}
          aria-label="Mobile navigation"
          className="border-t border-line px-4 py-2 md:hidden"
        >
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={cx('block rounded-md px-2 py-2 text-sm font-medium', active ? 'bg-brand-50 text-brand-800' : 'text-muted')}
              >
                {l.label}
              </Link>
            );
          })}
          <button className="block w-full rounded-md px-2 py-2 text-left text-sm font-medium text-muted" onClick={() => void signOut()}>
            Sign out
          </button>
        </nav>
      )}
    </header>
  );
}
