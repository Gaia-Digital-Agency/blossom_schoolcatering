'use client';

import { FormEvent, useState } from 'react';
import { apiFetch } from '../../../lib/auth';

type QuickOrderResult = {
  ok: boolean;
  orderId: string;
  orderNumber: string;
  childId: string;
  serviceDate: string;
  session: string;
  items: string[];
  totalPrice: number;
};

export default function QuickOrderPage() {
  const [childUsername, setChildUsername] = useState('');
  const [date, setDate] = useState('');
  const [session, setSession] = useState('LUNCH');
  const [dishes, setDishes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuickOrderResult | null>(null);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

    const dishList = dishes
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean);

    if (dishList.length === 0) {
      setError('Enter at least one dish.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch('/api/v1/order/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childUsername,
          date,
          session,
          dishes: dishList,
        }),
      }) as QuickOrderResult;
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Order failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '48px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginBottom: 4 }}>Quick Order</h2>
      <p style={{ marginBottom: 24, color: '#666', fontSize: 14 }}>
        Place a single order by name — no UUIDs needed.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={labelStyle}>
          Child username
          <input
            value={childUsername}
            onChange={(e) => setChildUsername(e.target.value)}
            placeholder="e.g. family_studentname"
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Date (YYYY-MM-DD)
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            placeholder="2026-03-27"
            pattern="\d{4}-\d{2}-\d{2}"
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Session
          <select value={session} onChange={(e) => setSession(e.target.value)} style={inputStyle}>
            <option value="LUNCH">Lunch</option>
            <option value="BREAKFAST">Breakfast</option>
            <option value="SNACK">Snack</option>
          </select>
        </label>

        <label style={labelStyle}>
          Dishes (one per line, max 5)
          <textarea
            value={dishes}
            onChange={(e) => setDishes(e.target.value)}
            placeholder={'Beef Rice Bowl\nBeetroot & Hazelnut Salad\nBuffalo Chicken'}
            rows={5}
            required
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Placing order…' : 'Place Order'}
        </button>
      </form>

      {error && (
        <div style={{ marginTop: 20, padding: 14, background: '#fff0f0', border: '1px solid #f5a0a0', borderRadius: 6, color: '#b00', fontSize: 14 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 20, padding: 14, background: '#f0fff4', border: '1px solid #86efac', borderRadius: 6, fontSize: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Order placed ✓</div>
          <div><b>Order number:</b> {result.orderNumber}</div>
          <div><b>Date:</b> {result.serviceDate} · {result.session}</div>
          <div><b>Items:</b> {result.items.join(', ')}</div>
          <div><b>Total:</b> RM {Number(result.totalPrice).toFixed(2)}</div>
        </div>
      )}

      <div style={{ marginTop: 40, padding: 14, background: '#f8f8f8', borderRadius: 6, fontSize: 13, color: '#555' }}>
        <b>API equivalent (for Casey):</b>
        <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 12 }}>{`POST /api/v1/order/quick
Authorization: Bearer <token>
Content-Type: application/json

{
  "childUsername": "family_studentname",
  "date": "2026-03-27",
  "session": "LUNCH",
  "dishes": [
    "Beef Rice Bowl",
    "Beetroot & Hazelnut Salad",
    "Buffalo Chicken",
    "Cheesy Beans",
    "Chicken & Cheese Macaroni"
  ]
}`}</pre>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  fontSize: 14,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 5,
  border: '1px solid #ccc',
  fontSize: 14,
  fontFamily: 'inherit',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};
