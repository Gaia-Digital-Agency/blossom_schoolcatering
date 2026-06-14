import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About — Blossom School Catering & Brian, the AI assistant',
  description:
    'Blossom School Catering is a role-based school meal platform where Brian, an AI assistant on WhatsApp, lets parents register, order, cancel, and check meals just by chatting.',
};

const brianCan: { title: string; desc: string }[] = [
  { title: 'Register', desc: 'New parents sign up and link their family by chatting with Brian — no forms.' },
  { title: 'Order', desc: 'Place lunch, snack, or breakfast orders for any child in the family by message.' },
  { title: 'Cancel & edit', desc: 'Change or cancel an order conversationally, before the kitchen cut-off.' },
  { title: 'Check status', desc: 'Ask "what did I order?" and Brian answers from the live system.' },
];

const capabilities: [string, string, string][] = [
  ['Conversational ordering', 'Parents register, order, cancel, and check meals entirely over WhatsApp', 'Brian (OpenClaw + Vertex Gemini)'],
  ['Family-aware AI', 'Brian resolves every request against a canonical family key — siblings never get mixed up', 'family_id grounding'],
  ['Web ordering', 'A full web app for those who prefer it — cart, quick-reorder, favourites, billing', 'Next.js 14 App Router'],
  ['Kitchen automation', 'Accurate daily order boards by grade, with CSV + PDF export', 'Role-based dashboards'],
  ['Delivery dispatch', 'Per-school assignment, auto-assign, and completion tracking', 'NestJS 11 API'],
  ['Admin oversight', 'Menus, schools, billing review, family repair, and reports behind the AI', 'PostgreSQL 18'],
];

export default function InfoPage() {
  return (
    <main style={{ background: 'radial-gradient(circle at top right, #fff6e5, #f4efe5)', color: '#1a1a1a', minHeight: '100vh' }}>
      {/* Top bar */}
      <header style={{ background: 'rgba(20, 16, 11, 0.92)', borderBottom: '1px solid #715a33' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3" style={{ color: '#f7e4bf', textDecoration: 'none' }}>
            <img src="/assets/logo.svg" alt="Blossom logo" width={32} height={32} />
            <span className="text-base font-semibold tracking-wide">Blossom School Catering</span>
          </Link>
          <Link href="/" style={{ color: '#f3d99f', fontSize: '14px', textDecoration: 'none' }}>← Back to home</Link>
        </div>
      </header>

      {/* Hero — AI front and centre */}
      <section className="mx-auto max-w-5xl px-5 py-14 md:py-20">
        <span className="inline-flex rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em]" style={{ background: '#fff', color: '#8b601f', border: '1px solid #e2d6c2' }}>
          Order by chat — meet Brian, the AI assistant
        </span>
        <h1 className="mt-6 max-w-3xl text-3xl font-bold tracking-tight md:text-5xl" style={{ color: '#25211b' }}>
          School meals you can order just by texting.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8 md:text-lg" style={{ color: '#4f4b46' }}>
          <strong style={{ color: '#1a1a1a' }}>Blossom School Catering</strong> puts an AI assistant —
          <strong style={{ color: '#1a1a1a' }}> Brian</strong> — on WhatsApp. Parents register, order, cancel, and check
          meals just by chatting, and every request flows straight into the same system the kitchen, delivery, and admin
          run on. Prefer a screen? The full web app is here too.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/menu" className="inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold" style={{ border: '1px solid #af7a28', color: '#8b601f', background: '#fff' }}>
            View the menu
          </Link>
        </div>
      </section>

      {/* Gap vs solution */}
      <section className="mx-auto grid max-w-5xl gap-5 px-5 pb-14 lg:grid-cols-2">
        <div className="rounded-2xl p-6" style={{ background: '#fffaf0', border: '1px solid #e2d6c2' }}>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: '#a33' }}>The gap</h2>
          <p className="text-sm leading-7" style={{ color: '#4f4b46' }}>
            Most parents live in WhatsApp, not in apps. Paper slips and group-chat orders get lost, siblings get mixed
            up, and the kitchen never has a reliable headcount.
          </p>
        </div>
        <div className="rounded-2xl p-6" style={{ background: '#fffaf0', border: '1px solid #e2d6c2' }}>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: '#2a6a36' }}>The AI answer</h2>
          <p className="text-sm leading-7" style={{ color: '#4f4b46' }}>
            Brian meets parents where they already are. The AI understands the request, ties it to the right child via a
            canonical family key, and writes a clean order the kitchen and delivery can trust — with admins overseeing
            it all.
          </p>
        </div>
      </section>

      {/* What Brian can do */}
      <section className="mx-auto max-w-5xl px-5 pb-14">
        <h2 className="mb-6 text-2xl font-bold" style={{ color: '#25211b' }}>What Brian can do</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {brianCan.map((b) => (
            <div key={b.title} className="rounded-xl p-5" style={{ background: '#fffaf0', border: '1px solid #e2d6c2' }}>
              <div className="text-sm font-semibold" style={{ color: '#8b601f' }}>{b.title}</div>
              <p className="mt-1 text-xs leading-6" style={{ color: '#4f4b46' }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities table */}
      <section className="mx-auto max-w-5xl px-5 pb-14">
        <h2 className="mb-6 text-2xl font-bold" style={{ color: '#25211b' }}>Capabilities at a glance</h2>
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #e2d6c2' }}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ background: '#f4efe5', color: '#8b601f', borderBottom: '1px solid #e2d6c2' }}>
                <th className="px-4 py-3 font-semibold">Capability</th>
                <th className="px-4 py-3 font-semibold">What it delivers</th>
                <th className="px-4 py-3 font-semibold">Powered by</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((c) => (
                <tr key={c[0]} style={{ borderBottom: '1px solid #efe6d6', background: '#fffdf8' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: '#25211b' }}>{c[0]}</td>
                  <td className="px-4 py-3" style={{ color: '#4f4b46' }}>{c[1]}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#9a8f7c' }}>{c[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stack + CTA */}
      <section style={{ background: '#25211b', color: '#f7e4bf' }} className="py-14">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-6 px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#f3d99f' }}>The AI stack</p>
            <h2 className="mt-3 text-2xl font-bold" style={{ color: '#fff' }}>Brian on WhatsApp · OpenClaw · Vertex Gemini · NestJS · PostgreSQL</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: 'rgba(247,228,191,0.65)' }}>
              Vertex Gemini powers Brian through GDA's OpenClaw gateway, a NestJS API and PostgreSQL hold the orders, and
              a Next.js web app serves every role — so chat and screen stay perfectly in sync.
            </p>
          </div>
          <Link href="/register" className="rounded-lg px-5 py-3 text-sm font-semibold" style={{ background: '#2a6a36', color: '#f3ffe8' }}>
            Create an account
          </Link>
        </div>
      </section>
    </main>
  );
}
