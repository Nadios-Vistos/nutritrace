import { normalizeReferenceText } from './ciqual.js';

export const PORTION_ATLAS_SOURCE = 'fndds-atlas';

let atlasPromise;

export function loadPortionAtlas() {
  atlasPromise ??= import('./catalogues/fndds-atlas.json').then(({ default: data }) => {
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
      portionMeasures,
    })).sort((a, b) => a.name.localeCompare(b.name));
    return { foods, categories: [...data.categories].sort(), source: 'USDA FNDDS', license: 'CC0',
      url: 'https://fdc.nal.usda.gov/data-documentation/' };
  }).catch(error => {
    atlasPromise = undefined;
    throw error;
  });
  return atlasPromise;
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
