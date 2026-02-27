'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import ingredientMaster from '../../../../../docs/master_data/ingredient.json';
import dishMaster from '../../../../../docs/master_data/dish.json';
import { apiFetch } from '../../../lib/auth';
import { fileToWebpDataUrl } from '../../../lib/image';
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

type MasterIngredientFile = {
  ingredients: Array<{ name: string; category: string }>;
};

type MasterDishFile = Record<string, string[]>;

function nextWeekdayIsoDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function toLabel(raw: string) {
  return raw
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function normalize(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const PACKING_CARE_FLAG = 'PACKING_CARE_REQUIRED';
const WET_DISH_FLAG = 'WET_DISH';

function parsePackingFlags(raw?: string | null) {
  const tokens = String(raw || '')
    .split(/[;,]/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  return {
    packingCareRequired: tokens.includes(PACKING_CARE_FLAG),
    wetDish: tokens.includes(WET_DISH_FLAG),
  };
}

function buildPackingRequirement(packingCareRequired: boolean, wetDish: boolean) {
  const flags: string[] = [];
  if (packingCareRequired) flags.push(PACKING_CARE_FLAG);
  if (wetDish) flags.push(WET_DISH_FLAG);
  return flags.join('; ');
}

const masterIngredients = ((ingredientMaster as MasterIngredientFile).ingredients || []).map((x) => ({
  key: x.name,
  label: toLabel(x.name),
}));

const masterDishes = Object.values(dishMaster as MasterDishFile)
  .flat()
  .filter(Boolean)
  .filter((name, idx, arr) => arr.findIndex((v) => v.toLowerCase() === name.toLowerCase()) === idx)
  .sort((a, b) => a.localeCompare(b));

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
  const [itemPrice, setItemPrice] = useState('');
  const [itemCaloriesKcal, setItemCaloriesKcal] = useState('');
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemDisplayOrder, setItemDisplayOrder] = useState('1');
  const [itemCutleryRequired, setItemCutleryRequired] = useState(true);
  const [itemPackingCareRequired, setItemPackingCareRequired] = useState(false);
  const [itemWetDish, setItemWetDish] = useState(false);
  const [itemIngredientIds, setItemIngredientIds] = useState<string[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [dishSearch, setDishSearch] = useState('');
  const ingredientLimit = 20;

  const ingredientIdByNormalizedName = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of ingredients) map.set(normalize(i.name), i.id);
    return map;
  }, [ingredients]);

  const selectedIngredientNames = useMemo(
    () => ingredients.filter((i) => itemIngredientIds.includes(i.id)).map((i) => i.name),
    [ingredients, itemIngredientIds],
  );

  const filteredMasterIngredients = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase();
    if (!q) return masterIngredients;
    return masterIngredients.filter((i) => i.label.toLowerCase().includes(q));
  }, [ingredientSearch]);

  const filteredMasterDishes = useMemo(() => {
    const q = dishSearch.trim().toLowerCase();
    if (!q) return masterDishes;
    return masterDishes.filter((d) => d.toLowerCase().includes(q));
  }, [dishSearch]);

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
    setItemPrice('');
    setItemCaloriesKcal('');
    setItemImageUrl('');
    setItemAvailable(true);
    setItemDisplayOrder('1');
    setItemCutleryRequired(true);
    setItemPackingCareRequired(false);
    setItemWetDish(false);
    setItemIngredientIds([]);
    setIngredientSearch('');
    setDishSearch('');
  };

  const onImageUpload = async (file?: File | null) => {
    if (!file) return;
    setError('');
    try {
      const asWebpDataUrl = await fileToWebpDataUrl(file);
      setItemImageUrl(asWebpDataUrl);
      setMessage('Image converted to WebP and attached.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed converting image to WebP');
    }
  };

  const onSaveItem = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (itemIngredientIds.length > ingredientLimit) {
      setError(`Maximum ${ingredientLimit} ingredients per dish.`);
      return;
    }
    if (!itemImageUrl.trim()) {
      setError('Upload image first. Image URL input is disabled (upload only).');
      return;
    }

    const payload = {
      serviceDate: menuServiceDate,
      session: menuSession,
      name: itemName,
      description: itemDescription,
      nutritionFactsText: 'TBA',
      caloriesKcal: itemCaloriesKcal ? Number(itemCaloriesKcal) : null,
      price: Number(itemPrice || 0),
      imageUrl: itemImageUrl,
      ingredientIds: itemIngredientIds,
      isAvailable: itemAvailable,
      displayOrder: Number(itemDisplayOrder || 0),
      cutleryRequired: itemCutleryRequired,
      packingRequirement: buildPackingRequirement(itemPackingCareRequired, itemWetDish),
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

  const onToggleIngredient = (ingredientId: string) => {
    setItemIngredientIds((prev) => {
      if (prev.includes(ingredientId)) return prev.filter((id) => id !== ingredientId);
      if (prev.length >= ingredientLimit) {
        setError(`Maximum ${ingredientLimit} ingredients per dish.`);
        return prev;
      }
      return [...prev, ingredientId];
    });
  };

  const onToggleMasterIngredient = (masterName: string) => {
    const mappedId = ingredientIdByNormalizedName.get(normalize(masterName));
    if (!mappedId) {
      setError('Ingredient exists in master-data/ingredient.json but not in system ingredients yet.');
      return;
    }
    setError('');
    onToggleIngredient(mappedId);
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
    setItemPrice(String(item.price));
    setItemCaloriesKcal(item.calories_kcal === null || item.calories_kcal === undefined ? '' : String(item.calories_kcal));
    setItemImageUrl(item.image_url || '');
    setItemAvailable(Boolean(item.is_available));
    setItemDisplayOrder(String(item.display_order ?? 0));
    setItemCutleryRequired(Boolean(item.cutlery_required));
    const flags = parsePackingFlags(item.packing_requirement || '');
    setItemPackingCareRequired(flags.packingCareRequired);
    setItemWetDish(flags.wetDish);
    setItemIngredientIds(item.ingredient_ids || []);
  };

  const activeMenuItems = useMemo(() => menuItems.filter((x) => x.is_available), [menuItems]);
  const inactiveMenuItems = useMemo(() => menuItems.filter((x) => !x.is_available), [menuItems]);

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Menu</h1>
        <AdminNav />
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="auth-form menu-context-form">
          <label>Service Date<input type="date" value={menuServiceDate} onChange={(e) => setMenuServiceDate(e.target.value)} /></label>
          <label>
            Session
            <select value={menuSession} onChange={(e) => setMenuSession(e.target.value as 'LUNCH' | 'SNACK' | 'BREAKFAST')}>
              <option value="LUNCH">LUNCH</option>
              <option value="SNACK">SNACK</option>
              <option value="BREAKFAST">BREAKFAST</option>
            </select>
          </label>
          <div className="menu-actions-row">
            <button className="btn btn-outline" type="button" onClick={loadMenuData}>Load Menu Context</button>
            <button className="btn btn-outline" type="button" onClick={onSeed}>Seed Sample Menus</button>
          </div>
        </div>

        <form className="auth-form" onSubmit={onSaveItem}>
          <label>Dish Name<input value={itemName} onChange={(e) => setItemName(e.target.value)} required /></label>
          <label>Description<input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} required /></label>
          <label>Price (IDR)<input type="number" min={0} step={100} value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} required /></label>
          <label>Calories (kcal)<input type="number" min={0} step={1} value={itemCaloriesKcal} onChange={(e) => setItemCaloriesKcal(e.target.value)} placeholder="leave empty for TBA" /></label>
          <label>Display Order<input type="number" min={0} value={itemDisplayOrder} onChange={(e) => setItemDisplayOrder(e.target.value)} required /></label>

          <label>Upload Image (WebP auto-convert, upload only)
            <input type="file" accept="image/*" onChange={(e) => onImageUpload(e.target.files?.[0])} />
          </label>
          <small>Image URL field removed. Create requires uploaded image. Edit keeps existing image unless replaced.</small>

          <div className="ingredient-selected-box">
            <strong>Dishes (from `dish.json`)</strong>
            <input
              value={dishSearch}
              onChange={(e) => setDishSearch(e.target.value)}
              placeholder="Search dishes from master data..."
            />
            <div className="ingredient-chip-wrap">
              {filteredMasterDishes.slice(0, 120).map((dish) => (
                <button
                  key={dish}
                  className="btn btn-outline ingredient-chip"
                  type="button"
                  onClick={() => {
                    setItemName(dish);
                    if (!itemDescription.trim()) setItemDescription(dish);
                  }}
                >
                  {dish}
                </button>
              ))}
              {filteredMasterDishes.length === 0 ? <small>No dishes found.</small> : null}
            </div>
          </div>

          <div className="ingredient-selected-box">
            <strong>Ingredients (from `ingredient.json`) - Selected ({itemIngredientIds.length}/{ingredientLimit})</strong>
            <input
              value={ingredientSearch}
              onChange={(e) => setIngredientSearch(e.target.value)}
              placeholder="Search ingredients from master data..."
            />
            <div className="ingredient-chip-wrap">
              {itemIngredientIds.length === 0 ? <small>-</small> : null}
              {itemIngredientIds.map((id) => {
                const ing = ingredients.find((x) => x.id === id);
                if (!ing) return null;
                return (
                  <button key={id} className="btn btn-outline ingredient-chip" type="button" onClick={() => onToggleIngredient(id)}>
                    {toLabel(ing.name)}{ing.allergen_flag ? ' (allergen)' : ''} x
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ingredient-picker-box">
            {filteredMasterIngredients.map((i) => {
              const mappedId = ingredientIdByNormalizedName.get(normalize(i.key));
              const active = mappedId ? itemIngredientIds.includes(mappedId) : false;
              return (
                <button
                  key={i.key}
                  type="button"
                  className={`btn ${active ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => onToggleMasterIngredient(i.key)}
                  title={mappedId ? 'Add/remove ingredient' : 'Not yet in system ingredient master'}
                >
                  {i.label}{mappedId ? '' : ' (not linked)'}
                </button>
              );
            })}
            {filteredMasterIngredients.length === 0 ? <small>No ingredients found.</small> : null}
          </div>

          <small>Selected: {selectedIngredientNames.map(toLabel).join(', ') || '-'}</small>
          <div className="menu-check-grid">
            <label className="menu-check-row">
              <input type="checkbox" checked={itemCutleryRequired} onChange={(e) => setItemCutleryRequired(e.target.checked)} />
              <span>Cutlery Required</span>
            </label>
            <label className="menu-check-row">
              <input type="checkbox" checked={itemPackingCareRequired} onChange={(e) => setItemPackingCareRequired(e.target.checked)} />
              <span>Packing Care Required</span>
            </label>
            <label className="menu-check-row">
              <input type="checkbox" checked={itemWetDish} onChange={(e) => setItemWetDish(e.target.checked)} />
              <span>Wet Dish</span>
            </label>
            <label className="menu-check-row">
              <input type="checkbox" checked={itemAvailable} onChange={(e) => setItemAvailable(e.target.checked)} />
              <span>Available (Active)</span>
            </label>
          </div>
          <div className="menu-actions-row">
            <button className="btn btn-primary" type="submit">{editingItemId ? 'Update Dish' : 'Create Dish'}</button>
            {editingItemId ? <button className="btn btn-outline" type="button" onClick={resetForm}>Cancel Edit</button> : null}
          </div>
        </form>

        <h2>Menu Items</h2>
        <div className="menu-item-columns">
          <div className="auth-form">
            <h3>Left Active</h3>
            {activeMenuItems.map((item) => (
              <label key={item.id}>
                <strong>{item.name}</strong>
                <small>{item.description}</small>
                <small>Calories: {item.calories_kcal ?? 'TBA'}</small>
                <small>Price: Rp {Number(item.price).toLocaleString('id-ID')}</small>
                <small>Ingredients: {item.ingredients.map(toLabel).join(', ') || '-'}</small>
                <small>Cutlery: {item.cutlery_required ? 'Required' : 'Not required'}</small>
                <small>Packing: {item.packing_requirement || '-'}</small>
                <button className="btn btn-outline" type="button" onClick={() => onEditItem(item)}>Edit Dish</button>
              </label>
            ))}
            {activeMenuItems.length === 0 ? <p className="auth-help">No active dishes.</p> : null}
          </div>
          <div className="auth-form">
            <h3>Right Created But Deactivated</h3>
            {inactiveMenuItems.map((item) => (
              <label key={item.id}>
                <strong>{item.name}</strong>
                <small>{item.description}</small>
                <small>Calories: {item.calories_kcal ?? 'TBA'}</small>
                <small>Price: Rp {Number(item.price).toLocaleString('id-ID')}</small>
                <small>Ingredients: {item.ingredients.map(toLabel).join(', ') || '-'}</small>
                <small>Cutlery: {item.cutlery_required ? 'Required' : 'Not required'}</small>
                <small>Packing: {item.packing_requirement || '-'}</small>
                <button className="btn btn-outline" type="button" onClick={() => onEditItem(item)}>Edit Dish</button>
              </label>
            ))}
            {inactiveMenuItems.length === 0 ? <p className="auth-help">No deactivated dishes.</p> : null}
          </div>
        </div>
      </section>
      <style jsx>{`
        .menu-context-form {
          margin-bottom: 0.8rem;
        }
        .menu-actions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .menu-actions-row :global(.btn) {
          min-width: 170px;
        }
        .menu-check-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.4rem;
          border: 1px solid #ccbda2;
          border-radius: 0.55rem;
          background: #fff;
          padding: 0.55rem 0.6rem;
        }
        .menu-check-row {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin: 0;
          font-size: 0.92rem;
        }
        .menu-check-row input[type='checkbox'] {
          width: 0.95rem;
          height: 0.95rem;
          margin: 0;
          flex: 0 0 auto;
        }
        .menu-item-columns {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.7rem;
        }
        @media (min-width: 980px) {
          .menu-item-columns {
            grid-template-columns: 1fr 1fr;
          }
          .menu-check-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  );
}
