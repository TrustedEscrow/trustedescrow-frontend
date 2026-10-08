import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
const display = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument' });

export const metadata: Metadata = {
  title: { default: 'TrustEscrow — escrow for trade between strangers, on Stellar', template: '%s · TrustEscrow' },
  description:
    'Non-custodial peer-to-peer escrow on Stellar. The buyer’s money sits in a Soroban contract made for one trade, and the seller is paid only when both sides have spoken.',
  openGraph: {
    title: 'TrustEscrow',
    description: 'Non-custodial peer-to-peer escrow on Stellar. Nobody gets paid on their own word.',
    type: 'website',
  },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#08140f' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
