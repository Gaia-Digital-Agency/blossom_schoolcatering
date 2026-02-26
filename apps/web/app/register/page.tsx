import Link from 'next/link';

export default function RegisterPage() {
  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Choose Registration Type</h1>
        <p className="auth-help">Registration is available for Youngsters/Parents (combined) and Delivery.</p>
        <div className="dev-links">
          <Link href="/register/youngsters">Register Youngsters / Parents</Link>
          <Link href="/register/delivery">Register Delivery</Link>
          <Link href="/login">Back to Login</Link>
        </div>
      </section>
    </main>
  );
}
