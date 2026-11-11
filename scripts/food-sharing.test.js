import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { readSource } from './fixtures/source-text.js';

const dir = mkdtempSync(join(tmpdir(), 'nt-food-sharing-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.UPLOADS_PATH = join(dir, 'uploads');
process.env.JWT_SECRET = 'food-sharing-test-only';
const { default: db } = await import('../server/db.js');
const { authenticate, signToken } = await import('../server/middleware/auth.js');
const { default: appConfig } = await import('../server/routes/app-config.js');
const { default: foods } = await import('../server/routes/foods.js');
const { default: meals } = await import('../server/routes/meals.js');
const { default: settings } = await import('../server/routes/settings.js');
const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express');

const foodGroup = '/api/foods?group=1';
const sharingStatus = '/api/app-config/sharing';

const source = readSource(new URL('../src/routes/Foods.svelte', import.meta.url));
function sharedCatalogue(NtApi) {
  const start = source.indexOf('  let sharingEnabled = false;');
  const end = source.indexOf('  async function copyAndUse', start);
  assert.ok(start >= 0 && end > start);
  return runInNewContext(source.slice(start, end) + `
    ({ refresh: refreshSharingStatus, foods: () => groupCatalogue[0], enabled: () => sharingEnabled });
  `, { NtApi, searchSource: 'all', showError: () => {}, $_: key => key });
}

test('a family member sees new shares and removals after the catalogue has already loaded', async t => {
  const insertUser = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
  const getUser = db.prepare('SELECT * FROM users WHERE username = ?');
  const users = {};
  for (const [name, role] of [['owner', 'admin'], ['member', 'user'], ['other', 'user']]) {
    insertUser.run(name, 'fixture', role);
    users[name] = getUser.get(name);
  }

  const app = express();
  app.use(express.json(), authenticate);
  app.use('/api/app-config', appConfig);
  app.use('/api/foods', foods);
  app.use('/api/meals', meals);
  app.use('/api/settings', settings);
  const server = createServer(app);
  t.after(() => new Promise(resolve => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;

  async function request(user, path, method = 'GET', body, status = 200) {
    const response = await fetch(origin + path, {
      method,
      headers: { Authorization: 'Bearer ' + signToken(users[user]), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }

  const create = (user, name) => request(user, '/api/foods', 'POST', { name }, 201);
  const enable = value => request('owner', '/api/app-config', 'PUT', { key: 'sharing_enabled', value });
  const ownFood = await create('member', 'Personal food');
  const first = await create('owner', 'Apple');
  assert.deepEqual(await request('member', foodGroup), []);
  await enable('true');
  assert.deepEqual(await request('member', foodGroup), []);

  const catalogue = sharedCatalogue({
    getSharingStatus: () => request('member', sharingStatus),
    getGroupFoods: () => request('member', foodGroup),
    getGroupMeals: () => request('member', '/api/meals?group=1'),
    getGroupRecipes: () => request('member', '/api/meals?group=1&recipes=1'),
  });
  const receivedIds = () => Array.from(catalogue.foods(), food => food.id);
  await request('owner', '/api/foods/bulk-share', 'POST', { targets: ['foods'], visibility: 'group' });
  await catalogue.refresh();
  assert.deepEqual(receivedIds(), [first.id]);
  assert.equal(catalogue.foods()[0]._shared_by, 'owner');
  assert.deepEqual((await request('member', '/api/foods')).map(food => food.id), [ownFood.id]);

  await request('owner', '/api/settings', 'PUT', { key: 'defaultShareVisibility', value: 'group' });
  const next = await create('owner', 'Banana');
  await catalogue.refresh();
  assert.deepEqual(receivedIds(), [first.id, next.id]);

  const copy = await request('member', '/api/foods/' + next.id + '/copy', 'POST', {}, 201);
  assert.equal(copy.user_id, users.member.id);
  assert.equal(copy.name, next.name);
  assert.notEqual(copy.id, next.id);

  await request('owner', '/api/foods/' + next.id + '/share', 'PATCH', {
    visibility: 'specific', user_ids: [users.member.id],
  });
  assert.deepEqual((await request('other', foodGroup)).map(food => food.id), [first.id]);
  await request('owner', '/api/foods/' + first.id, 'DELETE');
  await catalogue.refresh();
  assert.deepEqual(receivedIds(), [next.id]);
  assert.equal((await request('member', sharingStatus)).foods, 1);

  await enable('false');
  await catalogue.refresh();
  assert.equal(catalogue.enabled(), false);
  assert.deepEqual(receivedIds(), []);
  assert.deepEqual(await request('member', foodGroup), []);
});

test.after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
