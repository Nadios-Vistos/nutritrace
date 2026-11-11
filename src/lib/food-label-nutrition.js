import { parseDecimal } from './decimal-input.js';
import { scaleFactor } from './units.js';

// Catalogue and diary values are stored per serving. The editor can show a
// different amount, such as the 100 g column printed on the package.
export function labelServingFactor(food, reference = food.labelReference) {
  const portion = parseDecimal(food.portion);
  if (!Number.isFinite(portion) || portion <= 0) return null;
  if (reference !== 'g' && reference !== 'ml') return 1;
  const factor = scaleFactor(100, reference, portion, food.unit || 'g',
    { ...food, nutrition_basis: reference }, { allowApproximate: false });
  return Number.isFinite(factor) && factor > 0 ? factor : null;
}

function scaledNutrients(food, nutrientIds, factor) {
  const nutrients = {};
  for (const id of nutrientIds) {
    const value = parseDecimal(food[id]);
    if (Number.isFinite(value)) nutrients[id] = factor === 1 ? value : Number((value * factor).toPrecision(15));
  }
  return nutrients;
}

export function changeLabelReference(food, reference, nutrientIds) {
  const before = labelServingFactor(food);
  const after = labelServingFactor(food, reference);
  const nutrients = before && after ? scaledNutrients(food, nutrientIds, before / after) : {};
  return { ...food, ...nutrients, labelReference: reference };
}

// OFF's editor helpers expect the amount that corresponds to the flat fields.
export function labelInputFood(food) {
  return food.labelReference === 'g' || food.labelReference === 'ml'
    ? { ...food, portion: 100, unit: food.labelReference }
    : food;
}

export function foodForServing(food, nutrientIds) {
  const factor = labelServingFactor(food);
  if (factor == null) return null;
  const { labelReference, ...item } = food;
  const nutrition = scaledNutrients(food, nutrientIds, factor);
  if (food.beverage_ml != null) nutrition.beverage_ml = Number(String(food.beverage_ml).trim().replace(',', '.'));
  const derived = Object.fromEntries(Object.entries(food._derived || {}).filter(([, value]) => value));
  if (Object.keys(derived).length) nutrition._derived = derived;
  return {
    ...item,
    ...nutrition,
    portion: parseDecimal(food.portion),
    nutrition_basis: labelReference === 'g' || labelReference === 'ml' ? labelReference : food.nutrition_basis,
    nutrition,
  };
}
