import Link from 'next/link';

type DevPageProps = {
  title: string;
  description: string;
};

export default function DevPage({ title, description }: DevPageProps) {
  return (
    <main className="page-auth" id="top">
      <section className="auth-panel">
        <h1>{title}</h1>
        <p className="auth-help">{description}</p>
        <div className="dev-links">
          <Link href="/">Home</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/parents">Parents</Link>
          <Link href="/youngsters">Youngsters</Link>
          <Link href="/admin">Admin</Link>
          <Link href="/kitchen">Kitchen</Link>
          <Link href="/delivery">Delivery</Link>
          <Link href="/login">Login</Link>
        </div>
        <a className="btn btn-primary" href="#top">
          Back To Top
        </a>
      </section>
    </main>
  );
}
