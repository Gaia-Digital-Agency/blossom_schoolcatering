'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import GoogleOAuthButton from './_components/google-oauth-button';

export default function HomePage() {
  const [open, setOpen] = useState(false);
  const [visitCount, setVisitCount] = useState<number>(0);
  const [localTime, setLocalTime] = useState<string>('--:--');
  const [localToday, setLocalToday] = useState<string>('-');
  const [localTz, setLocalTz] = useState<string>('-');
  const [localTzAbbr, setLocalTzAbbr] = useState<string>('');
  const [chefMessage, setChefMessage] = useState<string>(
    'Every dish is prepared for school-day energy and balanced nutrition. We keep every meal fresh, consistent, and safe for all youngsters.'
  );

  useEffect(() => {
    fetch('/schoolcatering/api/v1/public/site-settings', { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((json: { chef_message?: string } | null) => {
        if (json?.chef_message) setChefMessage(json.chef_message);
      })
      .catch(() => { /* keep default */ });
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/schoolcatering/api/v1/public/page-visits/hit', {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('failed');
        const json = await res.json() as { count?: number };
        if (alive) setVisitCount(Number(json.count || 0));
      })
      .catch(() => {
        // Keep UI stable even if visit endpoint is temporarily unavailable.
        if (alive) setVisitCount(0);
      });

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setLocalTz(tz);

    const getTzAbbr = () => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
      return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    };
    const formatTime = () => new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz,
    }).format(new Date());
    const formatToday = () => new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: tz,
    }).format(new Date());

    setLocalTime(formatTime());
    setLocalToday(formatToday());
    setLocalTzAbbr(getTzAbbr());

    const timer = window.setInterval(() => setLocalTime(formatTime()), 1000);
    const dateTimer = window.setInterval(() => { setLocalToday(formatToday()); setLocalTzAbbr(getTzAbbr()); }, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.clearInterval(dateTimer);
    };
  }, []);

  return (
    <>
      <div className="site-wrap">
        <header className="topbar">
          <Link className="brand" href="/">
            <img className="brand-logo" src="/schoolcatering/assets/logo.svg" alt="Bali Catering logo" />
            <span>Bali Catering</span>
          </Link>
          <button className="menu-btn" aria-label="Toggle menu" onClick={() => setOpen(!open)}>
            Menu
          </button>
          <nav className={`nav ${open ? 'open' : ''}`}>
            <Link className="nav-guide-link" href="/menu">Menu</Link>
            <a className="nav-guide-link" href="https://www.blossomsteakhouse.com/" target="_blank" rel="noopener noreferrer">
              Steakhouse
            </a>
            <Link className="nav-guide-link" href="/guide">Guides &amp; T&amp;C</Link>
            <a className="nav-guide-link" href="https://gaiada.com" target="_blank" rel="noopener noreferrer">App Inquiry</a>
          </nav>
        </header>

        <main className="hero">
          <section className="hero-card">
            <h1>Meal Order App</h1>
            <p className="eyebrow">School Catering by Blossom Kitchen</p>
            <p className="lead">
              Lunch Meal For Youngsters, Up To Five Dishes Per Meal, Register or Log In.
              Click the Menu button for more details.
            </p>
            <div className="auth-grid">
              <Link className="btn btn-primary" href="/login">Log In</Link>
              <Link className="btn btn-outline" href="/register">Register</Link>
              <GoogleOAuthButton role="PARENT" redirectPath="/dashboard" className="google-oauth-wrap" />
            </div>
          </section>
        </main>

        <section className="hero-image-card" aria-label="Healthy Meal For Lovely Souls">
          <img src="/schoolcatering/assets/hero-meal.jpg" alt="Healthy Meal For Lovely Souls" />
          <div className="hero-image-caption">Everyday Nourishing Zesty Originals</div>
        </section>

        <section className="chef-message" aria-label="Message from the Chef">
          <h2>Chef Message</h2>
          <p>"{chefMessage}"</p>
        </section>

        <footer className="footer">
          <p>Copyright (C) 2026, Developed by Gaiada.com</p>
          <p>Today: {localToday}</p>
          <p>Visitors: <strong>{visitCount}</strong> | Timezone: {localTz} | Time: {localTime} {localTzAbbr}</p>
        </footer>
      </div>
    </>
  );
}
