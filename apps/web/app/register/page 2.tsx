import Link from 'next/link';

export default function RegisterPage() {
  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Registration</h1>
        <p className="auth-help">Delivery registration is handled by Admin Panel only.</p>
        <div className="dev-links">
          <Link href="/register/youngsters">Register Student (Includes Family)</Link>
          <Link href="/login">Back to Login</Link>
        </div>
      </section>
    </main>
  );
}
