'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import GoogleOAuthButton from './_components/google-oauth-button';

export default function HomePage() {
  const [open, setOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 140);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
            <a className="nav-guide-link" href="https://www.blossomsteakhouse.com/" target="_blank" rel="noopener noreferrer">
              Steakhouse
            </a>
            <Link className="nav-guide-link" href="/guide">Guides &amp; T&amp;C</Link>
          </nav>
        </header>

        <main className="hero">
          <section className="hero-card">
            <p className="eyebrow">School Catering by Blossom Kitchen</p>
            <h1>Meal Order App</h1>
            <p className="lead">
              Lunch Meal For Youngsters, Up To Five Dishes Per Meal, Register or Log In.
              Click Guides button for more details.
            </p>
            <div className="auth-grid">
              <Link className="btn btn-primary" href="/login">Log In</Link>
              <Link className="btn btn-outline" href="/register/youngsters">Register</Link>
              <GoogleOAuthButton role="PARENT" redirectPath="/dashboard" className="google-oauth-wrap" />
            </div>
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
