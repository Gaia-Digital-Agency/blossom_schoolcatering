'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import ingredientMaster from '../../../../../docs/master_data/ingredient.json';
import dishMaster from '../../../../../docs/master_data/dish.json';
import { ACCESS_KEY, apiFetch, fetchWithTimeout, getApiBase } from '../../../lib/auth';
import { formatDishCategoryLabel, formatDishDietaryTags } from '../../../lib/dish-tags';
import { fileToWebpDataUrl } from '../../../lib/image';
import AdminNav from '../_components/admin-nav';

type Ingredient = { id: string; name: string; allergen_flag: boolean; is_active: boolean };
type AdminMenuItem = {
  id: string;
  session?: 'LUNCH' | 'SNACK' | 'BREAKFAST';
  name: string;
  dish_category?: string;
  description: string;
  nutrition_facts_text: string;
  calories_kcal?: number | null;
  price: number;
  image_url: string;
  is_available: boolean;
  is_vegetarian?: boolean;
  is_gluten_free?: boolean;
  is_dairy_free?: boolean;
  contains_peanut?: boolean;
  cutlery_required: boolean;
  packing_requirement?: string | null;
  display_order: number;
  ingredient_ids: string[];
  ingredients: string[];
};

type MenuRatingSummary = {
  menu_item_id: string;
  name: string;
  session: 'LUNCH' | 'SNACK' | 'BREAKFAST';
  service_date: string;
  star_1_votes: number;
  star_2_votes: number;
  star_3_votes: number;
  star_4_votes: number;
  star_5_votes: number;
  total_votes: number;
};

type MasterIngredientFile = {
  ingredients: Array<{ name: string; category: string }>;
};

type MasterDishFile = Record<string, string[]>;
const DEFAULT_DISH_IMAGE = '/schoolcatering/assets/hero-meal.jpg';

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
  const [menuRatings, setMenuRatings] = useState<MenuRatingSummary[]>([]);
  const [editingItemId, setEditingItemId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemDishCategory, setItemDishCategory] = useState<'MAIN' | 'APPETISER' | 'COMPLEMENT' | 'DESSERT' | 'SIDES' | 'GARNISH' | 'DRINK'>('MAIN');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCaloriesKcal, setItemCaloriesKcal] = useState('');
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [itemImageFileName, setItemImageFileName] = useState('');
  const [storedImageUrl, setStoredImageUrl] = useState('');
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [imageConverting, setImageConverting] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemDisplayOrder, setItemDisplayOrder] = useState('1');
  const [itemCutleryRequired, setItemCutleryRequired] = useState(true);
  const [itemPackingCareRequired, setItemPackingCareRequired] = useState(false);
  const [itemWetDish, setItemWetDish] = useState(false);
  const [itemIsVegetarian, setItemIsVegetarian] = useState(false);
  const [itemIsGlutenFree, setItemIsGlutenFree] = useState(false);
  const [itemIsDairyFree, setItemIsDairyFree] = useState(false);
  const [itemContainsPeanut, setItemContainsPeanut] = useState(false);
  const [itemIngredientIds, setItemIngredientIds] = useState<string[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [customDishInput, setCustomDishInput] = useState('');
  const [customDishOptions, setCustomDishOptions] = useState<string[]>([]);
  const [customIngredientInput, setCustomIngredientInput] = useState('');
  const [customIngredientOptions, setCustomIngredientOptions] = useState<Array<{ key: string; label: string }>>([]);
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

  const mergedIngredientOptions = useMemo(() => {
    const byNorm = new Map<string, { key: string; label: string }>();
    for (const item of masterIngredients) byNorm.set(normalize(item.key), item);
    for (const item of customIngredientOptions) {
      const norm = normalize(item.key);
      if (!byNorm.has(norm)) byNorm.set(norm, item);
    }
    return Array.from(byNorm.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [customIngredientOptions]);

  const filteredMasterIngredients = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase();
    if (!q) return mergedIngredientOptions;
    return mergedIngredientOptions.filter((i) => i.label.toLowerCase().includes(q));
  }, [ingredientSearch, mergedIngredientOptions]);

  const mergedDishOptions = useMemo(() => {
    const byNorm = new Map<string, string>();
    for (const dish of masterDishes) byNorm.set(normalize(dish), dish);
    for (const dish of customDishOptions) {
      const norm = normalize(dish);
      if (!byNorm.has(norm)) byNorm.set(norm, dish);
    }
    return Array.from(byNorm.values()).sort((a, b) => a.localeCompare(b));
  }, [customDishOptions]);

  const filteredMasterDishes = useMemo(() => {
    const q = itemName.trim().toLowerCase();
    if (!q) return mergedDishOptions;
    return mergedDishOptions.filter((d) => d.toLowerCase().includes(q));
  }, [itemName, mergedDishOptions]);

  const loadMenuData = async () => {
    const [ings, menu, ratings] = await Promise.all([
      apiFetch('/admin/ingredients') as Promise<Ingredient[]>,
      apiFetch(`/admin/menus?service_date=${menuServiceDate}&session=${menuSession}`) as Promise<{ items: AdminMenuItem[] }>,
      apiFetch(`/admin/menu-ratings?service_date=${menuServiceDate}&session=${menuSession}`) as Promise<{ items: MenuRatingSummary[] }>,
    ]);
    setIngredients(ings);
    setMenuItems(menu.items || []);
    setMenuRatings(ratings.items || []);
  };

  const clearUploadSelection = () => {
    setItemImageFileName('');
    setUploadInputKey((k) => k + 1);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  const onLoadMenuContext = async () => {
    setError('');
    setMessage('');
    clearUploadSelection();
    setActionLoading(true);
    try {
      await loadMenuData();
      setMessage('Menu context loaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed loading menu context');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    clearUploadSelection();
    loadMenuData().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuServiceDate, menuSession]);

  const resetForm = () => {
    setEditingItemId('');
    setItemName('');
    setItemDescription('');
    setItemDishCategory('MAIN');
    setItemPrice('');
    setItemCaloriesKcal('');
    setItemImageUrl('');
    setStoredImageUrl('');
    clearUploadSelection();
    setItemAvailable(true);
    setItemDisplayOrder('1');
    setItemCutleryRequired(true);
    setItemPackingCareRequired(false);
    setItemWetDish(false);
    setItemIsVegetarian(false);
    setItemIsGlutenFree(false);
    setItemIsDairyFree(false);
    setItemContainsPeanut(false);
    setItemIngredientIds([]);
    setIngredientSearch('');
  };

  const onImageUpload = async (file?: File | null) => {
    if (!file) return;
    setError('');
    setMessage('');
    setImageConverting(true);
    try {
      // Convert to WebP client-side for consistent format and reduced size
      const asWebpDataUrl = await fileToWebpDataUrl(file);
      setItemImageFileName(file.name || 'image.webp');
      setMessage('Converting and uploading image...');

      // Convert data URL to Blob and upload as multipart (avoids JSON body size limit)
      const blobRes = await fetch(asWebpDataUrl);
      const blob = await blobRes.blob();
      const formData = new FormData();
      formData.append('image', blob, `menu-${Date.now()}.webp`);

      const token = localStorage.getItem(ACCESS_KEY);
      const uploadRes = await fetchWithTimeout(`${getApiBase()}/admin/menu-images/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        credentials: 'include',
        body: formData,
      });
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({})) as { message?: string };
        throw new Error(errBody.message ?? 'Image upload failed');
      }
      const { url } = await uploadRes.json() as { url: string };
      setItemImageUrl(url);
      setMessage(`Image uploaded: ${url.split('/').pop()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed uploading image');
      setItemImageFileName('');
    } finally {
      setImageConverting(false);
    }
  };

  const getImageFileLabel = (imageUrl?: string | null) => {
    const raw = String(imageUrl || '').trim();
    if (!raw) return '-';
    if (raw.startsWith('data:image/')) return 'embedded-image.webp';
    try {
      const pathname = new URL(raw, 'http://localhost').pathname;
      const fileName = pathname.split('/').pop() || raw;
      return decodeURIComponent(fileName);
    } catch {
      const fileName = raw.split('/').pop() || raw;
      return decodeURIComponent(fileName);
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
    if (imageConverting) {
      setError('Image conversion in progress. Wait for conversion to finish before saving.');
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
      dishCategory: itemDishCategory,
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
      isVegetarian: itemIsVegetarian,
      isGlutenFree: itemIsGlutenFree,
      isDairyFree: itemIsDairyFree,
      containsPeanut: itemContainsPeanut,
    };

    setSavingItem(true);
    try {
      if (editingItemId) {
        await apiFetch(`/admin/menu-items/${editingItemId}`, { method: 'PATCH', body: JSON.stringify(payload) }, { skipAutoReload: true });
        setMessage('Dish updated.');
      } else {
        await apiFetch('/admin/menu-items', { method: 'POST', body: JSON.stringify(payload) }, { skipAutoReload: true });
        setMessage('Dish created.');
      }
      resetForm();
      await loadMenuData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed saving dish');
    } finally {
      setSavingItem(false);
    }
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
    setError('');
    setMessage('');
    setActionLoading(true);
    try {
      let mappedId = ingredientIdByNormalizedName.get(normalize(masterName));
      if (!mappedId) {
        try {
          await apiFetch('/admin/ingredients', {
            method: 'POST',
            body: JSON.stringify({
              name: masterName,
            }),
          }, { skipAutoReload: true });
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
      const ingredientId = mappedId;
      setItemIngredientIds((prev) => {
        if (prev.includes(ingredientId)) return prev;
        if (prev.length >= ingredientLimit) {
          setError(`Maximum ${ingredientLimit} ingredients per dish.`);
          return prev;
        }
        return [...prev, ingredientId];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed adding ingredient');
    } finally {
      setActionLoading(false);
    }
  };

  const onAddCustomDishOption = () => {
    const raw = customDishInput.trim();
    if (!raw) return;
    const exists = mergedDishOptions.some((d) => normalize(d) === normalize(raw));
    if (exists) {
      setMessage(`Dish already exists in selection: ${raw}`);
      setCustomDishInput('');
      return;
    }
    setCustomDishOptions((prev) => [...prev, raw]);
    setItemName(raw);
    if (!itemDescription.trim()) setItemDescription(raw);
    setCustomDishInput('');
    setMessage(`Dish added to selection: ${raw}`);
  };

  const onAddCustomIngredientOption = () => {
    const raw = customIngredientInput.trim();
    if (!raw) return;
    const norm = normalize(raw);
    const exists = mergedIngredientOptions.some((i) => normalize(i.key) === norm);
    if (exists) {
      setMessage(`Ingredient already exists in selection: ${toLabel(raw)}`);
      setCustomIngredientInput('');
      return;
    }
    setCustomIngredientOptions((prev) => [...prev, { key: raw, label: toLabel(raw) }]);
    setCustomIngredientInput('');
    setMessage(`Ingredient added to selection: ${toLabel(raw)}`);
  };

  const onAutoCreateDishFromMaster = async (dish: string) => {
    setError('');
    setMessage('');
    setActionLoading(true);
    try {
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
        dishCategory: itemDishCategory,
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
        isVegetarian: itemIsVegetarian,
        isGlutenFree: itemIsGlutenFree,
        isDairyFree: itemIsDairyFree,
        containsPeanut: itemContainsPeanut,
      };
      await apiFetch('/admin/menu-items', { method: 'POST', body: JSON.stringify(payload) }, { skipAutoReload: true });
      setItemName(dish);
      if (!itemDescription.trim()) setItemDescription(dish);
      setMessage(`Dish auto-created: ${dish}`);
      await loadMenuData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed auto-creating dish');
    } finally {
      setActionLoading(false);
    }
  };

  const onSeed = async () => {
    setError('');
    setMessage('');
    setActionLoading(true);
    try {
      await apiFetch('/admin/menus/sample-seed', { method: 'POST', body: JSON.stringify({ serviceDate: menuServiceDate }) }, { skipAutoReload: true });
      setMessage('Sample menus seeded for selected date.');
      await loadMenuData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed seeding sample menus');
    } finally {
      setActionLoading(false);
    }
  };

  const onEditItem = (item: AdminMenuItem) => {
    setEditingItemId(item.id);
    setItemName(item.name);
    const rawCategory = String(item.dish_category || 'MAIN').toUpperCase();
    const normalizedCategory = rawCategory === 'SNACKS' ? 'SIDES' : rawCategory;
    setItemDishCategory((normalizedCategory as 'MAIN' | 'APPETISER' | 'COMPLEMENT' | 'DESSERT' | 'SIDES' | 'GARNISH' | 'DRINK'));
    setItemDescription(item.description);
    setItemPrice(String(item.price));
    setItemCaloriesKcal(item.calories_kcal === null || item.calories_kcal === undefined ? '' : String(item.calories_kcal));
    setItemImageUrl(item.image_url || '');
    setStoredImageUrl(item.image_url || '');
    clearUploadSelection();
    setItemAvailable(Boolean(item.is_available));
    setItemDisplayOrder(String(item.display_order ?? 0));
    setItemCutleryRequired(Boolean(item.cutlery_required));
    const flags = parsePackingFlags(item.packing_requirement || '');
    setItemPackingCareRequired(flags.packingCareRequired);
    setItemWetDish(flags.wetDish);
    setItemIsVegetarian(Boolean(item.is_vegetarian));
    setItemIsGlutenFree(Boolean(item.is_gluten_free));
    setItemIsDairyFree(Boolean(item.is_dairy_free));
    setItemContainsPeanut(Boolean(item.contains_peanut));
    setItemIngredientIds(item.ingredient_ids || []);
  };

  const onSetDishActive = async (item: AdminMenuItem, isAvailable: boolean) => {
    setError('');
    setMessage('');
    setActionLoading(true);
    const previous = menuItems;
    setMenuItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, is_available: isAvailable } : x)));
    try {
      await apiFetch(`/admin/menu-items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable }),
      }, { skipAutoReload: true });
      setMessage(isAvailable ? 'Dish activated.' : 'Dish deactivated.');
      await loadMenuData();
    } catch (e) {
      setMenuItems(previous);
      setError(e instanceof Error ? e.message : 'Failed updating dish availability');
    } finally {
      setActionLoading(false);
    }
  };

  const onDeleteDish = async (item: AdminMenuItem) => {
    const ok = window.confirm(`Delete deactivated dish "${item.name}"? This action cannot be undone.`);
    if (!ok) return;
    setError('');
    setMessage('');
    setActionLoading(true);
    try {
      await apiFetch(`/admin/menu-items/${item.id}`, {
        method: 'DELETE',
      }, { skipAutoReload: true });
      setMessage('Dish deleted.');
      if (editingItemId === item.id) resetForm();
      await loadMenuData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed deleting dish';
      setError(msg);
      window.alert(`Cannot delete "${item.name}": ${msg}`);
    } finally {
      setActionLoading(false);
    }
  };

  const sessionScopedItems = useMemo(
    () => menuItems.filter((x) => !x.session || x.session === menuSession),
    [menuItems, menuSession],
  );
  const hasUploadedImage = (imageUrl?: string | null) => {
    const raw = String(imageUrl || '').trim().toLowerCase();
    if (!raw) return false;
    return !raw.includes(DEFAULT_DISH_IMAGE.toLowerCase());
  };
  const activeMenuItems = useMemo(() => sessionScopedItems.filter((x) => x.is_available), [sessionScopedItems]);
  const inactiveMenuItems = useMemo(() => sessionScopedItems.filter((x) => !x.is_available), [sessionScopedItems]);

  useEffect(() => {
    if (activeMenuItems.length > 0 && activeMenuItems.length < 5) {
      window.alert(`Active dishes are below minimum (current: ${activeMenuItems.length}, required: 5).`);
    }
  }, [activeMenuItems.length]);

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
            <button className="btn btn-outline" type="button" onClick={onLoadMenuContext} disabled={savingItem || actionLoading}>
              {actionLoading ? 'Loading...' : 'Load Menu Context'}
            </button>
            <button className="btn btn-outline" type="button" onClick={onSeed} disabled={savingItem || actionLoading}>Seed Sample Menus</button>
            <button className="btn btn-primary" type="submit" form="menu-item-form" disabled={savingItem || actionLoading || imageConverting}>
              {savingItem ? 'Saving...' : (imageConverting ? 'Converting Image...' : (editingItemId ? 'Update Dish' : 'Create Dish'))}
            </button>
            {editingItemId ? <button className="btn btn-outline" type="button" onClick={resetForm} disabled={savingItem || actionLoading || imageConverting}>Cancel Edit</button> : null}
          </div>
        </div>

        <form id="menu-item-form" className="auth-form" onSubmit={onSaveItem}>
          <label>
            Dish Label
            <select value={itemDishCategory} onChange={(e) => setItemDishCategory(e.target.value as 'MAIN' | 'APPETISER' | 'COMPLEMENT' | 'DESSERT' | 'SIDES' | 'GARNISH' | 'DRINK')} required>
              <option value="MAIN">Main</option>
              <option value="DRINK">Drinks</option>
              <option value="APPETISER">Appetiser</option>
              <option value="GARNISH">Garnish</option>
              <option value="COMPLEMENT">Complement</option>
              <option value="DESSERT">Dessert</option>
              <option value="SIDES">Sides</option>
            </select>
          </label>
          <label>Description<input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} required /></label>
          <label>Price (IDR)<input type="number" min={0} step={100} value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} required /></label>
          <label>Calories (kcal)<input type="number" min={0} step={1} value={itemCaloriesKcal} onChange={(e) => setItemCaloriesKcal(e.target.value)} placeholder="leave empty for TBA" /></label>
          <label>Display Order<input type="number" min={0} value={itemDisplayOrder} onChange={(e) => setItemDisplayOrder(e.target.value)} required /></label>

          <label className="menu-full-row">Upload Image (WebP auto-convert, upload only)
            <input
              ref={uploadInputRef}
              key={uploadInputKey}
              type="file"
              accept="image/*"
              onChange={(e) => onImageUpload(e.target.files?.[0])}
            />
          </label>
          <p className="auth-help menu-full-row">Pending upload file: {imageConverting ? 'Converting...' : (itemImageFileName || '-')}</p>
          {editingItemId && storedImageUrl ? <p className="auth-help menu-full-row">Current stored image: {getImageFileLabel(storedImageUrl)}</p> : null}

          <div className="menu-selection-columns menu-full-row">
            <div className="ingredient-selected-box">
              <label>Dish Name<input value={itemName} onChange={(e) => setItemName(e.target.value)} required /></label>
              <div className="menu-add-row">
                <input
                  value={customDishInput}
                  onChange={(e) => setCustomDishInput(e.target.value)}
                  placeholder="Add new dish to selection"
                />
                <button className="btn btn-outline" type="button" onClick={onAddCustomDishOption}>
                  Add Dish
                </button>
              </div>
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

            <div className="menu-right-stack">
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
                  <input type="checkbox" checked={itemIsVegetarian} onChange={(e) => setItemIsVegetarian(e.target.checked)} />
                  <span>Vegetarian</span>
                </label>
                <label className="menu-check-row">
                  <input type="checkbox" checked={itemIsGlutenFree} onChange={(e) => setItemIsGlutenFree(e.target.checked)} />
                  <span>Gluten Free</span>
                </label>
                <label className="menu-check-row">
                  <input type="checkbox" checked={itemIsDairyFree} onChange={(e) => setItemIsDairyFree(e.target.checked)} />
                  <span>Dairy Free</span>
                </label>
                <label className="menu-check-row">
                  <input type="checkbox" checked={itemContainsPeanut} onChange={(e) => setItemContainsPeanut(e.target.checked)} />
                  <span>Contain Peanut</span>
                </label>
              </div>

              <div className="ingredient-selected-box">
                <strong>Ingredient - Selected ({itemIngredientIds.length}/{ingredientLimit})</strong>
                <input
                  value={ingredientSearch}
                  onChange={(e) => setIngredientSearch(e.target.value)}
                  placeholder="Search ingredient..."
                />
                <div className="menu-add-row">
                  <input
                    value={customIngredientInput}
                    onChange={(e) => setCustomIngredientInput(e.target.value)}
                    placeholder="Add new ingredient to selection"
                  />
                  <button className="btn btn-outline" type="button" onClick={onAddCustomIngredientOption}>
                    Add Ingredient
                  </button>
                </div>
                <div className="ingredient-chip-wrap ingredient-list-scroll">
                  {itemIngredientIds.length === 0 ? <small>-</small> : null}
                  {itemIngredientIds.map((id) => {
                    const ing = ingredients.find((x) => x.id === id);
                    if (!ing) return null;
                    return (
                      <button key={id} className="btn btn-outline ingredient-chip" type="button" onClick={() => onToggleIngredient(id)}>
                        {toLabel(ing.name)} x
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
                        disabled={savingItem || actionLoading}
                        title={mappedId ? 'Click to add ingredient' : 'Click to auto-create and add ingredient'}
                      >
                        {i.label}
                      </button>
                    );
                  })}
                  {filteredMasterIngredients.length === 0 ? <small>No ingredients found.</small> : null}
                </div>
              </div>
            </div>
          </div>
        </form>

        <div className="menu-items-shell">
          <h2>Menu Items ({menuSession})</h2>
          <div className="menu-item-columns">
            <div className="menu-list-group">
              <h3 className="menu-list-title">Active Dishes</h3>
              <div className="auth-form menu-list-card menu-list-card-active">
                {activeMenuItems.map((item) => (
                  <article key={item.id} className="menu-item-card">
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                    <small>Image: {hasUploadedImage(item.image_url) ? 'Uploaded' : 'Default image'}</small>
                    <small>Image File: {getImageFileLabel(item.image_url)}</small>
                    <small>Calories: {item.calories_kcal ?? 'TBA'}</small>
                    <small>Price: Rp {Number(item.price).toLocaleString('id-ID')}</small>
                    <small>Category: {formatDishCategoryLabel(item.dish_category)}</small>
                    <small>Dietary: {formatDishDietaryTags(item)}</small>
                    <small>Ingredients: {item.ingredients.map(toLabel).join(', ') || '-'}</small>
                    <small>Cutlery: {item.cutlery_required ? 'Required' : 'Not required'}</small>
                    <small>Packing: {item.packing_requirement || '-'}</small>
                    <div className="menu-actions-row">
                      <button className="btn btn-outline" type="button" onClick={() => onEditItem(item)} disabled={savingItem || actionLoading}>Edit Dish</button>
                      <button className="btn btn-outline" type="button" onClick={() => onSetDishActive(item, false)} disabled={savingItem || actionLoading}>Deactivate</button>
                    </div>
                  </article>
                ))}
                {activeMenuItems.length === 0 ? <p className="auth-help">No active dishes.</p> : null}
              </div>
            </div>
            <div className="menu-list-group">
              <h3 className="menu-list-title">Non Active Dishes</h3>
              <div className="auth-form menu-list-card menu-list-card-inactive">
                {inactiveMenuItems.map((item) => (
                  <article key={item.id} className="menu-item-card">
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                    <small>Image: {hasUploadedImage(item.image_url) ? 'Uploaded' : 'Default image'}</small>
                    <small>Image File: {getImageFileLabel(item.image_url)}</small>
                    <small>Calories: {item.calories_kcal ?? 'TBA'}</small>
                    <small>Price: Rp {Number(item.price).toLocaleString('id-ID')}</small>
                    <small>Category: {formatDishCategoryLabel(item.dish_category)}</small>
                    <small>Dietary: {formatDishDietaryTags(item)}</small>
                    <small>Ingredients: {item.ingredients.map(toLabel).join(', ') || '-'}</small>
                    <small>Cutlery: {item.cutlery_required ? 'Required' : 'Not required'}</small>
                    <small>Packing: {item.packing_requirement || '-'}</small>
                    <div className="menu-actions-row">
                      <button className="btn btn-outline" type="button" onClick={() => onEditItem(item)} disabled={savingItem || actionLoading}>Edit Dish</button>
                      <button className="btn btn-outline" type="button" onClick={() => onSetDishActive(item, true)} disabled={savingItem || actionLoading}>Activate</button>
                      <button className="btn btn-outline" type="button" onClick={() => onDeleteDish(item)} disabled={savingItem || actionLoading}>Delete Dish</button>
                    </div>
                  </article>
                ))}
                {inactiveMenuItems.length === 0 ? <p className="auth-help">No deactivated dishes.</p> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="menu-ratings-shell">
          <h2>Menu Ratings</h2>
          <div className="auth-form menu-list-card">
            {menuRatings.map((rating) => (
              <article key={rating.menu_item_id} className="menu-item-card">
                <strong>{rating.name}</strong>
                <small>1 Star &gt; {rating.star_1_votes} Votes</small>
                <small>2 Stars &gt; {rating.star_2_votes} Votes</small>
                <small>3 Stars &gt; {rating.star_3_votes} Votes</small>
                <small>4 Stars &gt; {rating.star_4_votes} Votes</small>
                <small>5 Stars &gt; {rating.star_5_votes} Votes</small>
                <small>Total Votes: {rating.total_votes}</small>
              </article>
            ))}
            {menuRatings.length === 0 ? <p className="auth-help">No dishes found for selected date/session.</p> : null}
          </div>
        </div>
      </section>
      <style jsx>{`
        .menu-item-card {
          display: grid;
          gap: 0.25rem;
          font-size: 0.9rem;
          min-width: 0;
        }
        .menu-item-card small,
        .menu-item-card strong {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
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
        .menu-add-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.45rem;
          align-items: center;
        }
        .menu-add-row input {
          min-width: 0;
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
        .menu-full-row {
          grid-column: 1 / -1;
        }
        .menu-right-stack {
          display: grid;
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
        .menu-items-shell {
          margin-top: 0.9rem;
          border: 1px solid #ccbda2;
          border-radius: 0.75rem;
          background: #fffaf3;
          padding: 0.75rem;
        }
        .menu-items-shell h2 {
          margin: 0 0 0.7rem 0;
        }
        .menu-ratings-shell {
          margin-top: 0.9rem;
          border: 1px solid #ccbda2;
          border-radius: 0.75rem;
          background: #fffaf3;
          padding: 0.75rem;
        }
        .menu-ratings-shell h2 {
          margin: 0 0 0.7rem 0;
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
        }
      `}</style>
    </main>
  );
}
