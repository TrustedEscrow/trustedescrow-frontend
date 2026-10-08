import Link from 'next/link';
import type { ReactNode } from 'react';
import { config } from '@/lib/config';
import { LogoMark, Wordmark } from './Logo';
import { cx, shortAddress } from '@/lib/cx';

const GITHUB = 'https://github.com/TrustedEscrow';
const ARCHITECTURE = `${GITHUB}/trustedescrow-docs/blob/main/ARCHITECTURE.md`;
const SECURITY = `${GITHUB}/trustedescrow-contract/blob/main/SECURITY.md`;

function explorerUrl() {
  return config.factoryContractId ? `https://stellar.expert/explorer/${config.network}/contract/${config.factoryContractId}` : null;
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cx('h-4 w-4 fill-current', className)}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Eyebrow({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <p className={cx('font-mono text-xs uppercase tracking-[0.18em]', dark ? 'text-brand-300' : 'text-brand-700')}>{children}</p>;
}

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-6xl px-5 sm:px-8', className)}>{children}</div>;
}

/* ---------------------------------------------------------------- nav + hero */

function MarketingNav() {
  return (
    <nav className="relative z-10">
      <Container className="flex items-center justify-between py-5">
        <Link href="/" aria-label="TrustEscrow home">
          <Wordmark tone="dark" />
        </Link>
        <div className="hidden items-center gap-8 text-sm text-white/70 md:flex">
          <a href="#how" className="hover:text-white">
            How it works
          </a>
          <a href="#security" className="hover:text-white">
            Security
          </a>
          <a href="#architecture" className="hover:text-white">
            Architecture
          </a>
          <a href={GITHUB} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-white">
            <GitHubIcon /> GitHub
          </a>
        </div>
        <Link href="/dashboard" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-night hover:bg-brand-100">
          Launch app
        </Link>
      </Container>
    </nav>
  );
}

function TimelineStep({ state, title, detail }: { state: 'done' | 'current' | 'next'; title: string; detail: string }) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span
        aria-hidden
        className={cx(
          'relative z-10 mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold',
          state === 'done' && 'bg-brand-600 text-white',
          state === 'current' && 'bg-white ring-2 ring-violet-500',
          state === 'next' && 'bg-white ring-1 ring-line',
        )}
      >
        {state === 'done' ? '✓' : state === 'current' ? <span className="h-2 w-2 animate-pulse rounded-full bg-violet-500" /> : null}
      </span>
      <div className="min-w-0">
        <p className={cx('text-sm font-medium', state === 'next' ? 'text-slate-400' : 'text-ink')}>{title}</p>
        <p className={cx('truncate text-xs', state === 'next' ? 'text-slate-400' : 'text-slate-500')}>{detail}</p>
      </div>
    </li>
  );
}

/** An illustration of the product, built from the same states the real escrow page shows. */
function ProductMock() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl bg-white text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="text-xs text-slate-500">
            Escrow <span className="font-mono text-slate-700">CDBD…QMRP</span>
          </p>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">Delivered, awaiting receipt</span>
        </div>
        <div className="space-y-5 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Refurbished iPhone 15, 128 GB</p>
              <p className="text-xs text-slate-500">Shipped · GIG Logistics</p>
            </div>
            <p className="text-right">
              <span className="block font-display text-3xl leading-none">1,500.00</span>
              <span className="text-xs font-medium text-slate-500">USDC held by contract</span>
            </p>
          </div>
          <ol className="relative before:absolute before:top-2 before:bottom-2 before:left-[9px] before:w-px before:bg-line">
            <TimelineStep state="done" title="Terms agreed" detail="sha256 7f3a…c91e committed at creation" />
            <TimelineStep state="done" title="Funded by the buyer" detail="Moved into this trade’s contract" />
            <TimelineStep state="done" title="Proof submitted by the seller" detail="Tracking GIG-8841203 · on-chain, immutable" />
            <TimelineStep state="current" title="Awaiting the buyer’s receipt" detail="2 days left, then it goes to an arbitrator" />
            <TimelineStep state="next" title="Released to the seller" detail="Only with the buyer’s code or confirmation" />
          </ol>
          <div className="rounded-xl bg-paper p-3 ring-1 ring-line">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Buyer’s delivery code</p>
            <p className="font-code mt-1 text-lg text-ink">K7M2-9XQF-••••-••••</p>
            <p className="mt-1 text-xs text-slate-500">Give it to the seller only once the phone is in your hands.</p>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 -left-4 hidden rounded-xl bg-night-2 px-4 py-3 text-white shadow-xl ring-1 ring-white/10 sm:block">
        <p className="text-[11px] uppercase tracking-wider text-white/50">On release</p>
        <p className="text-sm">
          Seller <span className="font-semibold">1,477.50</span> · Fee <span className="font-semibold">22.50</span> <span className="text-white/50">(1.5%)</span>
        </p>
      </div>
      <p className="mt-3 text-right text-[11px] text-white/40">Illustrative trade</p>
    </div>
  );
}

function Hero() {
  const explorer = explorerUrl();
  return (
    <header className="relative overflow-hidden bg-night text-white">
      <div aria-hidden className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      <div aria-hidden className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <MarketingNav />
      <Container className="relative grid items-center gap-14 pt-10 pb-24 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16 lg:pb-32">
        <div>
          {explorer ? (
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/80 ring-1 ring-white/15 hover:bg-white/10"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              Live on Stellar {config.network} · factory <span className="font-mono">{shortAddress(config.factoryContractId, 4)}</span>
            </a>
          ) : (
            <Eyebrow dark>Escrow on Stellar</Eyebrow>
          )}
          <h1 className="mt-6 font-display text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">
            Trade with strangers.
            <br />
            <span className="text-white/60">Nobody gets paid on </span>
            <em className="text-brand-300">their own word.</em>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            TrustEscrow holds the buyer’s money in a Soroban smart contract made for that one trade. The seller is paid only when both sides have spoken — and if
            they disagree, an arbitrator decides. No deadline ever pays the seller.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/dashboard" className="rounded-full bg-brand-400 px-6 py-3 text-sm font-semibold text-night hover:bg-brand-300">
              Try it on testnet
            </Link>
            <a href={ARCHITECTURE} target="_blank" rel="noreferrer" className="rounded-full px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/5">
              Read the architecture
            </a>
          </div>
          <p className="mt-8 text-xs text-white/40">Open source · Non-custodial · Built on Stellar with Soroban</p>
        </div>
        <ProductMock />
      </Container>
    </header>
  );
}

/* ---------------------------------------------------------------- facts */

const FACTS = [
  { value: '1', unit: 'contract per trade', note: 'Funds never pool in a company account.' },
  { value: '0', unit: 'deadlines that pay the seller', note: 'Silence escalates; it never releases.' },
  { value: '80-bit', unit: 'delivery codes', note: 'The buyer’s code is the release key.' },
  { value: '1.5%', unit: 'fee on testnet', note: 'Taken only on release. Refunds are whole.' },
];

function Facts() {
  return (
    <section className="border-b border-line bg-white">
      <Container className="grid grid-cols-2 gap-x-6 divide-line lg:grid-cols-4 lg:gap-x-0 lg:divide-x">
        {FACTS.map((f) => (
          <div key={f.unit} className="py-8 lg:px-8 lg:first:pl-0">
            <p className="text-4xl font-semibold tracking-tight">{f.value}</p>
            <p className="mt-1 text-sm font-medium">{f.unit}</p>
            <p className="mt-1 text-sm text-slate-500">{f.note}</p>
          </div>
        ))}
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------- problem */

function Problem() {
  return (
    <section className="py-24">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        <div>
          <Eyebrow>The problem</Eyebrow>
          <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">Online trade between strangers runs on trust nobody has earned.</h2>
        </div>
        <div className="space-y-5 text-[17px] leading-relaxed text-slate-600 lg:pt-10">
          <p>
            Someone has to go first. If the buyer pays first, they’re trusting a stranger to ship. If the seller ships first, they’re trusting a stranger to pay.
            Either way, one side carries all the risk.
          </p>
          <p>
            Escrow services and marketplaces solve this by holding the money themselves — which means trusting <em>them</em> instead: to stay solvent, to not freeze
            your account, and to decide disputes fairly behind closed doors.
          </p>
          <p className="text-ink">
            TrustEscrow moves that trust into code anyone can read. The money sits in a contract that can only pay the buyer or the seller, under rules fixed before
            anyone deposits.
          </p>
        </div>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------- how it works */

const STEPS = [
  {
    n: '01',
    title: 'Agree the terms',
    body: 'Buyer and seller negotiate the item, amount, delivery method and deadlines. The agreed terms are canonicalised and their sha256 is committed on-chain when the escrow is created — neither side can later claim a different deal.',
  },
  {
    n: '02',
    title: 'The buyer deposits',
    body: 'One call deploys a contract for this trade and moves the money into it. Only allowlisted tokens, within set limits, are accepted.',
  },
  {
    n: '03',
    title: 'The seller proves delivery',
    body: 'A tracking number, a file hash or a signed statement is committed on-chain. It cannot be edited afterwards.',
  },
  {
    n: '04',
    title: 'The buyer releases payment',
    body: 'By giving the seller their 16-character delivery code once the goods are in hand, or by confirming in the app. Only then is the seller paid.',
  },
];

const EXCEPTIONS = [
  { when: 'The seller never delivers', then: 'After the delivery deadline, anyone can refund the buyer in full.' },
  { when: 'The buyer goes silent', then: 'After the receipt deadline the trade goes to an arbitrator. It is not released automatically.' },
  { when: 'Either side disputes', then: 'The arbitrator rules release or refund, and a hash of the written ruling is committed on-chain.' },
  { when: 'The arbitrator never rules', then: 'After the arbitration deadline, the buyer is refunded.' },
];

function StateDiagram() {
  const node = (x: number, y: number, label: string, tone: 'plain' | 'good' | 'refund' | 'warn' | 'muted') => {
    const fills = { plain: '#ffffff', good: '#d1fae5', refund: '#ccfbf1', warn: '#fef3c7', muted: '#f1f0eb' } as const;
    const strokes = { plain: '#cfccc0', good: '#10b981', refund: '#14b8a6', warn: '#f59e0b', muted: '#cfccc0' } as const;
    return (
      <g key={label}>
        <rect x={x} y={y} width="150" height="44" rx="11" fill={fills[tone]} stroke={strokes[tone]} />
        <text x={x + 75} y={y + 27} textAnchor="middle" fontSize="15" fontWeight="600" fill="#0d1b16">
          {label}
        </text>
      </g>
    );
  };
  const edge = (d: string, label: string, lx: number, ly: number, anchor: 'start' | 'middle' = 'middle') => (
    <g key={label + d}>
      <path d={d} fill="none" stroke="#8a8676" strokeWidth="1.25" markerEnd="url(#arrow)" />
      <text x={lx} y={ly} textAnchor={anchor} fontSize="12" fill="#6b6758" fontFamily="var(--font-geist-mono), monospace">
        {label}
      </text>
    </g>
  );
  return (
    <div className="overflow-x-auto rounded-2xl bg-white p-6 ring-1 ring-line sm:p-8">
      <svg viewBox="0 -4 980 254" className="w-full min-w-[720px]" role="img" aria-label="Escrow state machine">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="#8a8676" />
          </marker>
        </defs>
        {edge('M170 46 H278', 'fund', 224, 14)}
        {edge('M430 46 H538', 'proof', 484, 14)}
        {edge('M690 46 H798', 'code · confirm', 744, 14)}
        {edge('M95 68 V174', 'cancel', 105, 125, 'start')}
        {edge('M355 68 V174', 'delivery timeout', 365, 125, 'start')}
        {edge('M615 68 V174', 'dispute · escalate', 625, 125, 'start')}
        {edge('M690 198 L860 70', 'ruling', 790, 160, 'start')}
        {edge('M540 198 H432', 'ruling · timeout', 486, 240)}
        {node(20, 24, 'Created', 'plain')}
        {node(280, 24, 'Funded', 'plain')}
        {node(540, 24, 'Delivered', 'plain')}
        {node(800, 24, 'Released', 'good')}
        {node(20, 176, 'Cancelled', 'muted')}
        {node(280, 176, 'Refunded', 'refund')}
        {node(540, 176, 'Disputed', 'warn')}
      </svg>
      <p className="mt-4 text-xs text-slate-500">Every arrow into Released requires the buyer’s code, the buyer’s confirmation, or an arbitrator’s ruling.</p>
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-8 border-t border-line bg-white py-24">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="lg:sticky lg:top-10 lg:self-start">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">Two sides speak before anyone is paid.</h2>
            <p className="mt-5 max-w-sm text-slate-600">
              The seller’s proof alone is never enough, and neither is a buyer’s silence. Release needs evidence from both — or a ruling.
            </p>
          </div>
          <ol className="divide-y divide-line">
            {STEPS.map((s) => (
              <li key={s.n} className="grid grid-cols-[4rem_1fr] gap-4 py-7 first:pt-0">
                <span className="font-display text-4xl leading-none text-brand-600">{s.n}</span>
                <div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-600">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-20 space-y-10">
          <StateDiagram />
          <div>
            <h3 className="text-lg font-semibold">When it doesn’t go to plan</h3>
            <dl className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {EXCEPTIONS.map((e) => (
                <div key={e.when} className="border-l-2 border-brand-200 pl-4">
                  <dt className="font-medium">{e.when}</dt>
                  <dd className="mt-0.5 text-sm text-slate-600">{e.then}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------- comparison */

const ROWS: [string, string, string][] = [
  ['Who holds the money', 'The company, in its own account', 'A contract deployed for this one trade'],
  ['What a deadline does', 'Often auto-releases to the seller', 'Never pays the seller — silence goes to an arbitrator'],
  ['The agreed deal', 'Kept in the platform’s database', 'Its hash is committed on-chain at creation'],
  ['Proof of delivery', 'Whatever the platform records internally', 'Committed on-chain by the seller, immutable'],
  ['Dispute outcome', 'Decided and recorded privately', 'Ruling hash committed on-chain with the decision'],
  ['If the company disappears', 'Funds and records can be stuck', 'Any trade can be finished from a CLI against the contract'],
];

function Comparison() {
  return (
    <section className="py-24">
      <Container>
        <Eyebrow>Compared</Eyebrow>
        <h2 className="mt-4 max-w-3xl font-display text-4xl leading-tight sm:text-5xl">Custodial escrow asks you to trust a company. This asks you to read a contract.</h2>
        <div className="mt-12 overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="w-1/4 px-6 py-4 font-medium text-slate-500" />
                <th className="px-6 py-4 font-medium text-slate-500">Typical custodial escrow</th>
                <th className="bg-brand-50/60 px-6 py-4 font-semibold text-brand-800">
                  <span className="inline-flex items-center gap-2">
                    <LogoMark className="h-5 w-5" /> TrustEscrow
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ROWS.map(([label, them, us]) => (
                <tr key={label}>
                  <th scope="row" className="px-6 py-4 font-medium">
                    {label}
                  </th>
                  <td className="px-6 py-4 text-slate-500">{them}</td>
                  <td className="bg-brand-50/60 px-6 py-4 text-ink">{us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------- security */

const PRACTICES = [
  { title: 'Invariants after every call', body: 'Conservation of funds, terminal states and the two-sided release rule are checked by one shared module, driven by a seeded randomised test and a coverage-guided fuzz target.' },
  { title: 'Mutation-tested', body: 'cargo-mutants rewrites the contract source — flipping >= to > in a deadline check — and confirms the test suite notices.' },
  { title: 'Pinned, reproducible WASM', body: 'The toolchain is pinned, so anyone can rebuild the escrow and check its hash. The app refuses to fund an escrow running any other code.' },
  { title: 'Factory provenance', body: 'Each escrow records its deployment salt, so clients can prove it came from the real factory and not a look-alike with a hostile arbitrator.' },
  { title: 'Codes never stored in plaintext', body: 'Delivery codes are encrypted in the browser under a passkey- or password-derived key. The server has no key, and refuses messages that contain a code.' },
  { title: 'Multisig governance, tested', body: 'The factory admin and each arbitrator are exercised as real multisig accounts in the test suite.' },
];

const CODE = `pub fn release_with_code(env: Env, code: Bytes) {
    let e = load(&env);
    match e.state {
        State::Delivered => {}
        State::Funded => panic_with_error!(&env, Error::ProofRequired),
        _ => panic_with_error!(&env, Error::InvalidState),
    }
    verify_code(&env, &e, &code);
    let zero = zero_hash(&env);
    release(&env, e, ReleasePath::Code, zero);
}`;

const TOKEN = /\b(pub|fn|let|match)\b|\b([A-Z][A-Za-z]*::[A-Za-z]+)\b|\b([a-z_]+!)|\b([a-z_]+)(?=\()/g;

function Highlighted({ code }: { code: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const cls = m[1] ? 'text-brand-300' : m[2] ? 'text-sky-300' : m[3] ? 'text-amber-200' : 'text-white';
    out.push(
      <span key={m.index} className={cls}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  out.push(code.slice(last));
  return <code>{out}</code>;
}

function Security() {
  return (
    <section id="security" className="scroll-mt-8 bg-night py-24 text-white">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <Eyebrow dark>Security</Eyebrow>
            <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">Built to be checked, not just trusted.</h2>
            <p className="mt-5 max-w-lg text-white/65">
              The contracts are unaudited and hold testnet value only. The engineering around them is what you’d expect from a project headed for audit.
            </p>
            <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {PRACTICES.map((p) => (
                <div key={p.title}>
                  <h3 className="font-medium text-brand-300">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/60">{p.body}</p>
                </div>
              ))}
            </div>
            <a href={SECURITY} target="_blank" rel="noreferrer" className="mt-10 inline-block text-sm font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
              Read the security policy and invariants →
            </a>
          </div>
          <div className="lg:pt-24">
            <div className="overflow-hidden rounded-2xl bg-night-2 ring-1 ring-white/10">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <span className="font-mono text-xs text-white/50">contracts/escrow/src/lib.rs</span>
                <span className="font-mono text-xs text-brand-300">Rust · Soroban</span>
              </div>
              <pre className="overflow-x-auto p-5 text-[12px] leading-relaxed text-white/70">
                <Highlighted code={CODE} />
              </pre>
            </div>
            <p className="mt-3 text-xs text-white/40">The only way a seller is paid by code: the escrow must already hold the seller’s proof, and the code must hash to what the buyer committed.</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------- architecture */

const REPOS = [
  { name: 'trustedescrow-contract', label: 'Contracts', desc: 'Soroban escrow and factory, the delivery-code reference implementation, fuzz and mutation testing.' },
  { name: 'trustedescrow-backend', label: 'Backend', desc: 'Negotiation, 2FA, the encrypted code vault, notifications and an indexer. Holds no funds and no authority over them.' },
  { name: 'trustedescrow-frontend', label: 'Web app', desc: 'This app: buyer and seller flows, the arbitrator console, and a standalone escrow SDK.' },
  { name: 'trustedescrow-docs', label: 'Docs', desc: 'The full architecture, trust model and threat model shared by all three.' },
];

function Box({ title, sub, items, accent }: { title: string; sub: string; items: string[]; accent?: boolean }) {
  return (
    <div className={cx('rounded-2xl p-5 ring-1', accent ? 'bg-brand-50 ring-brand-200' : 'bg-white ring-line')}>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-slate-500">{sub}</p>
      <ul className="mt-3 space-y-1 font-mono text-xs text-slate-600">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

/** `toward` is the side the arrow points at in the desktop row; on mobile the row stacks vertically. */
function Arrow({ label, toward }: { label: string; toward: 'right' | 'left' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-2 text-center lg:max-w-28 lg:py-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span aria-hidden className="text-slate-400">
        <span className="lg:hidden">{toward === 'right' ? '↓' : '↑'}</span>
        <span className="hidden lg:inline">{toward === 'right' ? '→' : '←'}</span>
      </span>
    </div>
  );
}

function Architecture() {
  return (
    <section id="architecture" className="scroll-mt-8 py-24">
      <Container>
        <Eyebrow>Architecture</Eyebrow>
        <h2 className="mt-4 max-w-2xl font-display text-4xl leading-tight sm:text-5xl">The contract is the product. Everything else is convenience.</h2>
        <p className="mt-5 max-w-2xl text-slate-600">
          The web app signs transactions straight from the user’s wallet. The backend helps people negotiate and keeps them informed, but if it disappeared, every
          trade could still be funded, completed, disputed or timed out from a command line.
        </p>

        <div className="mt-12 grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1.1fr_auto_1fr]">
          <Box title="Web app" sub="Next.js · Freighter wallet" items={['escrow SDK', 'pins the escrow WASM hash', 'checks factory provenance']} />
          <Arrow label="signs transactions directly" toward="right" />
          <Box accent title="Soroban contracts" sub="Stellar network" items={['Factory → one Escrow per trade', 'holds and pays out funds', 'enforces every rule']} />
          <Arrow label="reads state, triggers timeouts" toward="left" />
          <Box title="Backend" sub="API · indexer · notifier · keeper" items={['drafts, chat, 2FA', 'encrypted code vault', 'permissionless timeouts only']} />
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl bg-line ring-1 ring-line sm:grid-cols-2">
          {REPOS.map((r) => (
            <a key={r.name} href={`${GITHUB}/${r.name}`} target="_blank" rel="noreferrer" className="group bg-white p-6 hover:bg-paper">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{r.label}</p>
              <p className="mt-2 inline-flex items-center gap-2 font-mono text-sm font-semibold text-ink">
                <GitHubIcon className="text-slate-400 group-hover:text-ink" />
                {r.name}
              </p>
              <p className="mt-2 text-sm text-slate-600">{r.desc}</p>
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------- cta + footer */

function CallToAction() {
  return (
    <section className="px-5 pb-24 sm:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-night px-8 py-16 text-white sm:px-14">
        <div aria-hidden className="bg-grid absolute inset-0 opacity-60" />
        <div aria-hidden className="absolute -right-24 -bottom-32 h-80 w-80 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">Run a trade on testnet.</h2>
            <p className="mt-3 max-w-lg text-white/65">Connect Freighter on testnet, propose an order to a second account, and take it from deposit to release.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className="rounded-full bg-brand-400 px-6 py-3 text-sm font-semibold text-night hover:bg-brand-300">
              Launch app
            </Link>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold ring-1 ring-white/25 hover:bg-white/5">
              <GitHubIcon /> View source
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const explorer = explorerUrl();
  const cols: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
    {
      title: 'Product',
      links: [
        { label: 'Launch app', href: '/dashboard' },
        { label: 'How it works', href: '#how' },
        { label: 'Security', href: '#security' },
        ...(explorer ? [{ label: 'Factory on Stellar Expert', href: explorer, external: true }] : []),
      ],
    },
    {
      title: 'Developers',
      links: REPOS.map((r) => ({ label: r.label, href: `${GITHUB}/${r.name}`, external: true })),
    },
    {
      title: 'Project',
      links: [
        { label: 'Architecture', href: ARCHITECTURE, external: true },
        { label: 'Security policy', href: SECURITY, external: true },
        { label: 'GitHub', href: GITHUB, external: true },
      ],
    },
  ];
  return (
    <footer className="border-t border-line bg-white">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm text-slate-500">Non-custodial escrow for trade between strangers, on Stellar.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-sm font-semibold">{c.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="hover:text-ink">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="hover:text-ink">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <Container className="flex flex-col gap-2 border-t border-line py-6 text-xs text-slate-500 sm:flex-row sm:justify-between">
        <p>Contracts are unaudited — testnet and demonstration use only.</p>
        <p>Contracts Apache-2.0 · App and backend MIT</p>
      </Container>
    </footer>
  );
}

export function LandingPage() {
  return (
    <>
      <Hero />
      <Facts />
      <Problem />
      <HowItWorks />
      <Comparison />
      <Security />
      <Architecture />
      <CallToAction />
      <Footer />
    </>
  );
}
