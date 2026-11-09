import { BASIC_FOODS } from './catalogues/basics.js';

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

export function normalizeReferenceText(text) {
  return text.toLowerCase().replaceAll('œ', 'oe').replaceAll('æ', 'ae')
    .normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const normalize = normalizeReferenceText;

let cataloguePromise;
let basicsPromise;

function isReadyToDrink(code, name, category) {
  if (category !== 'eaux et autres boissons') return false;
  const label = normalize(name);
  if (/^(eau minerale|eau de source|eau du robinet|eau de coco)\b/.test(label)) return true;
  if (Number(code) >= 18000 && /\b(prete? a boire|infusee?)\b/.test(label)) return true;
  return /^(jus |nectar |smoothie |cola |limonade |boisson au the )/.test(label)
    && !/\b(a diluer|en poudre|concentre non dilue)\b/.test(label);
}

export function loadCiqual() {
  cataloguePromise ??= import('./catalogues/ciqual-2025.json').then(({ default: data }) => {
    const foods = data.foods.map(([code, name, category, ...values]) => ({
      name,
      category,
      searchName: normalize(name),
      portion: 100,
      unit: 'g',
      nutrition_basis: 'g',
      nutrition: {
        ...Object.fromEntries(data.nutrients.flatMap((key, index) =>
          values[index] == null ? [] : [[key, values[index]]])),
        // The source is per 100 g. For ready-to-drink entries we use the
        // same 1 g/ml approximation as NutriTrace's portion scaler.
        ...(isReadyToDrink(code, name, category) && { beverage_ml: 100 }),
      },
      source: 'ciqual',
      source_app: 'ciqual',
      source_external_id: code,
      source_url: data.url,
    }));
    foods.sort((a, b) => collator.compare(a.name, b.name));
    const categories = [...new Set(foods.map(food => food.category).filter(Boolean))].sort(collator.compare);
    return { foods, categories, url: data.url, source: data.source, license: data.license };
  }).catch(error => {
    cataloguePromise = undefined;
    throw error;
  });
  return cataloguePromise;
}

export function loadBasics() {
  basicsPromise ??= loadCiqual().then(catalogue => {
    const byCode = new Map(catalogue.foods.map(food => [food.source_external_id, food]));
    const foods = BASIC_FOODS.flatMap(([code, name]) => {
      const food = byCode.get(code);
      return food?.nutrition.calories == null ? [] : [{
        ...food, name, searchName: normalize(name), searchAliases: food.searchName,
      }];
    }).sort((a, b) => collator.compare(a.name, b.name));
    const categories = [...new Set(foods.map(food => food.category))].sort(collator.compare);
    return { ...catalogue, foods, categories };
  }).catch(error => {
    basicsPromise = undefined;
    throw error;
  });
  return basicsPromise;
}

export function searchCiqual(catalogue, query, category = '') {
  const foods = catalogue?.foods ?? [];
  const candidates = category ? foods.filter(food => food.category === category) : foods;
  const term = normalize(query);
  if (!term) return candidates;

  const words = term.split(' ');
  const prefix = [];
  const other = [];
  for (const food of candidates) {
    if (food.searchName.startsWith(term)) prefix.push(food);
    else if (food.source_external_id === term ||
        words.every(word => food.searchName.includes(word) || food.searchAliases?.includes(word))) other.push(food);
  }
  return [...prefix, ...other];
}
