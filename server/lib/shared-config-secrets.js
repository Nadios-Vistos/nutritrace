import db from '../db.js';
import { decrypt, encrypt } from './token-crypto.js';

export const FAMILY_AI_KEY = 'ai_family_config';
export const MEALIE_MIRROR_KEY = 'mealie_mirror_config';

const secretFields = new Map([
  [FAMILY_AI_KEY, 'ai_api_key'],
  [MEALIE_MIRROR_KEY, 'token'],
]);
const select = db.prepare('SELECT value FROM app_config WHERE key = ?');
const upsert = db.prepare(`INSERT INTO app_config (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value`);

function parse(value) {
  try {
    const config = JSON.parse(value);
    return config && typeof config === 'object' && !Array.isArray(config) ? config : null;
  } catch {
    return null;
  }
}

export function readSharedConfig(key) {
  const row = select.get(key);
  if (!row) return null;
  const config = parse(row.value);
  if (!config) return { config: {}, unreadable: true };
  const field = secretFields.get(key);
  const stored = config[field];
  if (stored == null) return { config, unreadable: false };
  const secret = typeof stored === 'string' ? decrypt(stored) : null;
  return { config: { ...config, [field]: secret }, unreadable: secret === null };
}

export function writeSharedConfig(key, config) {
  const field = secretFields.get(key);
  const secret = config[field];
  const stored = secret ? { ...config, [field]: encrypt(secret) } : config;
  upsert.run(key, JSON.stringify(stored));
}

export const migrateSharedConfigSecrets = db.transaction(() => {
  for (const [key, field] of secretFields) {
    const row = select.get(key);
    const config = row && parse(row.value);
    const secret = config?.[field];
    if (typeof secret !== 'string' || !secret) continue;
    const encrypted = encrypt(secret);
    if (encrypted !== secret) upsert.run(key, JSON.stringify({ ...config, [field]: encrypted }));
  }
});
