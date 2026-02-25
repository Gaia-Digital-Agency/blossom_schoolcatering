'use client';

import { useEffect, useState } from 'react';

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
          <a className="brand" href="#home">
            <img className="brand-logo" src="/schoolcatering/assets/logo.svg" alt="Blossom School Catering logo" />
            <span>Blossom School Catering</span>
          </a>
          <button className="menu-btn" aria-label="Toggle menu" onClick={() => setOpen(!open)}>
            Menu
          </button>
          <nav className={`nav ${open ? 'open' : ''}`}>
            <a href="#home">Home</a>
            <a href="#parents">Parents</a>
            <a href="#youngsters">Youngsters</a>
            <a href="#admin">Admin</a>
            <a href="#kitchen">Kitchen</a>
            <a href="#delivery">Delivery</a>
          </nav>
        </header>

        <main id="home" className="hero">
          <section className="hero-card">
            <p className="eyebrow">School Catering by Blossom Kitchen</p>
            <h1>Parent and Youngsters Meal Order App</h1>
            <p className="lead">
              One meal per session per youngster, up to 3 sessions daily: Lunch, Snack, Breakfast.
              Clear calorie details for each menu option.
            </p>
            <div className="auth-grid">
              <a className="btn btn-primary" href="#">Log In</a>
              <a className="btn btn-outline" href="#">Register</a>
              <button className="btn btn-google" type="button">Continue with Google</button>
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
