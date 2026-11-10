import assert from 'node:assert/strict';
import test from 'node:test';
import { hydrationTotal } from '../src/lib/nutrition.js';

const drink = (ml, quantity) => ({ nutrition: { beverage_ml: ml }, quantity });

test('hydration adds direct water logs in millilitres', () => {
  assert.equal(hydrationTotal(), 0);
  assert.equal(hydrationTotal([], [{ amount: 250 }, { amount: '125.5' }]), 376);
});

test('hydration uses beverage volume per logged quantity', () => {
  assert.equal(hydrationTotal([drink(196), drink('150', '0.5'), drink(100, 2)]), 471);
});

test('hydration adds water and drinks before rounding', () => {
  assert.equal(hydrationTotal([drink(100, 1.004)], [{ amount: 200.4 }]), 301);
});

test('hydration ignores missing, malformed and non-positive drink totals', () => {
  const invalid = [
    null, {}, drink('not a volume'), drink(Infinity), drink(-100), drink(100, -1),
    drink(100, 0), drink(100, 'not a quantity'),
    { ...drink(100), is_recipe: true }, { ...drink(100), _splitItems: [{}] },
  ];
  assert.equal(hydrationTotal([...invalid, drink(75)], [{}, { amount: 'invalid' }]), 75);
});

test('invalid direct water amounts are ignored', { todo: 'Negative and non-finite water amounts currently affect the sum' }, () => {
  const water = [{ amount: 250 }];
  assert.deepEqual([
    hydrationTotal([], [...water, { amount: -50 }]),
    hydrationTotal([], [...water, { amount: 'Infinity' }]),
  ], [250, 250]);
});

test('null direct water entries are ignored', { todo: 'A null log currently throws when reading its amount' }, () => {
  assert.equal(hydrationTotal([], [null, { amount: 250 }]), 250);
});

test('two negative beverage inputs do not create positive hydration', { todo: 'The product is validated instead of each input' }, () => {
  assert.equal(hydrationTotal([drink(-100, -1)]), 0);
});
