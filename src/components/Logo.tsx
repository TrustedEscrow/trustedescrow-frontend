import { cx } from '@/lib/cx';

/** Two halves held apart: the buyer's side and the seller's side, with the contract between them. */
export function LogoMark({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const square = tone === 'dark' ? '#34d399' : '#065f46';
  const halves = tone === 'dark' ? '#08140f' : '#ffffff';
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cx('h-7 w-7 shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill={square} />
      <path d="M14.5 8a8 8 0 0 0 0 16z" fill={halves} />
      <path d="M17.5 8a8 8 0 0 1 0 16z" fill={halves} />
    </svg>
  );
}

export function Wordmark({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-tight', tone === 'dark' ? 'text-white' : 'text-ink', className)}>
      <LogoMark tone={tone} />
      TrustEscrow
    </span>
  );
}
