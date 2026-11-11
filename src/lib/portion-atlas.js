import { normalizeReferenceText } from './ciqual.js';

export const PORTION_ATLAS_SOURCE = 'fndds-atlas';

let atlasPromise;
const localizedAtlases = new WeakMap();
const frenchOrder = new Intl.Collator('fr', { sensitivity: 'base' });

export function loadPortionAtlas() {
  atlasPromise ??= Promise.all([
    import('./catalogues/fndds-atlas.json', { with: { type: 'json' } }),
    import('./catalogues/fndds-atlas-fr.json', { with: { type: 'json' } }),
  ]).then(([{ default: data }, { default: translations }]) => {
    const foods = data.foods.map(([id, name, category, values, portionMeasures, aliases]) => ({
      name,
      category: data.categories[category],
      searchName: normalizeReferenceText(name),
      searchAliases: aliases,
      portion: 100,
      unit: 'g',
      nutrition_basis: 'g',
      nutrition: Object.fromEntries(data.nutrients.flatMap((key, index) =>
        values[index] == null ? [] : [[key, values[index]]])),
      source: PORTION_ATLAS_SOURCE,
      source_app: PORTION_ATLAS_SOURCE,
      source_external_id: String(id),
      source_url: `https://fdc.nal.usda.gov/food-details/${id}/nutrients`,
      portionMeasures: portionMeasures.map(row => {
        const labels = row[3];
        const fr = labels?.fr || translations.measures[labels?.en];
        if (!fr || labels?.fr) return row;
        const localized = [...row];
        localized[3] = { ...labels, fr };
        return localized;
      }),
    })).sort((a, b) => a.name.localeCompare(b.name));
    return { foods, categories: [...data.categories].sort(), translations, source: 'USDA FNDDS', license: 'CC0',
      url: 'https://fdc.nal.usda.gov/data-documentation/' };
  }).catch(error => {
    atlasPromise = undefined;
    throw error;
  });
  return atlasPromise;
}

export function localizePortionAtlas(catalogue, locale) {
  if (!catalogue || !/^fr(?:-|$)/i.test(locale || '')) return catalogue;
  const cached = localizedAtlases.get(catalogue);
  if (cached) return cached;
  const { translations } = catalogue;
  const foods = catalogue.foods.map(food => {
    const name = translations.foods[food.source_external_id] || food.name;
    return {
      ...food,
      name,
      category: translations.categories[food.category] || food.category,
      searchName: normalizeReferenceText(name),
      searchAliases: [food.searchName, food.searchAliases].filter(Boolean).join(' '),
    };
  }).sort((a, b) => frenchOrder.compare(a.name, b.name));
  const categories = [...new Set(foods.map(food => food.category))].sort(frenchOrder.compare);
  const localized = { ...catalogue, foods, categories };
  localizedAtlases.set(catalogue, localized);
  return localized;
}

export function isAtlasReference(food) {
  return Boolean(atlasFoodId(food)) && food.id == null;
}

export function atlasFoodId(food) {
  return food?.source_app === PORTION_ATLAS_SOURCE || food?.source === PORTION_ATLAS_SOURCE
    ? food.source_external_id : null;
}

export async function loadAtlasPortionMeasures(id) {
  const catalogue = await loadPortionAtlas();
  return catalogue.foods.find(food => food.source_external_id === String(id))?.portionMeasures;
}
