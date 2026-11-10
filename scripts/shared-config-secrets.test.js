import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const serverDir = new URL('../server/', import.meta.url);
const require = createRequire(new URL('package.json', serverDir));
const Database = require('better-sqlite3');
const AdmZip = require('adm-zip');
const aiKey = 'ai_family_config';
const mealieKey = 'mealie_mirror_config';
const aiSecret = 'fixture-family-ai-secret';
const mealieSecret = 'fixture-mealie-token';
const ai = { ai_enabled: 'true', ai_provider: 'openai', ai_model: 'fixture-model', ai_api_key: aiSecret, ai_base_url: null };
const mealie = { url: 'https://mealie.example.invalid', enabled: true, token: mealieSecret };
const credentials = { username: 'backup-admin', password: 'Example-test-password-814!' };

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'nt-shared-config-'));
  const dbPath = join(dir, 'test.db');
  const backupDir = join(dir, 'backups');
  let child;
  let db;
  let base;
  let token;

  async function stop() {
    db?.close();
    db = null;
    if (!child) return;
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill();
      await exit;
    }
    child = null;
  }
  t.after(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });

  async function start(key = 'fixture-shared-encryption-key') {
    const listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const { port } = listener.address();
    await new Promise(resolve => listener.close(resolve));
    base = 'http://127.0.0.1:' + port;
    const env = {
      ...process.env, NODE_ENV: 'test', PORT: String(port), DB_PATH: dbPath,
      BACKUPS_PATH: backupDir, UPLOADS_PATH: join(dir, 'uploads'), UPDATE_CHECK: 'off',
      JWT_SECRET: 'fixture-shared-config-jwt', TOKEN_ENC_KEY: key,
    };
    for (const name of Object.keys(env)) if (name.startsWith('AI_')) delete env[name];
    child = spawn(process.execPath, ['index.js'], {
      cwd: fileURLToPath(serverDir), env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 200 && child.exitCode === null; attempt++) {
      const response = await fetch(base + '/api/auth/status').catch(() => null);
      await response?.body?.cancel();
      if (response?.ok) {
        db = new Database(dbPath);
        return;
      }
      await delay(50);
    }
    assert.fail('Server did not start:\n' + output);
  }

  async function api(path, method = 'GET', body, status = 200) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + '/api/' + path, { method, headers, body: JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }

  await start();
  const { user } = await api('auth/register', 'POST', credentials);
  ({ token } = await api('auth/login', 'POST', credentials));
  function setting(key, value) {
    db.prepare('INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)').run(user.id, key, JSON.stringify(value));
  }
  return {
    api, start, stop, backupDir,
    stored: key => db.prepare('SELECT value FROM app_config WHERE key = ?').get(key)?.value,
    seed: (key, config) => db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)').run(key, JSON.stringify(config)),
    setting,
    async enableSharing() {
      setting('aiProvider', ai.ai_provider);
      setting('aiModel', ai.ai_model);
      setting('aiApiKey', aiSecret);
      await api('ai/family', 'PUT', { enabled: true });
      await api('mealie/mirror', 'PUT', mealie);
    },
  };
}

function assertEncrypted(value, original, field) {
  assert.ok(!value.includes(original[field]));
  const stored = JSON.parse(value);
  assert.match(stored[field], /^enc:v1:/);
  assert.deepEqual({ ...stored, [field]: original[field] }, original);
}

test('new shared credentials are encrypted in app_config and remain usable', async t => {
  const f = await fixture(t);
  await f.enableSharing();
  assertEncrypted(f.stored(aiKey), ai, 'ai_api_key');
  assertEncrypted(f.stored(mealieKey), mealie, 'token');
  assert.equal((await f.api('app-config/env-locks')).ai_shared, true);
  const mirror = await f.api('mealie/mirror');
  assert.equal(mirror.enabled, true);
  assert.equal(mirror.hasToken, true);
  assert.equal(mirror.token, undefined);
});

test('startup migrates plaintext without losing settings and rotation disables sharing', async t => {
  const f = await fixture(t);
  f.seed(aiKey, ai);
  f.seed(mealieKey, mealie);
  await f.stop();
  await f.start();
  const encryptedAi = f.stored(aiKey);
  const encryptedMealie = f.stored(mealieKey);
  assertEncrypted(encryptedAi, ai, 'ai_api_key');
  assertEncrypted(encryptedMealie, mealie, 'token');
  assert.equal((await f.api('app-config/env-locks')).ai_shared, true);
  assert.equal((await f.api('mealie/mirror')).enabled, true);

  await f.stop();
  await f.start('rotated-fixture-key');
  const flags = await f.api('app-config/env-locks');
  assert.equal(flags.ai_shared, false);
  assert.equal(flags.ai_shared_secret_unreadable, true);
  await f.api('ai/chat', 'POST', { messages: [] }, 503);
  const mirror = await f.api('mealie/mirror');
  assert.equal(mirror.enabled, false);
  assert.equal(mirror.hasToken, false);
  assert.equal(mirror.error, 'secret_unreadable');
  assert.equal(f.stored(aiKey), encryptedAi);
  assert.equal(f.stored(mealieKey), encryptedMealie);
  await f.enableSharing();
  assert.equal((await f.api('app-config/env-locks')).ai_shared_secret_unreadable, false);
  assert.equal((await f.api('mealie/mirror')).enabled, true);
});

test('full backup omits shared credentials and restore keeps integrations disabled', async t => {
  const f = await fixture(t);
  await f.enableSharing();
  f.setting('mealieApiToken', 'distinct-personal-mealie-token');
  const { filename } = await f.api('full-backup', 'POST');
  const zip = new AdmZip(join(f.backupDir, filename));
  const json = zip.readAsText('database.json');
  const data = JSON.parse(json);
  assert.ok(!data.app_config.some(row => row.key === aiKey || row.key === mealieKey));
  assert.ok(!json.includes(aiSecret));
  assert.ok(!json.includes(mealieSecret));
  assert.ok(json.includes('distinct-personal-mealie-token'));

  await f.api('full-backup/' + filename + '/restore', 'POST');
  assert.equal(f.stored(aiKey), undefined);
  assert.equal(f.stored(mealieKey), undefined);
  assert.equal((await f.api('app-config/env-locks')).ai_shared, false);
  assert.equal((await f.api('mealie/mirror')).enabled, false);

  data.app_config.push({ key: aiKey, value: JSON.stringify(ai) }, { key: mealieKey, value: JSON.stringify(mealie) });
  zip.updateFile('database.json', Buffer.from(JSON.stringify(data)));
  zip.writeZip(join(f.backupDir, 'legacy.zip'));
  await f.api('full-backup/legacy.zip/restore', 'POST');
  assert.equal(f.stored(aiKey), undefined);
  assert.equal(f.stored(mealieKey), undefined);
});
