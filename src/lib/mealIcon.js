const DEFAULT_MEAL_LABELS = {
  Breakfast: 'family_diary.breakfast',
  Lunch: 'family_diary.lunch',
  Dinner: 'family_diary.dinner',
  Snacks: 'family_diary.snacks',
};

export function mealLabel(name, translate) {
  return Object.hasOwn(DEFAULT_MEAL_LABELS, name) ? translate(DEFAULT_MEAL_LABELS[name]) : name;
}

/** Returns a Material Symbols icon name based on keywords in the meal name */
export function mealIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('breakfast') || n.includes('morning') || n.includes('brunch') || n.includes('petit-déjeuner')) return 'free_breakfast';
  if (n.includes('lunch') || n.includes('noon') || n.includes('midday') || n.includes('déjeuner')) return 'lunch_dining';
  if (n.includes('dinner') || n.includes('supper') || n.includes('evening') || n.includes('dîner')) return 'dinner_dining';
  if (n.includes('snack') || n.includes('bite') || n.includes('treat') || n.includes('collation')) return 'cookie';
  if (n.includes('drink') || n.includes('smoothie') || n.includes('shake')) return 'local_cafe';
  return 'restaurant';
}
