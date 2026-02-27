import Link from 'next/link';

type GuideItem = {
  title: string;
  key: string;
  content: string;
};

const GUIDE_ITEMS: GuideItem[] = [
  {
    key: 'parents',
    title: 'Parent User Guide',
    content: `# Parent User Guide

- Login: /schoolcatering/parent/login
- Main page: /schoolcatering/parents
- Select youngster first (all key modules are youngster-scoped)
- Menu auto-populated from active admin dishes
- Add dishes into Draft Section, max 5 items per order
- Place order before cutoff (08:00 Asia/Makassar)
- Quick reorder and edit-before-cutoff reopen order into Draft Section
- Consolidated Billing shows pending proof uploads + latest 5 uploaded records
- Upload proof and open receipt from billing row`,
  },
  {
    key: 'youngsters',
    title: 'Youngster User Guide',
    content: `# Youngster User Guide

- Login: /schoolcatering/youngster/login
- Main page: /schoolcatering/youngsters
- Weekly Nutrition + Badge shows:
  - Clean Plate Club Badge
  - Max consecutive order days/weeks
  - Current month orders
  - Nutrition week, total calories, number of orders, number of dishes
- Menu and Cart follows parent flow with auto-populated active dishes
- Max 5 dishes per order
- Use Update Registration Details button when needed`,
  },
  {
    key: 'register',
    title: 'Registration Guide',
    content: `# Registration Guide (Youngster + Parent)

- URL: /schoolcatering/register/youngsters
- Single onboarding flow for youngster + parent link
- Required: youngster profile + parent profile fields
- Parent last name must match youngster last name
- Existing parent email is reused and linked
- School list comes from active admin schools`,
  },
  {
    key: 'delivery',
    title: 'Delivery User Guide',
    content: `# Delivery User Guide

- Login: /schoolcatering/delivery/login
- Main page: /schoolcatering/delivery
- Date filter with Past / Today / Future quick buttons
- Delivery sees only assignments for mapped schools
- Mark Complete / undo updates delivery state on related order and billing`,
  },
  {
    key: 'kitchen',
    title: 'Kitchen User Guide',
    content: `# Kitchen User Guide

- Login: /schoolcatering/kitchen/login
- Pages:
  - /schoolcatering/kitchen/today
  - /schoolcatering/kitchen/yesterday
  - /schoolcatering/kitchen/tomorrow
- Top actions in one row: Yesterday, Today, Tomorrow, Refresh Now
- Today shows Overview, Summary, Allergen Alerts, Orders board
- Yesterday/Tomorrow show Overview + Summary only`,
  },
  {
    key: 'billing',
    title: 'Billing & Payment User Guide',
    content: `# Billing & Payment User Guide

- Parent:
  - View billing in /schoolcatering/parents
  - Upload proof of payment
  - Open receipt after generation
- Admin:
  - Review billing in /schoolcatering/admin/billing
  - Verify/reject proof
  - Generate receipt`,
  },
  {
    key: 'menu',
    title: 'Menu User Guide',
    content: `# Menu User Guide

- Admin menu management: /schoolcatering/admin/menu
- Set date/session context and manage menu items
- Parent/youngster ordering uses active menu automatically
- Blackout and session controls are enforced`,
  },
  {
    key: 'terms',
    title: 'Terms and Conditions',
    content: `# Terms and Conditions

- Applies to all roles using the platform
- Orders follow active session/date/cutoff/blackout rules
- Allergen/nutrition data is guidance and not medical advice
- Billing verification and receipt generation follow admin workflow
- Service is provided as available; operational interruptions may occur`,
  },
  {
    key: 'contact',
    title: 'Contact Us User Guide',
    content: `# Contact Us User Guide

- Restaurant: Blossom Steakhouse Sanur
- Phone: +62 822-4746-2756
- Email: blossomsteakhousebali@gmail.com
- Address: Jl. Danau Tamblingan No. 196, Sanur, Denpasar Selatan, Bali
- Hours: 08:00 - 00:00`,
  },
];

export default async function GuidePage() {
  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>Guides and T&amp;C</h1>
        <p className="auth-help">Tap each section to expand guide content.</p>

        <div className="guide-list">
          {GUIDE_ITEMS.map((guide) => (
            <details key={guide.key}>
              <summary>{guide.title}</summary>
              <pre className="guide-content">{guide.content}</pre>
            </details>
          ))}
        </div>

        <div className="dev-links">
          <Link href="/">Back to Home</Link>
          <Link href="/login">Go to Login</Link>
        </div>
      </section>
    </main>
  );
}
