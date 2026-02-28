export type DishDietaryFlags = {
  is_vegetarian?: boolean;
  is_gluten_free?: boolean;
  is_dairy_free?: boolean;
  contains_peanut?: boolean;
  dish_category?: string;
};

export function formatDishCategoryLabel(raw?: string): string {
  const value = String(raw || '').trim().toUpperCase();
  if (!value) return '-';
  if (value === 'APPETISER') return 'Appetiser';
  if (value === 'COMPLEMENT') return 'Complement';
  if (value === 'DESSERT') return 'Dessert';
  if (value === 'SIDES') return 'Sides';
  if (value === 'GARNISH') return 'Garnish';
  if (value === 'DRINK') return 'Drink';
  return 'Main';
}

export function getDishDietaryTags(item: DishDietaryFlags): string[] {
  const tags: string[] = [];
  if (item.is_vegetarian) tags.push('Vegetarian');
  if (item.is_gluten_free) tags.push('Gluten Free');
  if (item.is_dairy_free) tags.push('Dairy Free');
  if (item.contains_peanut) tags.push('Contain Peanut');
  return tags;
}

export function formatDishDietaryTags(item: DishDietaryFlags): string {
  const tags = getDishDietaryTags(item);
  return tags.length ? tags.join(' | ') : '-';
}
