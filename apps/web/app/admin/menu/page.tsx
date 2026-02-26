'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ACCESS_KEY, getApiBase, refreshAccessToken } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type Ingredient = { id: string; name: string; allergen_flag: boolean; is_active: boolean };
type AdminMenuItem = {
  id: string;
  name: string;
  description: string;
  nutrition_facts_text: string;
  calories_kcal?: number | null;
  price: number;
  image_url: string;
  is_available: boolean;
  cutlery_required: boolean;
  packing_requirement?: string | null;
  display_order: number;
  ingredient_ids: string[];
  ingredients: string[];
};

function nextWeekdayIsoDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function AdminMenuPage() {
  const [menuServiceDate, setMenuServiceDate] = useState(nextWeekdayIsoDate());
  const [menuSession, setMenuSession] = useState<'LUNCH' | 'SNACK' | 'BREAKFAST'>('LUNCH');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [menuItems, setMenuItems] = useState<AdminMenuItem[]>([]);
  const [editingItemId, setEditingItemId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemNutrition, setItemNutrition] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCaloriesKcal, setItemCaloriesKcal] = useState('');
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemDisplayOrder, setItemDisplayOrder] = useState('1');
  const [itemCutleryRequired, setItemCutleryRequired] = useState(true);
  const [itemPackingRequirement, setItemPackingRequirement] = useState('');
  const [itemIngredientIds, setItemIngredientIds] = useState<string[]>([]);

  const selectedIngredientNames = useMemo(
    () => ingredients.filter((i) => itemIngredientIds.includes(i.id)).map((i) => i.name),
    [ingredients, itemIngredientIds],
  );

  const apiFetch = async (path: string, init?: RequestInit) => {
    let token = localStorage.getItem(ACCESS_KEY);
    if (!token) throw new Error('Please login first.');
    let res = await fetch(`${getApiBase()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) throw new Error('Session expired. Please log in again.');
      token = refreshed;
      res = await fetch(`${getApiBase()}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
      });
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Request failed');
    }
    return res.json();
  };

  const loadMenuData = async () => {
    const [ings, menu] = await Promise.all([
      apiFetch('/admin/ingredients') as Promise<Ingredient[]>,
      apiFetch(`/admin/menus?service_date=${menuServiceDate}&session=${menuSession}`) as Promise<{ items: AdminMenuItem[] }>,
    ]);
    setIngredients(ings);
    setMenuItems(menu.items || []);
  };

  useEffect(() => {
    loadMenuData().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingItemId('');
    setItemName('');
    setItemDescription('');
    setItemNutrition('');
    setItemPrice('');
    setItemCaloriesKcal('');
    setItemImageUrl('');
    setItemAvailable(true);
    setItemDisplayOrder('1');
    setItemCutleryRequired(true);
    setItemPackingRequirement('');
    setItemIngredientIds([]);
  };

  const onImageUpload = async (file?: File | null) => {
    if (!file) return;
    const asDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed reading image file'));
      reader.readAsDataURL(file);
    });
    setItemImageUrl(asDataUrl);
  };

  const onSaveItem = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const payload = {
      serviceDate: menuServiceDate,
      session: menuSession,
      name: itemName,
      description: itemDescription,
      nutritionFactsText: itemNutrition,
      caloriesKcal: itemCaloriesKcal ? Number(itemCaloriesKcal) : null,
      price: Number(itemPrice || 0),
      imageUrl: itemImageUrl,
      ingredientIds: itemIngredientIds,
      isAvailable: itemAvailable,
      displayOrder: Number(itemDisplayOrder || 0),
      cutleryRequired: itemCutleryRequired,
      packingRequirement: itemPackingRequirement,
    };
    if (editingItemId) {
      await apiFetch(`/admin/menu-items/${editingItemId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setMessage('Dish updated.');
    } else {
      await apiFetch('/admin/menu-items', { method: 'POST', body: JSON.stringify(payload) });
      setMessage('Dish created.');
    }
    resetForm();
    await loadMenuData();
  };

  const onSeed = async () => {
    setError('');
    setMessage('');
    await apiFetch('/admin/menus/sample-seed', { method: 'POST', body: JSON.stringify({ serviceDate: menuServiceDate }) });
    setMessage('Sample menus seeded for selected date.');
    await loadMenuData();
  };

  const onEditItem = (item: AdminMenuItem) => {
    setEditingItemId(item.id);
    setItemName(item.name);
    setItemDescription(item.description);
    setItemNutrition(item.nutrition_facts_text);
    setItemPrice(String(item.price));
    setItemCaloriesKcal(item.calories_kcal === null || item.calories_kcal === undefined ? '' : String(item.calories_kcal));
    setItemImageUrl(item.image_url || '');
    setItemAvailable(Boolean(item.is_available));
    setItemDisplayOrder(String(item.display_order ?? 0));
    setItemCutleryRequired(Boolean(item.cutlery_required));
    setItemPackingRequirement(item.packing_requirement || '');
    setItemIngredientIds(item.ingredient_ids || []);
  };

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Admin Menu</h1>
        <AdminNav />
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <label>Service Date<input type="date" value={menuServiceDate} onChange={(e) => setMenuServiceDate(e.target.value)} /></label>
        <label>
          Session
          <select value={menuSession} onChange={(e) => setMenuSession(e.target.value as 'LUNCH' | 'SNACK' | 'BREAKFAST')}>
            <option value="LUNCH">LUNCH</option><option value="SNACK">SNACK</option><option value="BREAKFAST">BREAKFAST</option>
          </select>
        </label>
        <button className="btn btn-outline" type="button" onClick={loadMenuData}>Load Menu Context</button>
        <button className="btn btn-outline" type="button" onClick={onSeed}>Seed Sample Menus</button>

        <form className="auth-form" onSubmit={onSaveItem}>
          <label>Dish Name<input value={itemName} onChange={(e) => setItemName(e.target.value)} required /></label>
          <label>Description<input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} required /></label>
          <label>Nutrition Facts<input value={itemNutrition} onChange={(e) => setItemNutrition(e.target.value)} required /></label>
          <label>Price (IDR)<input type="number" min={0} step={100} value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} required /></label>
          <label>Calories (kcal)<input type="number" min={0} step={1} value={itemCaloriesKcal} onChange={(e) => setItemCaloriesKcal(e.target.value)} placeholder="leave empty for TBA" /></label>
          <label>Display Order<input type="number" min={0} value={itemDisplayOrder} onChange={(e) => setItemDisplayOrder(e.target.value)} required /></label>
          <label>Image URL / Data URL<input value={itemImageUrl} onChange={(e) => setItemImageUrl(e.target.value)} required /></label>
          <label>Upload Image<input type="file" accept="image/*" onChange={(e) => onImageUpload(e.target.files?.[0])} /></label>
          <label>
            Ingredients
            <select multiple value={itemIngredientIds} onChange={(e) => setItemIngredientIds(Array.from(e.target.selectedOptions).map((opt) => opt.value))}>
              {ingredients.map((i) => (<option key={i.id} value={i.id}>{i.name}{i.allergen_flag ? ' (allergen)' : ''}</option>))}
            </select>
          </label>
          <small>Selected: {selectedIngredientNames.join(', ') || '-'}</small>
          <label>Cutlery Required<input type="checkbox" checked={itemCutleryRequired} onChange={(e) => setItemCutleryRequired(e.target.checked)} /></label>
          <label>Packing Requirement<input value={itemPackingRequirement} onChange={(e) => setItemPackingRequirement(e.target.value)} /></label>
          <label>Available<input type="checkbox" checked={itemAvailable} onChange={(e) => setItemAvailable(e.target.checked)} /></label>
          <button className="btn btn-primary" type="submit">{editingItemId ? 'Update Dish' : 'Create Dish'}</button>
          {editingItemId ? <button className="btn btn-outline" type="button" onClick={resetForm}>Cancel Edit</button> : null}
        </form>

        <h2>Menu Items</h2>
        <div className="auth-form">
          {menuItems.map((item) => (
            <label key={item.id}>
              <strong>{item.name}</strong>
              <small>{item.description}</small>
              <small>{item.nutrition_facts_text}</small>
              <small>Calories: {item.calories_kcal ?? 'TBA'}</small>
              <small>Price: Rp {Number(item.price).toLocaleString('id-ID')}</small>
              <small>Ingredients: {item.ingredients.join(', ') || '-'}</small>
              <small>Cutlery: {item.cutlery_required ? 'Required' : 'Not required'}</small>
              <small>Packing: {item.packing_requirement || '-'}</small>
              <button className="btn btn-outline" type="button" onClick={() => onEditItem(item)}>Edit Dish</button>
            </label>
          ))}
          {menuItems.length === 0 ? <p className="auth-help">No menu items. Seed or create.</p> : null}
        </div>
      </section>
    </main>
  );
}
