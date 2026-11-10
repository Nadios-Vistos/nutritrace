import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { estimateFamilyGoals } from '../src/lib/family-onboarding.js';

const dir = mkdtempSync(join(tmpdir(), 'nt-family-onboarding-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.JWT_SECRET = 'family-onboarding-test-only';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express');
const { default: db } = await import('../server/db.js');
const { default: auth } = await import('../server/routes/auth.js');
const { authenticate, signToken } = await import('../server/middleware/auth.js');
const app = express();
app.use(express.json(), authenticate);
app.use('/api/auth', auth);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = 'http://127.0.0.1:' + server.address().port + '/api/auth/onboarding';

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const profile = {
  adult: true, gender: 'female', age: 35, height_cm: 165, weight_kg: 75,
  target_weight: 70, activity: 'moderate',
};
const floor = { age: 42, height_cm: 145, weight_kg: 46, target_weight: 46, activity: 'sedentary' };
const insertUser = db.prepare("INSERT INTO users (username, password_hash, onboarding_status, birthday) VALUES (?, 'fixture', 'pending', ?)");
const selectUser = db.prepare('SELECT * FROM users WHERE id = ?');
const selectSettings = db.prepare('SELECT key, value FROM user_settings WHERE user_id = ? AND deleted_at IS NULL');
const upsertSetting = db.prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)');

function account(username, birthday = null) {
  const id = Number(insertUser.run(username, birthday).lastInsertRowid);
  const token = signToken(selectUser.get(id));
  return {
    status: () => selectUser.get(id).onboarding_status,
    settings: () => Object.fromEntries(selectSettings.all(id).map(({ key, value }) => [key, JSON.parse(value)])),
    setting: (key, value) => upsertSetting.run(id, key, JSON.stringify(value)),
    async submit(changes = {}, expectedStatus = 200) {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profile, account: id, ...changes }),
      });
      const data = await response.json();
      assert.equal(response.status, expectedStatus, JSON.stringify(data));
      return data.user;
    },
  };
}

test('PUT onboarding rejects underage, low-BMI and low-energy profiles without saving goals', async t => {
  const user = account('rejected');
  const cases = {
    'reported age under 18': { age: 17 },
    'adult declaration missing': { adult: undefined },
    'adult declaration false': { adult: false },
    'current BMI below 18.5': { weight_kg: 49 },
    'target BMI below 18.5': { target_weight: 49 },
    'starting budget below 1200 kcal': { ...floor, age: 45 },
  };
  for (const [name, changes] of Object.entries(cases)) {
    await t.test(name, async () => {
      await user.submit(changes, 400);
      assert.equal(user.status(), 'pending');
      assert.deepEqual(user.settings(), {});
    });
  }
});

test('PUT onboarding completes a profile with exactly 1200 kcal and stores a kg goal', async () => {
  const user = account('calorie-floor');
  assert.equal((await user.submit(floor)).onboarding_status, 'complete');
  const settings = user.settings();
  assert.equal(settings.goals.calories.max, 1200);
  assert.deepEqual(settings.goals.calories.days, Array(7).fill(1200));
  assert.equal(settings.weightUnit, 'kg');
  assert.equal(settings.target_weight, 46);
  assert.equal(settings.goals.weight.max, 46);
});

test('PUT onboarding only recalculates on request and preserves other goals and unit preferences', async () => {
  const user = account('recalculate');
  await user.submit({ recalculate: true }, 400);
  assert.equal(user.status(), 'pending');
  await user.submit();
  const first = user.settings();
  await user.submit({ activity: 'active' });
  assert.deepEqual(user.settings(), first);

  const protein = { min: 80, showInDiary: true };
  user.setting('goals', { ...first.goals, proteins: protein });
  user.setting('energyUnit', 'kJ');
  user.setting('familyCalorieBudget', 1800);
  user.setting('calorieGoalMode', 'adaptive');
  const edited = { activity: 'active', weight_kg: 71, target_weight: 73 };
  await user.submit({ ...edited, recalculate: true });
  const settings = user.settings();
  const estimate = estimateFamilyGoals({ ...profile, ...edited });
  assert.notEqual(settings.goals.calories.max, first.goals.calories.max);
  assert.equal(settings.goals.calories.max, estimate.calories);
  assert.equal(settings.tdee, estimate.maintenance);
  assert.deepEqual(settings.goals.proteins, protein);
  assert.equal(settings.energyUnit, 'kJ');
  assert.equal(settings.familyCalorieBudget, null);
  assert.equal(settings.calorieGoalMode, 'fixed');
  assert.equal(settings.weightUnit, 'kg');
  assert.equal(settings.goals.weight.min, 73);
  assert.equal(settings.goals.weight.isMin, true);
  await user.submit({ recalculate: true, target_weight: 49 }, 400);
  assert.deepEqual(user.settings(), settings);
});

test('PUT onboarding recalculates a goal in pounds while keeping the canonical target in kg', async () => {
  const user = account('pounds');
  await user.submit();
  user.setting('weightUnit', 'lb');
  await user.submit({ recalculate: true, target_weight: 72.3 });
  const settings = user.settings();
  assert.equal(settings.weightUnit, 'lb');
  assert.equal(settings.target_weight, 72.3);
  assert.equal(settings.goals.weight.max, 159.4);
  assert.deepEqual(settings.goals.weight.days, Array(7).fill(159.4));
});

test('PUT onboarding rejects an account with a known underage birthday despite a conflicting declaration', {
  todo: 'The route currently trusts the submitted age instead of checking the saved birthday',
}, async () => {
  const birthday = new Date();
  birthday.setUTCFullYear(birthday.getUTCFullYear() - 15);
  const user = account('minor-birthday', birthday.toISOString().slice(0, 10));
  await user.submit({ adult: true, age: 35 }, 400);
  assert.equal(user.status(), 'pending');
});
