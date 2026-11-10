import db from './db.js';
import { serviceBase } from './lib/ssrf-guard.js';
import { FAMILY_AI_KEY, readSharedConfig, writeSharedConfig } from './lib/shared-config-secrets.js';

const providers = new Set(['claude', 'openai', 'gemini', 'oai-compat']);

export function getFamilyAiStatus() {
  const family = readSharedConfig(FAMILY_AI_KEY);
  return { enabled: !!family && !family.unreadable, unreadable: !!family?.unreadable };
}

export function setFamilyAiFromUser(userId, enabled) {
  if (!enabled) {
    db.prepare('DELETE FROM app_config WHERE key = ?').run(FAMILY_AI_KEY);
    return true;
  }
  const rows = db.prepare(`SELECT key, value FROM user_settings
    WHERE user_id = ? AND deleted_at IS NULL AND key IN ('aiProvider', 'aiModel', 'aiApiKey', 'aiBaseUrl')`).all(userId);
  const settings = {};
  for (const { key, value } of rows) {
    try { settings[key] = JSON.parse(value); } catch { settings[key] = value; }
  }
  const provider = settings.aiProvider ?? 'claude';
  const model = typeof settings.aiModel === 'string' ? settings.aiModel.trim() : '';
  const apiKey = typeof settings.aiApiKey === 'string' ? settings.aiApiKey.trim() : '';
  const base = provider === 'oai-compat' ? serviceBase(settings.aiBaseUrl) : null;
  if (!providers.has(provider) || (provider === 'oai-compat' ? !base || !model : !apiKey)) return false;
  writeSharedConfig(FAMILY_AI_KEY, {
    ai_enabled: 'true', ai_provider: provider, ai_model: model, ai_api_key: apiKey, ai_base_url: base,
  });
  return true;
}

/** Seed AI config from env vars at startup — env vars take priority over UI */
export function seedAiFromEnv() {
  const map = {
    AI_ENABLED:  'ai_enabled',
    AI_PROVIDER: 'ai_provider',
    AI_API_KEY:  'ai_api_key',
    AI_MODEL:    'ai_model',
    // AI_BASE_URL enables server-side proxying for the `oai-compat`
    // provider (Ollama, LM Studio, LocalAI, vLLM, etc.). Required when
    // AI_PROVIDER=oai-compat; ignored otherwise. Lets self-hosters put
    // their LLM on a private Docker network — the browser never talks
    // to it directly, so mixed-content and internal-DNS resolution
    // stop being blockers (#90 gentlecolts).
    AI_BASE_URL: 'ai_base_url',
  };
  const upsert = db.prepare(
    'INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const del = db.prepare('DELETE FROM app_config WHERE key = ?');
  let locked = false;
  for (const [envKey, dbKey] of Object.entries(map)) {
    if (process.env[envKey] != null) {
      upsert.run(dbKey, process.env[envKey]);
      locked = true;
    }
  }
  if (locked) {
    upsert.run('ai_env_locked', 'true');
  } else {
    // No AI_* env vars set on this run. Clear any prior lock so the UI
    // unlocks after the operator removes the env vars from compose and
    // restarts. Without this, the lock persists forever (issue #36).
    del.run('ai_env_locked');
  }
}

export function getAiConfig() {
  if (!isAiEnvLocked()) {
    const family = readSharedConfig(FAMILY_AI_KEY);
    if (family?.unreadable) return { ai_enabled: 'false' };
    if (family) return { ...family.config, familyManaged: true };
  }
  const rows = db.prepare("SELECT key, value FROM app_config WHERE key LIKE 'ai_%'").all();
  const cfg = {};
  for (const { key, value } of rows) if (key !== FAMILY_AI_KEY) cfg[key] = value;
  return cfg;
}

export function isAiEnvLocked() {
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('ai_env_locked');
  return row?.value === 'true';
}
