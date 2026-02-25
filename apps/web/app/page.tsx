'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase, setAuthState } from '../lib/auth';

export default function HomePage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 140);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onGoogleContinue = async () => {
    setGoogleError('');
    setGoogleLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/auth/google/dev`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleEmail: 'teameditor@gmail.com', role: 'PARENT' }),
      });
      if (!res.ok) {
        throw new Error('Google login is not available');
      }
      const data = await res.json();
      setAuthState(data.accessToken, data.refreshToken, data.user.role);
      router.push('/dashboard');
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Google login failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <>
      <div className="site-wrap">
        <header className="topbar">
          <Link className="brand" href="/">
            <img className="brand-logo" src="/schoolcatering/assets/logo.svg" alt="Blossom School Catering logo" />
            <span>Blossom School Catering</span>
          </Link>
          <button className="menu-btn" aria-label="Toggle menu" onClick={() => setOpen(!open)}>
            Menu
          </button>
          <nav className={`nav ${open ? 'open' : ''}`}>
            <Link href="/">Home</Link>
            <Link href="/parents">Parents</Link>
            <Link href="/youngsters">Youngsters</Link>
            <Link href="/admin">Admin</Link>
            <Link href="/kitchen">Kitchen</Link>
            <Link href="/delivery">Delivery</Link>
          </nav>
        </header>

        <main className="hero">
          <section className="hero-card">
            <p className="eyebrow">School Catering by Blossom Kitchen</p>
            <h1>Parent and Youngsters Meal Order App</h1>
            <p className="lead">
              One meal per session per youngster, up to 3 sessions daily: Lunch, Snack, Breakfast.
              Clear calorie details for each menu option.
            </p>
            <div className="auth-grid">
              <Link className="btn btn-primary" href="/login">Log In</Link>
              <Link className="btn btn-outline" href="/register">Register</Link>
              <button className="btn btn-google" type="button" onClick={onGoogleContinue} disabled={googleLoading}>
                {googleLoading ? 'Please wait...' : 'Continue with Google'}
              </button>
            </div>
            {googleError ? <p className="auth-error">{googleError}</p> : null}
          </section>
        </main>

        <section className="hero-image-card" aria-label="Healthy Meal For Lovely Souls">
          <img src="/schoolcatering/assets/hero-meal.jpg" alt="Healthy Meal For Lovely Souls" />
          <div className="hero-image-caption">Everyday Nourishing Zesty Options</div>
        </section>

        <section className="chef-message" aria-label="Message from the Chef">
          <h2>Chef Message</h2>
          <p>
            "Every dish is prepared for school-day energy and balanced nutrition.
            We keep every meal fresh, consistent, and safe for all youngsters."
          </p>
        </section>

        <footer className="footer">
          <p>Copyright (C) 2026, Developed by Gaiada.com</p>
          <p>Visitors: <strong>35</strong> | Location: Bali, Indonesia | Time: 20:00 WITA</p>
        </footer>
      </div>

      <button
        className={`back-to-top ${showTop ? 'show' : ''}`}
        type="button"
        aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        Top
      </button>
    </>
  );
}
