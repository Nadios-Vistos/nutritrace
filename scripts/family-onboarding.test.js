import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFamilyGoals } from '../src/lib/family-onboarding.js';

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
