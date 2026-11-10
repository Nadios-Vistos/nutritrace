import test from 'node:test';
import assert from 'node:assert/strict';
import { calorieBalance, KCAL_PER_KG } from '../src/lib/calorie-balance.js';

const today = '2026-11-10';
const budget = () => 2000;

test('sums the gap between intake and budget over logged days only', () => {
  const days = new Map([['2026-11-09', 2300], ['2026-11-08', 1800], ['2026-11-06', 2500]]);
  assert.deepEqual(calorieBalance(days, budget, { today, days: 7 }), { kcal: 600, days: 3, kg: 0.1 });
});

test('today is excluded because the day is not finished', () => {
  const days = new Map([[today, 5000], ['2026-11-09', 2000]]);
  assert.deepEqual(calorieBalance(days, budget, { today, days: 7 }), { kcal: 0, days: 1, kg: 0 });
});

test('days outside the window are ignored', () => {
  const days = new Map([['2026-11-03', 3000], ['2026-11-02', 9000]]);
  assert.equal(calorieBalance(days, budget, { today, days: 7 }).kcal, 1000);
  assert.equal(calorieBalance(days, budget, { today, days: 30 }).kcal, 8000);
});

test('empty days and days without a budget do not count as zero intake', () => {
  const days = new Map([['2026-11-09', 0], ['2026-11-08', 2500], ['2026-11-07', 'x']]);
  const result = calorieBalance(days, date => date === '2026-11-08' ? null : 2000, { today, days: 7 });
  assert.deepEqual(result, { kcal: 0, days: 0, kg: 0 });
});

test('a weekday budget is resolved per date', () => {
  const days = new Map([['2026-11-09', 2200], ['2026-11-08', 2200]]);
  const weekend = date => new Date(`${date}T00:00:00`).getDay() === 0 ? 2500 : 2000;
  assert.equal(calorieBalance(days, weekend, { today, days: 7 }).kcal, -100);
});

test('the weight equivalent uses 7,700 kcal per kilogram', () => {
  assert.equal(calorieBalance(new Map([['2026-11-09', 2000 + KCAL_PER_KG]]), budget, { today, days: 7 }).kg, 1);
  assert.equal(calorieBalance(new Map([['2026-11-09', 500]]), budget, { today, days: 7 }).kg, -0.2);
});

test('the window crosses month boundaries on local calendar dates', () => {
  const days = new Map([['2026-10-31', 2100]]);
  assert.equal(calorieBalance(days, budget, { today: '2026-11-02', days: 7 }).days, 1);
});
