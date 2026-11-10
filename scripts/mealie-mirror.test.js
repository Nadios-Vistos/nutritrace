import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'nt-mealie-mirror-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.JWT_SECRET = 'mealie-mirror-test-only';
const { default: db } = await import('../server/db.js');
const { configureMirror, mirrorRecipes, mirrorStatus, syncMealieMirror } = await import('../server/lib/mealie-mirror.js');
test.after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function recipe(number, { revision = 'v1', nutrition = {} } = {}) {
  return {
    id: 'aabbccdd-1234-4567-8abc-' + String(number).padStart(12, '0'),
    slug: 'recipe-' + number,
    name: 'Recipe ' + number + ' ' + revision,
    updatedAt: revision,
    recipeIngredient: [],
    nutrition,
  };
}

function page(recipes, total = recipes.length, pages = 1) {
  return {
    items: recipes.map(({ id, slug, updatedAt }) => ({ id, slug, updatedAt })),
    total,
    total_pages: pages,
  };
}

async function fixture(t) {
  db.exec("DELETE FROM mealie_recipes; DELETE FROM app_config WHERE key LIKE 'mealie_mirror_%'");
  const requests = [];
  let listing;
  let details;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push(url);
    const route = url.pathname === '/api/recipes'
      ? listing.get(Number(url.searchParams.get('page')))
      : details.get(url.pathname.split('/').at(-1));
    const response = req.headers.authorization !== 'Bearer fixture-token' ? 401 : route ?? 404;
    res.writeHead(typeof response === 'number' ? response : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(typeof response === 'number' ? {} : response));
  });
  server.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port;
  assert.equal(configureMirror({ url, token: 'fixture-token', enabled: true }), true);
  return {
    requests,
    feed(pages, recipes) {
      requests.length = 0;
      listing = new Map(pages.map((entry, index) => [index + 1, entry]));
      details = new Map(recipes);
    },
  };
}

function detailsFor(recipes) {
  return recipes.map(entry => [entry.slug, entry]);
}

function snapshot() {
  return db.prepare('SELECT * FROM mealie_recipes ORDER BY id').all();
}

async function seed(f, recipes) {
  f.feed([page(recipes)], detailsFor(recipes));
  await syncMealieMirror();
  assert.equal(mirrorStatus().error, undefined);
  assert.equal(mirrorStatus().count, recipes.length);
  return snapshot();
}

test('Mealie converts energy and mass units and decimal commas when mirroring nutrition', async t => {
  const f = await fixture(t);
  const converted = recipe(1, { nutrition: {
    calories: '418,4 kJ', proteinContent: '12,5 g', carbohydrateContent: '22500 mg',
    fatContent: 7.5, saturatedFatContent: '2500000 µg', fiberContent: '2000 ug',
    sugarContent: '2500 μg', sodiumContent: '0,75 g', cholesterolContent: '250000 µg',
    transFatContent: '1 kcal',
  } });
  const kcal = recipe(2, { nutrition: {
    calories: '150,5 kcal', proteinContent: '', carbohydrateContent: '-2 g',
    sodiumContent: '42 mg', cholesterolContent: 'less than 1 mg', fatContent: null,
  } });
  const invalidEnergy = recipe(3, { nutrition: { calories: '4 g' } });
  await seed(f, [converted, kcal, invalidEnergy]);
  const [first, second, third] = mirrorRecipes();
  const { calories, ...mass } = first.nutrition;
  assert.ok(Math.abs(calories - 100) < 1e-9);
  assert.deepEqual(mass, {
    proteins: 12.5, carbohydrates: 22.5, fat: 7.5, 'saturated-fat': 2.5,
    fiber: 0.002, sugars: 0.0025, sodium: 750, cholesterol: 250,
  });
  assert.deepEqual(second.nutrition, { calories: 150.5, sodium: 42 });
  assert.deepEqual(third.nutrition, {});
});

test('Mealie rejects invalid pagination without touching cached recipes', async t => {
  const f = await fixture(t);
  const a = recipe(1), b = recipe(2);
  const before = await seed(f, [a, b]);
  const lastSync = mirrorStatus().lastSync;
  const invalid = {
    'too many pages': [page([], 0, 501)],
    'negative total': [page([], -1, 1)],
    'zero pages with recipes': [page([a], 1, 0)],
    'malformed item list': [{ ...page([]), items: null }],
    'duplicate ID across pages': [page([a], 2, 2), page([a], 2, 2)],
    'missing item on final page': [page([a], 2, 2), page([], 2, 2)],
  };
  for (const [name, pages] of Object.entries(invalid)) {
    await t.test(name, async () => {
      f.feed(pages, []);
      await syncMealieMirror();
      assert.deepEqual(snapshot(), before);
      assert.equal(mirrorStatus().error, 'invalid');
      assert.equal(mirrorStatus().lastSync, lastSync);
      assert.ok(f.requests.every(url => url.pathname === '/api/recipes'));
    });
  }
});

test('Mealie keeps the whole cached catalogue when a later list page or detail fails', async t => {
  const f = await fixture(t);
  const a = recipe(1), b = recipe(2);
  const before = await seed(f, [a, b]);
  const lastSync = mirrorStatus().lastSync;
  const changed = recipe(1, { revision: 'v2' }), added = recipe(3);

  f.feed([page([changed], 2, 2), 503], []);
  await syncMealieMirror();
  assert.deepEqual(snapshot(), before);
  assert.equal(mirrorStatus().error, 'unavailable');
  assert.equal(mirrorStatus().lastSync, lastSync);
  assert.deepEqual(f.requests.map(url => url.searchParams.get('page')), ['1', '2']);

  for (const [failure, expectedError] of [[503, 'unavailable'], [b, 'invalid']]) {
    f.feed([page([changed, added])], [[changed.slug, changed], [added.slug, failure]]);
    await syncMealieMirror();
    assert.deepEqual(f.requests.map(url => url.pathname), ['/api/recipes', '/api/recipes/recipe-1', '/api/recipes/recipe-3']);
    assert.deepEqual(snapshot(), before);
    assert.equal(mirrorStatus().error, expectedError);
    assert.equal(mirrorStatus().lastSync, lastSync);
  }
});

test('a complete Mealie sync applies updates and removes only the deleted mirrored recipe', async t => {
  const f = await fixture(t);
  const kept = recipe(1), removed = recipe(2);
  await seed(f, [kept, removed]);
  const personal = Number(db.prepare("INSERT INTO meals (name, is_recipe) VALUES ('Personal recipe', 1)").run().lastInsertRowid);
  t.after(() => db.prepare('DELETE FROM meals WHERE id = ?').run(personal));
  const changed = recipe(1, { revision: 'v2' }), added = recipe(3);
  const first = page([changed], 2, 2);
  const second = { items: page([added]).items, total: 2, totalPages: 2 };
  f.feed([first, second], detailsFor([changed, added]));
  await syncMealieMirror();
  assert.deepEqual(f.requests.slice(0, 2).map(url => [
    url.searchParams.get('page'), url.searchParams.get('perPage'),
  ]), [['1', '100'], ['2', '100']]);
  assert.deepEqual(mirrorRecipes().map(({ source_external_id, name }) => [source_external_id, name]), [
    [kept.id, changed.name], [added.id, added.name],
  ]);
  assert.equal(db.prepare('SELECT name FROM meals WHERE id = ?').get(personal)?.name, 'Personal recipe');
  assert.equal(mirrorStatus().error, undefined);
  assert.equal(mirrorStatus().count, 2);
});

test('Mealie handles a catalogue change mid-pagination', async t => {
  const f = await fixture(t);
  const recipes = Array.from({ length: 101 }, (_, index) => recipe(index + 1));
  const first = page(recipes.slice(0, 100), 101, 2);
  f.feed([first, page(recipes.slice(100), 101, 2)], detailsFor(recipes));
  await syncMealieMirror();
  assert.equal(mirrorStatus().count, 101);
  assert.equal(mirrorStatus().error, undefined);
  const last = recipes.at(-1);
  // Between requests Mealie deletes the first recipe. The last recipe moves
  // to page one, which the mirror already read using the original catalogue.
  f.feed([first, page([], 100, 1)], []);
  await syncMealieMirror();
  assert.deepEqual(f.requests.map(url => url.searchParams.get('page')), ['1', '2']);
  await t.test('the partial snapshot must preserve the entire cache', () => {
    assert.ok(snapshot().some(row => row.id === last.id), 'the last recipe still exists in Mealie');
    assert.equal(mirrorStatus().count, 101);
    assert.equal(mirrorStatus().error, 'invalid');
  });
});
