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
  const n = (name || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (n.includes('breakfast') || n.includes('morning') || n.includes('brunch') || /petit[-\s]+dejeuner/.test(n)) return 'free_breakfast';
  if (n.includes('lunch') || n.includes('noon') || n.includes('midday') || n.includes('dejeuner')) return 'lunch_dining';
  if (n.includes('dinner') || n.includes('supper') || n.includes('evening') || n.includes('diner')) return 'dinner_dining';
  if (n.includes('snack') || n.includes('bite') || n.includes('treat') || n.includes('collation') || n.includes('gouter')) return 'cookie';
  if (n.includes('drink') || n.includes('smoothie') || n.includes('shake')) return 'local_cafe';
  return 'restaurant';
}

export function mealSlotAt(hour) {
  if (hour < 11) return 'free_breakfast';
  if (hour < 15) return 'lunch_dining';
  if (hour < 18) return 'cookie';
  return 'dinner_dining';
}

export function mealIndexForSlot(meals, slot) {
  const index = meals.findIndex(name => mealIcon(name) === slot);
  if (index >= 0) return index;
  if (slot === 'cookie') {
    const lunch = meals.findIndex(name => mealIcon(name) === 'lunch_dining');
    if (lunch >= 0) return lunch;
  }
  // Fall back to the standard ordering when the meal names are custom.
  const standardOrder = ['free_breakfast', 'lunch_dining', 'dinner_dining', 'cookie'];
  return Math.max(0, Math.min(standardOrder.indexOf(slot), meals.length - 1));
}
