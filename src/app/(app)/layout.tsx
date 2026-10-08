import type { ReactNode } from 'react';
import { Header } from '@/components/Header';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8">{children}</main>
    </>
  );
}
