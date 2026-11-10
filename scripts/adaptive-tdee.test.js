import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { readSource } from './fixtures/source-text.js';

const dir = mkdtempSync(join(tmpdir(), 'nt-adaptive-tdee-'));
process.env.DB_PATH = join(dir, 'test.db');
const { default: db } = await import('../server/db.js');
const { computeAdaptiveTdee } = await import('../server/lib/adaptive-tdee.js');
test.after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const now = Date.parse('2026-03-31T00:30:00Z');
const date = daysAgo => new Date(now - daysAgo * 86400000).toISOString().slice(0, 10);
const insertDiary = db.prepare('INSERT INTO diary (user_id, date, items, body_stats) VALUES (?, ?, ?, ?)');
const insertWellness = db.prepare("INSERT INTO wellness_data (user_id, date, source, metric_type, value) VALUES (?, ?, 'withings', 'weight_kg', ?)");
const source = readSource(new URL('../src/lib/adaptive-tdee-local.js', import.meta.url))
  .replace("import { getDb, LOCAL_USER_ID } from './db-native.js';", '')
  .replace('export async function computeAdaptiveTdeeLocal', 'async function computeAdaptiveTdeeLocal');

function fixture(t, name) {
  t.mock.timers.enable({ apis: ['Date'], now });
  const id = Number(db.prepare("INSERT INTO users (username, password_hash) VALUES (?, 'fixture')").run(name).lastInsertRowid);
  // Run the Android calculation with the native SQLite bridge replaced by
  // a query against the same fixture. The calculation itself is unchanged.
  const computeLocal = runInNewContext(source + '\ncomputeAdaptiveTdeeLocal;', {
    Date, LOCAL_USER_ID: id,
    getDb: async () => ({ query: (sql, args) => ({ values: db.prepare(sql).all(...args) }) }),
  });
  return {
    diary(daysAgo, calories, weight) {
      const items = calories == null ? [] : [{ nutrition: { calories } }];
      const body = weight == null ? {} : { weight, weight_unit: 'kg' };
      insertDiary.run(id, date(daysAgo), JSON.stringify(items), JSON.stringify(body));
    },
    wellness(daysAgo, weight) {
      insertWellness.run(id, date(daysAgo), weight);
    },
    async check(options, expected) {
      const server = computeAdaptiveTdee(id, options);
      assert.deepEqual(server, { ...expected, computedAt: new Date(now).toISOString() });
      assert.deepEqual({ ...await computeLocal(options) }, server, 'Android standalone should match the server');
    },
  };
}

test("adaptive TDEE keeps today's weigh-in while excluding today's intake and dates outside the window", async t => {
  const f = fixture(t, 'current-day');
  f.diary(4, 9000, 130); // one day before the window
  f.diary(3, 2000, 80);
  f.diary(2, 2000);
  f.diary(1, 2000);
  f.diary(0, 50);
  f.wellness(0, 79.7); // anchors the interpolation for the prior two days
  f.diary(-1, 9000, 130); // a future entry must also stay out
  await f.check({ windowDays: 3, minValidDays: 3 }, {
    ready: true, daysAvailable: 3, daysRequired: 3, windowDays: 3,
    tdee: 2770, trendKgPerWeek: -0.7, confidence: 0.95, weightSource: 'mixed',
  });
});

test('adaptive TDEE measures slope in elapsed calendar days across missing diary entries', async t => {
  const f = fixture(t, 'missing-days');
  f.diary(8, 5000); // no weight before the first measurement
  f.diary(7, 2000, 80);
  f.diary(5, 2000);
  f.diary(2, 2000, 79.5);
  f.diary(1, 6000); // no weight after the last measurement
  await f.check({ windowDays: 8, minValidDays: 3 }, {
    ready: true, daysAvailable: 3, daysRequired: 3, windowDays: 8,
    tdee: 2770, trendKgPerWeek: -0.7, confidence: 0.69, weightSource: 'manual',
  });
  await f.check({ windowDays: 8, minValidDays: 4 }, {
    ready: false, daysAvailable: 3, daysRequired: 4, windowDays: 8,
    tdee: null, trendKgPerWeek: null, confidence: null, weightSource: null,
  });
});
