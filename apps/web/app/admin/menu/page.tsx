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

function inferAllergenFlagFromName(raw: string) {
  const v = raw.toLowerCase();
  return [
    'milk', 'dairy', 'egg', 'peanut', 'almond', 'cashew', 'walnut',
    'prawn', 'shrimp', 'crab', 'fish', 'wheat', 'soy', 'sesame',
  ].some((k) => v.includes(k));
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
    const q = itemName.trim().toLowerCase();
    if (!q) return masterDishes;
    return masterDishes.filter((d) => d.toLowerCase().includes(q));
  }, [itemName]);

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

  const onPickMasterIngredient = async (masterName: string) => {
    let mappedId = ingredientIdByNormalizedName.get(normalize(masterName));
    if (!mappedId) {
      try {
        await apiFetch('/admin/ingredients', {
          method: 'POST',
          body: JSON.stringify({
            name: masterName,
            allergenFlag: inferAllergenFlagFromName(masterName),
          }),
        });
      } catch {
        // Ignore conflict or transient create errors and fallback to reload.
      }
      const refreshed = await apiFetch('/admin/ingredients') as Ingredient[];
      setIngredients(refreshed || []);
      mappedId = (refreshed || []).find((x) => normalize(x.name) === normalize(masterName))?.id;
      if (!mappedId) {
        setError('Failed to auto-create ingredient from master data.');
        return;
      }
      setMessage(`Ingredient auto-created: ${toLabel(masterName)}`);
    }
    setError('');
    const ingredientId = mappedId;
    setItemIngredientIds((prev) => {
      if (prev.includes(ingredientId)) return prev;
      if (prev.length >= ingredientLimit) {
        setError(`Maximum ${ingredientLimit} ingredients per dish.`);
        return prev;
      }
      return [...prev, ingredientId];
    });
  };

  const onAutoCreateDishFromMaster = async (dish: string) => {
    setError('');
    setMessage('');
    const exists = menuItems.find((x) => x.name.trim().toLowerCase() === dish.trim().toLowerCase());
    if (exists) {
      onEditItem(exists);
      setMessage('Dish already exists for selected date/session. Loaded into form.');
      return;
    }
    const payload = {
      serviceDate: menuServiceDate,
      session: menuSession,
      name: dish,
      description: dish,
      nutritionFactsText: 'TBA',
      caloriesKcal: null,
      price: Number(itemPrice || 0),
      imageUrl: itemImageUrl || '/schoolcatering/assets/hero-meal.jpg',
      ingredientIds: itemIngredientIds,
      isAvailable: true,
      displayOrder: Math.max(0, ...menuItems.map((x) => Number(x.display_order || 0))) + 1,
      cutleryRequired: itemCutleryRequired,
      packingRequirement: buildPackingRequirement(itemPackingCareRequired, itemWetDish),
    };
    await apiFetch('/admin/menu-items', { method: 'POST', body: JSON.stringify(payload) });
    setItemName(dish);
    if (!itemDescription.trim()) setItemDescription(dish);
    setMessage(`Dish auto-created: ${dish}`);
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

  const onSetDishActive = async (item: AdminMenuItem, isAvailable: boolean) => {
    setError('');
    setMessage('');
    const previous = menuItems;
    setMenuItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, is_available: isAvailable } : x)));
    try {
      await apiFetch(`/admin/menu-items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable }),
      });
      setMessage(isAvailable ? 'Dish activated.' : 'Dish deactivated.');
      await loadMenuData();
    } catch (e) {
      setMenuItems(previous);
      setError(e instanceof Error ? e.message : 'Failed updating dish availability');
    }
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
            <button className="btn btn-primary" type="submit" form="menu-item-form">{editingItemId ? 'Update Dish' : 'Create Dish'}</button>
            {editingItemId ? <button className="btn btn-outline" type="button" onClick={resetForm}>Cancel Edit</button> : null}
          </div>
        </div>

        <form id="menu-item-form" className="auth-form" onSubmit={onSaveItem}>
          <label>Description<input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} required /></label>
          <label>Price (IDR)<input type="number" min={0} step={100} value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} required /></label>
          <label>Calories (kcal)<input type="number" min={0} step={1} value={itemCaloriesKcal} onChange={(e) => setItemCaloriesKcal(e.target.value)} placeholder="leave empty for TBA" /></label>
          <label>Display Order<input type="number" min={0} value={itemDisplayOrder} onChange={(e) => setItemDisplayOrder(e.target.value)} required /></label>

          <label>Upload Image (WebP auto-convert, upload only)
            <input type="file" accept="image/*" onChange={(e) => onImageUpload(e.target.files?.[0])} />
          </label>

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
          </div>

          <div className="menu-selection-columns">
            <div className="ingredient-selected-box">
              <strong>Ingredient - Selected ({itemIngredientIds.length}/{ingredientLimit})</strong>
              <input
                value={ingredientSearch}
                onChange={(e) => setIngredientSearch(e.target.value)}
                placeholder="Search ingredient..."
              />
              <div className="ingredient-chip-wrap ingredient-list-scroll">
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
              <div className="ingredient-chip-wrap ingredient-list-scroll">
                {filteredMasterIngredients.map((i) => {
                  const mappedId = ingredientIdByNormalizedName.get(normalize(i.key));
                  const active = mappedId ? itemIngredientIds.includes(mappedId) : false;
                  if (active) return null;
                  return (
                    <button
                      key={i.key}
                      type="button"
                      className="btn btn-outline ingredient-chip"
                      onClick={() => void onPickMasterIngredient(i.key)}
                      title={mappedId ? 'Click to add ingredient' : 'Click to auto-create and add ingredient'}
                    >
                      {i.label}
                    </button>
                  );
                })}
                {filteredMasterIngredients.length === 0 ? <small>No ingredients found.</small> : null}
              </div>
            </div>

            <div className="ingredient-selected-box">
              <label>Dish Name<input value={itemName} onChange={(e) => setItemName(e.target.value)} required /></label>
              <strong>Dishes</strong>
              <div className="ingredient-chip-wrap ingredient-list-scroll">
                {filteredMasterDishes.slice(0, 160).map((dish) => (
                  <button
                    key={dish}
                    className="btn btn-outline ingredient-chip"
                    type="button"
                    onClick={() => {
                      setItemName(dish);
                      if (!itemDescription.trim()) setItemDescription(dish);
                    }}
                    onDoubleClick={() => void onAutoCreateDishFromMaster(dish)}
                    title="Click to fill Dish Name. Double-click to auto-create dish item."
                  >
                    {dish}
                  </button>
                ))}
                {filteredMasterDishes.length === 0 ? <small>No dishes found.</small> : null}
              </div>
            </div>
          </div>
        </form>

        <h2>Menu Items</h2>
        <div className="menu-item-columns">
          <div className="menu-list-group">
            <h3 className="menu-list-title">Active Dishes</h3>
            <div className="auth-form menu-list-card menu-list-card-active">
              {activeMenuItems.map((item) => (
                <label key={item.id}>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                  <small>Calories: {item.calories_kcal ?? 'TBA'}</small>
                  <small>Price: Rp {Number(item.price).toLocaleString('id-ID')}</small>
                  <small>Ingredients: {item.ingredients.map(toLabel).join(', ') || '-'}</small>
                  <small>Cutlery: {item.cutlery_required ? 'Required' : 'Not required'}</small>
                  <small>Packing: {item.packing_requirement || '-'}</small>
                  <div className="menu-actions-row">
                    <button className="btn btn-outline" type="button" onClick={() => onEditItem(item)}>Edit Dish</button>
                    <button className="btn btn-outline" type="button" onClick={() => onSetDishActive(item, false)}>Deactivate</button>
                  </div>
                </label>
              ))}
              {activeMenuItems.length === 0 ? <p className="auth-help">No active dishes.</p> : null}
            </div>
          </div>
          <div className="menu-list-group">
            <h3 className="menu-list-title">Non Active Dishes</h3>
            <div className="auth-form menu-list-card menu-list-card-inactive">
              {inactiveMenuItems.map((item) => (
                <label key={item.id}>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                  <small>Calories: {item.calories_kcal ?? 'TBA'}</small>
                  <small>Price: Rp {Number(item.price).toLocaleString('id-ID')}</small>
                  <small>Ingredients: {item.ingredients.map(toLabel).join(', ') || '-'}</small>
                  <small>Cutlery: {item.cutlery_required ? 'Required' : 'Not required'}</small>
                  <small>Packing: {item.packing_requirement || '-'}</small>
                  <div className="menu-actions-row">
                    <button className="btn btn-outline" type="button" onClick={() => onEditItem(item)}>Edit Dish</button>
                    <button className="btn btn-outline" type="button" onClick={() => onSetDishActive(item, true)}>Activate</button>
                  </div>
                </label>
              ))}
              {inactiveMenuItems.length === 0 ? <p className="auth-help">No deactivated dishes.</p> : null}
            </div>
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
        .menu-selection-columns {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.7rem;
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
        .ingredient-selected-box {
          border: 1px solid #ccbda2;
          border-radius: 0.55rem;
          background: #fff;
          padding: 0.6rem;
          display: grid;
          gap: 0.45rem;
        }
        .ingredient-chip-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          align-items: center;
        }
        .ingredient-list-scroll {
          max-height: 11rem;
          overflow: auto;
          padding-right: 0.2rem;
        }
        .menu-item-columns {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        .menu-list-card {
          border: 2px solid #ccbda2;
          border-radius: 0.75rem;
          background: #fffdfa;
          padding-top: 0.4rem;
        }
        .menu-list-card-active {
          border-color: #7a9f67;
          background: #f7fff3;
        }
        .menu-list-card-inactive {
          border-color: #b78d8d;
          background: #fff7f7;
        }
        .menu-list-title {
          text-align: center;
          margin: 0 0 0.35rem 0;
          font-size: 1rem;
          font-weight: 700;
        }
        @media (min-width: 980px) {
          .menu-selection-columns {
            grid-template-columns: 1fr 1fr;
          }
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
