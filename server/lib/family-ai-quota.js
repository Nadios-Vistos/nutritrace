import db from '../db.js';

const LIMIT_KEY = 'ai_family_daily_limit';
const DEFAULT_LIMIT = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

db.exec(`
  CREATE TABLE IF NOT EXISTS family_ai_usage (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    count INTEGER NOT NULL
  )
`);

const readLimit = db.prepare('SELECT value FROM app_config WHERE key = ?');
const writeLimit = db.prepare(`
  INSERT INTO app_config (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const increment = db.prepare(`
  INSERT INTO family_ai_usage (user_id, day, count) VALUES (@userId, @day, 1)
  ON CONFLICT(user_id) DO UPDATE SET
    day = excluded.day,
    count = CASE WHEN day = excluded.day THEN count + 1 ELSE 1 END
  WHERE day <> excluded.day OR @limit = 0 OR count < @limit
`);

export function isFamilyDailyLimit(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function getFamilyDailyLimit() {
  const value = Number(readLimit.get(LIMIT_KEY)?.value ?? DEFAULT_LIMIT);
  return isFamilyDailyLimit(value) ? value : DEFAULT_LIMIT;
}

export function setFamilyDailyLimit(limit) {
  writeLimit.run(LIMIT_KEY, String(limit));
}

// Count each upstream request, including follow-up rounds, in a single atomic write.
// Keep counting in unlimited mode so a new limit applies to the whole UTC day.
export function takeFamilyAiRequest(userId) {
  const now = Date.now();
  const day = Math.floor(now / DAY_MS);
  const limit = getFamilyDailyLimit();
  if (increment.run({ userId, day, limit }).changes) return 0;
  return Math.ceil(((day + 1) * DAY_MS - now) / 1000);
}
