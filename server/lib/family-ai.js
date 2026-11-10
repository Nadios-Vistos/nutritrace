import db from '../db.js';
import { isAiEnvLocked } from '../ai.js';
import { serviceBase } from './ssrf-guard.js';
import { FAMILY_AI_KEY, readSharedConfig, writeSharedConfig } from './shared-config-secrets.js';
import { getFamilyDailyLimit, setFamilyDailyLimit } from './family-ai-quota.js';

const providers = new Set(['claude', 'openai', 'gemini', 'oai-compat']);
const personalKeys = ['aiProvider', 'aiModel', 'aiApiKey', 'aiBaseUrl'];
const readSettings = db.prepare(`
  SELECT s.key, s.value FROM user_settings s
  JOIN users u ON u.id = s.user_id AND u.role = 'admin'
  WHERE s.user_id = ? AND s.deleted_at IS NULL AND s.key IN (?, ?, ?, ?)
`);
const removeFamily = db.prepare('DELETE FROM app_config WHERE key = ?');

function readPersonalAi(userId) {
  const settings = {};
  for (const { key, value } of readSettings.all(userId, ...personalKeys)) {
    try { settings[key] = JSON.parse(value); } catch { settings[key] = value; }
  }
  const provider = settings.aiProvider ?? 'claude';
  const model = typeof settings.aiModel === 'string' ? settings.aiModel.trim() : '';
  const apiKey = typeof settings.aiApiKey === 'string' ? settings.aiApiKey.trim() : '';
  const base = provider === 'oai-compat' ? serviceBase(settings.aiBaseUrl) : null;
  if (!providers.has(provider) || (provider === 'oai-compat' ? !base || !model : !apiKey)) return null;
  return {
    ai_enabled: 'true', ai_provider: provider, ai_model: model, ai_api_key: apiKey,
    ai_base_url: base, owner_user_id: userId,
  };
}

export function familyAiFlags(adminId = null) {
  const family = readSharedConfig(FAMILY_AI_KEY);
  const enabled = !!family && !family.unreadable;
  return {
    ai_shared: enabled,
    ai_shared_secret_unreadable: adminId != null && !!family?.unreadable,
    ...(adminId != null && {
      ai_shared_daily_limit: getFamilyDailyLimit(),
      ai_shared_needs_link: enabled && family.config.owner_user_id !== adminId,
    }),
  };
}

export const updateFamilyAi = db.transaction((userId, { enabled, dailyLimit }) => {
  if (enabled === true) {
    const config = readPersonalAi(userId);
    if (!config) return false;
    writeSharedConfig(FAMILY_AI_KEY, config);
  } else if (enabled === false) {
    removeFamily.run(FAMILY_AI_KEY);
  }
  if (dailyLimit !== undefined) setFamilyDailyLimit(dailyLimit);
  return true;
});

// Keep the last usable shared configuration if the owner clears a required
// setting. A legacy share is linked explicitly by an administrator first.
export function refreshFamilyAi(user, changedKeys) {
  if (user?.role !== 'admin' || !changedKeys.some(key => personalKeys.includes(key)) || isAiEnvLocked()) return;
  const family = readSharedConfig(FAMILY_AI_KEY);
  if (!family || family.unreadable || family.config.owner_user_id !== user.id) return;
  const next = readPersonalAi(user.id);
  if (!next) return;
  // A provider change can arrive before its new key. Never forward the old
  // provider's credential to the new endpoint in that intermediate state.
  if (next.ai_provider !== family.config.ai_provider && next.ai_api_key && next.ai_api_key === family.config.ai_api_key) return;
  if (Object.keys(next).some(key => next[key] !== family.config[key])) {
    writeSharedConfig(FAMILY_AI_KEY, next);
  }
}
