'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import { getSessionLabel } from '../../../lib/session-theme';
import AdminNav from '../_components/admin-nav';
import AdminReturnButton from '../_components/admin-return-button';

type OrderRow = {
  order_id: string;
  service_date: string;
  session: string;
  status: string;
  delivery_status: string;
  total_price: number;
  school_name: string;
  school_grade?: string;
  registration_grade?: string;
  current_school_grade?: string | null;
  child_name: string;
  account_name: string;
  delivery_name: string;
  billing_status: string;
  dishes: Array<{ item_name: string; quantity: number }>;
};

type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
};

type AdminOrdersResponse = {
  filters: {
    schools: Array<{ id: string; name: string }>;
    deliveryUsers: Array<{ user_id: string; name: string }>;
  };
  outstanding: OrderRow[];
  completed: OrderRow[];
};

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMoney(value: number) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

function displayGrade(row: { school_grade?: string; registration_grade?: string; current_school_grade?: string | null }) {
  return (
    (row.school_grade && row.school_grade.trim()) ||
    (row.current_school_grade && String(row.current_school_grade).trim()) ||
    (row.registration_grade && row.registration_grade.trim()) ||
    '-'
  );
}

export default function AdminOrdersPage() {
  const [date, setDate] = useState(todayIsoLocal());
  const [allDates, setAllDates] = useState(false);
  const [schoolId, setSchoolId] = useState('ALL');
  const [deliveryUserId, setDeliveryUserId] = useState('ALL');
  const [session, setSession] = useState<'ALL' | 'BREAKFAST' | 'SNACK' | 'LUNCH'>('ALL');
  const [data, setData] = useState<AdminOrdersResponse | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderRow | null>(null);
  const [editMenuItems, setEditMenuItems] = useState<MenuItem[]>([]);
  const [editQuantities, setEditQuantities] = useState<Record<string, number>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState('');

  const load = async () => {
    setError('');
    try {
      const query = new URLSearchParams();
      if (!allDates && date) query.set('date', date);
      if (schoolId !== 'ALL') query.set('school_id', schoolId);
      if (deliveryUserId !== 'ALL') query.set('delivery_user_id', deliveryUserId);
      if (session !== 'ALL') query.set('session', session);
      const out = await apiFetch(`/admin/orders${query.toString() ? `?${query.toString()}` : ''}`) as AdminOrdersResponse;
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading orders');
    }
  };

  const onDeleteOrder = async (order: OrderRow) => {
    if (!window.confirm(`Delete order ${order.order_id} for ${order.child_name}? This will remove it from Family, Student, Kitchen, and Delivery views.`)) return;
    setDeletingOrderId(order.order_id);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/orders/${order.order_id}`, { method: 'DELETE' }, { skipAutoReload: true });
      setMessage(`Deleted order ${order.order_id}.`);
      if (selectedOrder?.order_id === order.order_id) {
        setSelectedOrder(null);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed deleting order');
    } finally {
      setDeletingOrderId('');
    }
  };

  const onOpenEditOrder = async (order: OrderRow) => {
    setEditingOrder(order);
    setEditLoading(true);
    setSavingEdit(false);
    setError('');
    setMessage('');
    try {
      const query = new URLSearchParams({
        service_date: order.service_date,
        session: order.session,
      });
      const menuData = await apiFetch(`/menus?${query.toString()}`) as { items?: MenuItem[] };
      const nextMenuItems = menuData.items || [];
      const quantities = (order.dishes || []).reduce<Record<string, number>>((acc, dish) => {
        const match = nextMenuItems.find((item) => item.name === dish.item_name);
        if (match) acc[match.id] = Number(dish.quantity || 0);
        return acc;
      }, {});
      setEditMenuItems(nextMenuItems);
      setEditQuantities(quantities);
    } catch (e) {
      setEditingOrder(null);
      setError(e instanceof Error ? e.message : 'Failed loading order editor');
    } finally {
      setEditLoading(false);
    }
  };

  const onChangeEditQuantity = (menuItemId: string, value: string) => {
    const next = Number(value);
    setEditQuantities((prev) => ({
      ...prev,
      [menuItemId]: Number.isFinite(next) && next > 0 ? Math.floor(next) : 0,
    }));
  };

  const onSaveEditOrder = async () => {
    if (!editingOrder) return;
    const items = Object.entries(editQuantities)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity: Number(quantity) }));
    if (items.length === 0) {
      setError('Select at least one menu item.');
      return;
    }
    if (items.length > 5) {
      setError('Maximum 5 items per order.');
      return;
    }
    setSavingEdit(true);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/orders/${editingOrder.order_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ items }),
      }, { skipAutoReload: true });
      setMessage(`Updated order ${editingOrder.order_id}.`);
      setEditingOrder(null);
      setEditMenuItems([]);
      setEditQuantities({});
      await load();
      if (selectedOrder?.order_id === editingOrder.order_id) {
        const updatedDishes = items.map(({ menuItemId, quantity }) => {
          const menuItem = editMenuItems.find((item) => item.id === menuItemId);
          return {
            item_name: menuItem?.name || menuItemId,
            quantity,
          };
        });
        setSelectedOrder({
          ...selectedOrder,
          dishes: updatedDishes,
          total_price: updatedDishes.reduce((sum, dish) => {
            const menuItem = editMenuItems.find((item) => item.name === dish.item_name);
            return sum + Number(menuItem?.price || 0) * dish.quantity;
          }, 0),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed updating order');
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [allDates, date, schoolId, deliveryUserId, session]);

  const outstandingTotal = useMemo(
    () => (data?.outstanding || []).reduce((sum, row) => sum + Number(row.total_price || 0), 0),
    [data],
  );
  const completedTotal = useMemo(
    () => (data?.completed || []).reduce((sum, row) => sum + Number(row.total_price || 0), 0),
    [data],
  );

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <div className="auth-form">
          <h1>Admin Orders</h1>
          <AdminNav />
        </div>

        <div className="auth-form orders-filter-card">
          <div className="orders-filter-grid">
            <label>
              <span>Service Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={allDates} />
            </label>
            <label>
              <span>Date Scope</span>
              <select value={allDates ? 'ALL' : 'ONE'} onChange={(e) => setAllDates(e.target.value === 'ALL')}>
                <option value="ONE">Specific date</option>
                <option value="ALL">All dates</option>
              </select>
            </label>
            <label>
              <span>School</span>
              <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                <option value="ALL">All schools</option>
                {(data?.filters.schools || []).map((school) => (
                  <option key={school.id} value={school.id}>{school.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Delivery</span>
              <select value={deliveryUserId} onChange={(e) => setDeliveryUserId(e.target.value)}>
                <option value="ALL">All delivery</option>
                {(data?.filters.deliveryUsers || []).map((user) => (
                  <option key={user.user_id} value={user.user_id}>{user.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Session</span>
              <select value={session} onChange={(e) => setSession(e.target.value as 'ALL' | 'BREAKFAST' | 'SNACK' | 'LUNCH')}>
                <option value="ALL">All sessions</option>
                <option value="BREAKFAST">{getSessionLabel('BREAKFAST')}</option>
                <option value="SNACK">{getSessionLabel('SNACK')}</option>
                <option value="LUNCH">{getSessionLabel('LUNCH')}</option>
              </select>
            </label>
            <div className="orders-filter-action">
              <button className="btn btn-outline" type="button" onClick={load}>Apply</button>
            </div>
          </div>
          {message ? <p className="auth-help" style={{ color: '#166534' }}>{message}</p> : null}
          {error ? <p className="auth-help" style={{ color: '#a10036' }}>{error}</p> : null}
        </div>

        <div className="admin-orders-columns">
          <div className="auth-form orders-column">
            <div className="orders-column-head">
              <h2>Outstanding</h2>
              <small>{data?.outstanding.length || 0} orders · {formatMoney(outstandingTotal)}</small>
            </div>
            <div className="orders-list">
              {(data?.outstanding || []).map((row) => (
                <article key={row.order_id} className="orders-card">
                  <strong>{row.child_name}</strong>
                  <small><strong>Grade: {displayGrade(row)}</strong></small>
                  <small>{row.school_name}</small>
                  <small>{row.service_date} · {getSessionLabel(row.session)}</small>
                  <small>Family/Student: {row.account_name}</small>
                  <small>Delivery: {row.delivery_name}</small>
                  <small>Status: {row.status} · {row.delivery_status}</small>
                  <small>Billing: {row.billing_status}</small>
                  <small>{formatMoney(row.total_price)}</small>
                  <small>Dishes: {(row.dishes || []).map((dish) => `${dish.item_name} x${dish.quantity}`).join(', ') || '-'}</small>
                  <div className="orders-card-actions">
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => setSelectedOrder(row)}>Read</button>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => void onOpenEditOrder(row)}>Edit</button>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => onDeleteOrder(row)}
                      disabled={deletingOrderId === row.order_id}
                    >
                      {deletingOrderId === row.order_id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </article>
              ))}
              {data && data.outstanding.length === 0 ? <p className="auth-help">No outstanding orders.</p> : null}
            </div>
          </div>

          <div className="auth-form orders-column">
            <div className="orders-column-head">
              <h2>Completed</h2>
              <small>{data?.completed.length || 0} orders · {formatMoney(completedTotal)}</small>
            </div>
            <div className="orders-list">
              {(data?.completed || []).map((row) => (
                <article key={row.order_id} className="orders-card orders-card-complete">
                  <strong>{row.child_name}</strong>
                  <small><strong>Grade: {displayGrade(row)}</strong></small>
                  <small>{row.school_name}</small>
                  <small>{row.service_date} · {getSessionLabel(row.session)}</small>
                  <small>Family/Student: {row.account_name}</small>
                  <small>Delivery: {row.delivery_name}</small>
                  <small>Status: {row.status} · {row.delivery_status}</small>
                  <small>Billing: {row.billing_status}</small>
                  <small>{formatMoney(row.total_price)}</small>
                  <small>Dishes: {(row.dishes || []).map((dish) => `${dish.item_name} x${dish.quantity}`).join(', ') || '-'}</small>
                  <div className="orders-card-actions">
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => setSelectedOrder(row)}>Read</button>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => onDeleteOrder(row)}
                      disabled={deletingOrderId === row.order_id}
                    >
                      {deletingOrderId === row.order_id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </article>
              ))}
              {data && data.completed.length === 0 ? <p className="auth-help">No completed orders.</p> : null}
            </div>
          </div>
        </div>

        <AdminReturnButton />
      </section>
      {selectedOrder ? (
        <div className="orders-modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="orders-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Order Details</h2>
            <div className="orders-modal-grid">
              <label><strong>Order ID</strong><small>{selectedOrder.order_id}</small></label>
              <label><strong>Student</strong><small>{selectedOrder.child_name}</small></label>
              <label><strong>Grade</strong><small>{displayGrade(selectedOrder)}</small></label>
              <label><strong>School</strong><small>{selectedOrder.school_name}</small></label>
              <label><strong>Date / Session</strong><small>{selectedOrder.service_date} · {getSessionLabel(selectedOrder.session)}</small></label>
              <label><strong>Family / Student Login</strong><small>{selectedOrder.account_name}</small></label>
              <label><strong>Delivery</strong><small>{selectedOrder.delivery_name}</small></label>
              <label><strong>Order Status</strong><small>{selectedOrder.status}</small></label>
              <label><strong>Delivery Status</strong><small>{selectedOrder.delivery_status}</small></label>
              <label><strong>Billing Status</strong><small>{selectedOrder.billing_status}</small></label>
              <label><strong>Total</strong><small>{formatMoney(selectedOrder.total_price)}</small></label>
              <label className="orders-modal-wide">
                <strong>Dishes</strong>
                <small>{(selectedOrder.dishes || []).map((dish) => `${dish.item_name} x${dish.quantity}`).join(', ') || '-'}</small>
              </label>
            </div>
            <div className="orders-modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setSelectedOrder(null)}>Close</button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => void onDeleteOrder(selectedOrder)}
                disabled={deletingOrderId === selectedOrder.order_id}
              >
                {deletingOrderId === selectedOrder.order_id ? 'Deleting...' : 'Delete Order'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {editingOrder ? (
        <div className="orders-modal-overlay" onClick={() => !savingEdit && setEditingOrder(null)}>
          <div className="orders-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Order</h2>
            <div className="orders-modal-grid">
              <label><strong>Student</strong><small>{editingOrder.child_name}</small></label>
              <label><strong>Grade</strong><small>{displayGrade(editingOrder)}</small></label>
              <label><strong>Date / Session</strong><small>{editingOrder.service_date} · {getSessionLabel(editingOrder.session)}</small></label>
              <label className="orders-modal-wide">
                <strong>Menu Items</strong>
                <small>Adjust quantities and save the order.</small>
              </label>
            </div>
            {editLoading ? (
              <p className="auth-help">Loading menu options...</p>
            ) : (
              <div className="orders-edit-list">
                {editMenuItems.map((item) => (
                  <label key={item.id} className="orders-edit-row">
                    <span>
                      <strong>{item.name}</strong>
                      <small>{formatMoney(item.price)}</small>
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editQuantities[item.id] || 0}
                      onChange={(e) => onChangeEditQuantity(item.id, e.target.value)}
                      disabled={savingEdit}
                    />
                  </label>
                ))}
                {editMenuItems.length === 0 ? <p className="auth-help">No menu items available for this date and session.</p> : null}
              </div>
            )}
            <div className="orders-modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setEditingOrder(null)} disabled={savingEdit}>Cancel</button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => void onSaveEditOrder()}
                disabled={editLoading || savingEdit || editMenuItems.length === 0}
              >
                {savingEdit ? 'Saving...' : 'Save Order'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <style jsx>{`
        .orders-filter-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem;
          align-items: end;
        }
        .orders-filter-card {
          margin-bottom: 0.7rem;
        }
        .orders-filter-action {
          display: flex;
          align-items: end;
        }
        .orders-filter-action :global(button) {
          width: 100%;
        }
        .admin-orders-columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 1rem;
        }
        @media (min-width: 980px) {
          .admin-orders-columns {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .orders-column {
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }
        .orders-column-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.75rem;
        }
        .orders-column-head h2 {
          margin: 0;
        }
        .orders-list {
          display: grid;
          gap: 0.75rem;
        }
        .orders-card {
          display: grid;
          gap: 0.18rem;
          padding: 0.8rem;
          border: 1px solid #d9ccb4;
          border-radius: 0.8rem;
          background: #fffaf2;
        }
        .orders-card-complete {
          background: #f2fbf2;
          border-color: #bfd9bf;
        }
        .orders-card strong {
          color: #2f271d;
        }
        .orders-card small {
          color: #645647;
        }
        .orders-card-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: 0.35rem;
        }
        .orders-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          z-index: 1000;
        }
        .orders-modal-card {
          width: min(560px, 100%);
          background: #fff;
          border-radius: 0.95rem;
          padding: 1rem;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
          display: grid;
          gap: 0.85rem;
        }
        .orders-modal-card h2 {
          margin: 0;
        }
        .orders-modal-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.65rem;
        }
        .orders-modal-grid label {
          display: grid;
          gap: 0.15rem;
          padding: 0.65rem 0.75rem;
          border: 1px solid #ddcfb8;
          border-radius: 0.75rem;
          background: #fffaf2;
        }
        .orders-modal-grid small {
          color: #5f5244;
          overflow-wrap: anywhere;
        }
        .orders-modal-wide {
          grid-column: 1 / -1;
        }
        .orders-modal-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
          justify-content: flex-end;
        }
        .orders-edit-list {
          display: grid;
          gap: 0.65rem;
        }
        .orders-edit-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.7rem 0.8rem;
          border: 1px solid #ddcfb8;
          border-radius: 0.75rem;
          background: #fffaf2;
        }
        .orders-edit-row span {
          display: grid;
          gap: 0.15rem;
        }
        .orders-edit-row small {
          color: #5f5244;
        }
        .orders-edit-row input {
          width: 88px;
          padding: 0.45rem 0.55rem;
          border: 1px solid #c9b89e;
          border-radius: 0.55rem;
        }
        @media (max-width: 680px) {
          .orders-modal-grid {
            grid-template-columns: 1fr;
          }
          .orders-edit-row {
            align-items: stretch;
            flex-direction: column;
          }
          .orders-edit-row input {
            width: 100%;
          }
          .orders-card-actions :global(.btn),
          .orders-modal-actions :global(.btn) {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
