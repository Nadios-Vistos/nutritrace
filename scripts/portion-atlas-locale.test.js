import assert from 'node:assert/strict';
import test from 'node:test';
import { searchCiqual } from '../src/lib/ciqual.js';
import { loadAtlasPortionMeasures, loadPortionAtlas, localizePortionAtlas } from '../src/lib/portion-atlas.js';

test('the French Atlas covers every USDA food, category, and displayed measure', async () => {
  const english = await loadPortionAtlas();
  const french = localizePortionAtlas(english, 'fr-FR');
  assert.equal(french.foods.length, english.foods.length);
  assert.equal(Object.keys(english.translations.foods).length, english.foods.length);
  assert.equal(Object.keys(english.translations.categories).length, english.categories.length);
  for (const food of english.foods) {
    assert.ok(english.translations.foods[food.source_external_id]?.trim(), food.name);
    assert.ok(english.translations.categories[food.category]?.trim(), food.category);
    for (const [, , , labels] of food.portionMeasures) {
      if (labels?.en) assert.ok(labels.fr?.trim(), labels.en);
    }
  }
  assert.equal(localizePortionAtlas(english, 'en-GB'), english);
  assert.equal(localizePortionAtlas(english, 'fr'), french);
});

test('French names are searchable with French or original USDA terms and preserve food data', async () => {
  const english = await loadPortionAtlas();
  const french = localizePortionAtlas(english, 'fr');
  const original = english.foods.find(food => food.source_external_id === '2705385');
  assert.equal(original.name, 'Milk, whole');
  const translated = french.foods.find(food => food.source_external_id === original.source_external_id);
  assert.equal(translated.name, 'Lait entier');
  assert.equal(translated.category, 'Lait entier');
  assert.ok(searchCiqual(french, 'lait entier').some(food => food.source_external_id === original.source_external_id));
  assert.ok(searchCiqual(french, 'milk whole').some(food => food.source_external_id === original.source_external_id));
  assert.deepEqual(translated.nutrition, original.nutrition);
  assert.deepEqual(translated.portionMeasures, await loadAtlasPortionMeasures(original.source_external_id));
});
