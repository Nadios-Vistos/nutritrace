import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveFamilyBudget, estimateFamilyGoals } from '../src/lib/family-onboarding.js';

const profile = {
  gender: 'female', age: 35, height_cm: 165, weight_kg: 75,
  target_weight: 75, activity: 'moderate',
};

test('the onboarding estimate uses the person’s measurements and activity', () => {
  const result = estimateFamilyGoals(profile);
  assert.equal(result.bmi.toFixed(1), '27.5');
  assert.equal(result.direction, 0);
  assert.ok(Math.abs(result.calories - result.maintenance) <= 12.5);
  for (const change of [{ gender: 'male' }, { age: 25 }, { height_cm: 175 }, { activity: 'active' }]) {
    assert.ok(estimateFamilyGoals({ ...profile, ...change }).calories > result.calories);
  }
});

test('the weight target changes the starting budget within a modest range', () => {
  const result = estimateFamilyGoals(profile);
  const slightLoss = estimateFamilyGoals({ ...profile, target_weight: 74 });
  const loss = estimateFamilyGoals({ ...profile, target_weight: 65 });
  const gain = estimateFamilyGoals({ ...profile, target_weight: 80 });
  assert.ok(loss.calories < slightLoss.calories && slightLoss.calories < result.calories);
  assert.ok(gain.calories > result.calories);
  assert.ok(result.maintenance - loss.calories <= 250 + 12.5);
});

test('unsuitable or incomplete inputs produce no calorie budget', () => {
  assert.deepEqual(estimateFamilyGoals({ ...profile, age: 17 }), { error: 'invalid' });
  assert.deepEqual(estimateFamilyGoals({ ...profile, weight_kg: NaN }), { error: 'invalid' });
  assert.deepEqual(estimateFamilyGoals({ ...profile, activity: 'constructor' }), { error: 'invalid' });
  assert.equal(estimateFamilyGoals({ ...profile, target_weight: 45 }).error, 'low_bmi');
  assert.equal(estimateFamilyGoals({ ...profile, age: 75, height_cm: 145, weight_kg: 48, target_weight: 47, activity: 'sedentary' }).error, 'low_energy');
});

test('onboarding accepts exactly 18.5 BMI and rejects a lower current or target BMI', () => {
  const boundary = { ...profile, age: 18, height_cm: 200, weight_kg: 74, target_weight: 74 };
  assert.equal(estimateFamilyGoals(boundary).bmi, 18.5);
  assert.ok(estimateFamilyGoals(boundary).calories >= 1200);
  for (const change of [{ weight_kg: 73.99 }, { target_weight: 73.99 }]) {
    assert.equal(estimateFamilyGoals({ ...boundary, ...change }).error, 'low_bmi');
  }
});

test('starting and recalculated automatic budgets accept 1200 kcal but reject lower results', () => {
  const boundary = { ...profile, age: 42, height_cm: 145, weight_kg: 46, target_weight: 46, activity: 'sedentary' };
  assert.equal(estimateFamilyGoals(boundary).calories, 1200);
  assert.equal(estimateFamilyGoals({ ...boundary, age: 45 }).error, 'low_energy');
  assert.equal(adaptiveFamilyBudget(1500, 0.8), 1200);
  assert.equal(adaptiveFamilyBudget(1499, 0.8), null);
  assert.equal(adaptiveFamilyBudget(Infinity, 0.8), null);
});
