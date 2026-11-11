import assert from 'node:assert/strict';
import test from 'node:test';
import { changeLabelReference, foodForServing, labelInputFood, labelServingFactor } from '../src/lib/food-label-nutrition.js';
import { Nutrition } from '../src/lib/nutrition.js';
import { applyScannedFoodLabel } from '../src/lib/food-label-photo.js';
import { applyOffRefresh } from '../src/lib/off-refresh.js';
import { scaleFactor } from '../src/lib/units.js';

const nutrientIds = ['calories', 'fat', 'sodium', 'salt', 'custom'];

test('100 g label values are saved for the actual serving and logged once', () => {
  const form = {
    labelReference: 'g', portion: '30,5', unit: 'g', calories: '450',
    fat: '20', salt: '0,8', sodium: '320', custom: '0',
    _derived: { sodium: true, salt: false },
  };
  const item = foodForServing(form, nutrientIds);
  assert.equal(item.portion, 30.5);
  assert.equal(item.nutrition_basis, 'g');
  assert.equal(Object.hasOwn(item, 'labelReference'), false);
  assert.deepEqual(item.nutrition, {
    calories: 137.25, fat: 6.1, salt: 0.244, sodium: 97.6, custom: 0, _derived: { sodium: true },
  });
  assert.equal(Nutrition.calculate(item).calories, 137.25);
  assert.equal(Nutrition.calculate({ ...item, quantity: 2 }).calories, 274.5);
  assert.equal(form.calories, '450');
});

test('100 ml values scale independently of the hydration for a serving', () => {
  const item = foodForServing({
    labelReference: 'ml', portion: '0,25', unit: 'l', calories: '40', beverage_ml: '240',
  }, nutrientIds);
  assert.deepEqual(item.nutrition, { calories: 100, beverage_ml: 240 });
  assert.equal(item.nutrition_basis, 'ml');
  assert.equal(Nutrition.calculate(item).calories, 100);
});

test('switching the label column or reopening stored nutrition preserves the serving total', () => {
  const serving = { labelReference: 'portion', portion: 30, unit: 'g', calories: 135, fat: '', nutrition_basis: 'g' };
  const reference = changeLabelReference(serving, 'g', nutrientIds);
  assert.equal(reference.calories, 450);
  assert.equal(reference.fat, '');
  assert.equal(foodForServing(reference, nutrientIds).nutrition.calories, 135);
  assert.equal(changeLabelReference(reference, 'portion', nutrientIds).calories, 135);
  assert.equal(foodForServing({ ...reference, portion: 60 }, nutrientIds).nutrition.calories, 270);
});

test('count units and cross-system labels need a known conversion', () => {
  const slice = { labelReference: 'g', portion: 1, unit: 'slice', calories: 300 };
  assert.equal(foodForServing(slice, nutrientIds), null);
  assert.equal(labelServingFactor({ ...slice, alt_units: '[{"abbr":"slice","grams":35}]' }), 0.35);
  assert.equal(foodForServing({ ...slice, labelReference: 'portion' }, nutrientIds).nutrition.calories, 300);
  const volume = { labelReference: 'g', portion: 50, unit: 'ml' };
  assert.equal(labelServingFactor(volume), null);
  assert.equal(labelServingFactor({ ...volume, density_g_ml: 1.2 }), 0.6);
  assert.equal(labelServingFactor({ ...volume, portion: 0 }), null);
  assert.equal(scaleFactor(100, 'g', 50, 'ml', { nutrition_basis: 'g' }), 0.5);
});

test('a refresh uses the label column and leaves conversion to the serving for save', () => {
  const form = { labelReference: 'g', portion: 30, unit: 'g', calories: 450 };
  const upstream = { portion: 100, unit: 'g', nutrition: { calories: 400 }, _offPresent: ['calories'] };
  const { food: updated, reason } = applyOffRefresh(labelInputFood(form), upstream, nutrientIds);
  assert.equal(reason, 'updated');
  assert.equal(updated.calories, 400);
  const item = foodForServing({ ...updated, portion: form.portion, unit: form.unit }, nutrientIds);
  assert.equal(item.nutrition.calories, 120);
});

test('the label scan keeps the per-100 column separate from the printed serving', () => {
  const food = { labelReference: 'g', portion: 100, unit: 'g', calories: '' };
  const scanned = applyScannedFoodLabel(food, {
    name: 'Biscuit', reference: '100g', portion: 30, unit: 'g', calories: 450,
  });
  assert.equal(scanned.portion, 30);
  assert.equal(scanned.labelReference, 'g');
  assert.equal(scanned.calories, 450);
  assert.equal(foodForServing(scanned, nutrientIds).nutrition.calories, 135);
});

test('a label printed per serving is rescaled to the chosen usual serving', () => {
  const food = { id: 12, labelReference: 'g', portion: 45, unit: 'g' };
  const scanned = applyScannedFoodLabel(food, { reference: 'portion', portion: 30, unit: 'g', calories: 135 });
  assert.equal(scanned.portion, 45);
  assert.equal(scanned.labelReference, 'portion');
  assert.equal(foodForServing(scanned, nutrientIds).nutrition.calories, 202.5);
  assert.equal(applyScannedFoodLabel(food, { reference: 'portion', portion: 1, unit: 'piece', calories: 135 }), null);
  assert.equal(applyScannedFoodLabel(food, { reference: 'portion', calories: 135 }), null);
  assert.equal(applyScannedFoodLabel(food, { calories: 135 }), null);
});

test('a drink label without a serving defaults to the readable column and can use kJ', () => {
  const food = { labelReference: 'g', portion: 100, unit: 'g' };
  const scanned = applyScannedFoodLabel(food, { reference: '100ml', kilojoules: 200 });
  assert.equal(scanned.labelReference, 'ml');
  assert.equal(scanned.unit, 'ml');
  assert.equal(scanned.portion, 100);
  assert.equal(scanned.calories, 200 / 4.184);
});
