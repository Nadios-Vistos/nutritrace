import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createHttpServer } from 'node:http';
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

  async function request(path, method = 'GET', body, bearer = token) {
    const headers = { 'Content-Type': 'application/json' };
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    return fetch(base + '/api/' + path, { method, headers, body: JSON.stringify(body) });
  }

  async function api(path, method = 'GET', body, status = 200, bearer = token) {
    const response = await request(path, method, body, bearer);
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
    api, request, start, stop, backupDir, user,
    stored: key => db.prepare('SELECT value FROM app_config WHERE key = ?').get(key)?.value,
    seed: (key, config) => db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)').run(key, JSON.stringify(config)),
    setting,
    usePreviousDay(userId) {
      db.prepare('UPDATE family_ai_usage SET day = day - 1 WHERE user_id = ?').run(userId);
    },
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
  assertEncrypted(f.stored(aiKey), { ...ai, owner_user_id: f.user.id }, 'ai_api_key');
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

test('shared chat enforces a persistent per-account quota, resets each day and accepts unlimited', async t => {
  const f = await fixture(t);
  const calls = [];
  const upstream = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({ key: req.headers.authorization, model: JSON.parse(Buffer.concat(chunks)).model });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: 'fixture response' } }] }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => new Promise(resolve => upstream.close(resolve)));

  const member = { ...credentials, username: 'family-member' };
  await f.api('auth/register', 'POST', member);
  const { token: memberToken } = await f.api('auth/login', 'POST', member);
  assert.equal((await f.api('app-config/env-locks')).ai_shared_daily_limit, 60);
  await f.api('ai/family', 'PUT', { dailyLimit: 0 }, 403, memberToken);
  await f.api('ai/family', 'PUT', { dailyLimit: -1 }, 400);
  await f.api('settings/bulk', 'PUT', { settings: {
    aiProvider: 'oai-compat', aiModel: 'local-fixture', aiApiKey: aiSecret,
    aiBaseUrl: 'http://127.0.0.1:' + upstream.address().port,
  } });
  await f.api('ai/family', 'PUT', { enabled: true, dailyLimit: 2 });
  await f.api('settings', 'PUT', { key: 'aiModel', value: 'member-model' }, 200, memberToken);

  const message = { messages: [{ role: 'user', content: 'fixture' }] };
  const chat = bearer => f.api('ai/chat', 'POST', message, 200, bearer);
  await chat();
  await chat();
  assert.deepEqual(calls, [
    { key: 'Bearer ' + aiSecret, model: 'local-fixture' },
    { key: 'Bearer ' + aiSecret, model: 'local-fixture' },
  ]);
  await f.stop();
  await f.start();
  const blocked = await f.request('ai/chat', 'POST', message);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await blocked.json()).code, 'family_ai_daily_quota');
  assert.equal(calls.length, 2);
  await chat(memberToken);

  f.usePreviousDay(f.user.id);
  await chat();
  await chat();
  await f.api('ai/chat', 'POST', message, 429);
  await f.api('ai/family', 'PUT', { dailyLimit: 0 });
  await chat();
  await chat();
  assert.equal(calls.length, 7);
  await f.api('ai/family', 'PUT', { dailyLimit: 4 });
  await f.api('ai/chat', 'POST', message, 429);
});

test('legacy shares can link an administrator and refresh when their saved AI settings change', async t => {
  const f = await fixture(t);
  f.seed(aiKey, ai);
  const stored = () => JSON.parse(f.stored(aiKey));
  assert.equal((await f.api('app-config/env-locks')).ai_shared_needs_link, true);
  await f.api('settings/bulk', 'PUT', { settings: { aiProvider: 'openai', aiModel: 'before-link', aiApiKey: aiSecret } });
  assert.equal(stored().ai_model, ai.ai_model);
  assert.equal((await f.api('ai/family', 'PUT', { enabled: true })).ai_shared_needs_link, false);
  assertEncrypted(f.stored(aiKey), { ...ai, ai_model: 'before-link', owner_user_id: f.user.id }, 'ai_api_key');

  await f.api('settings', 'PUT', { key: 'aiModel', value: 'after-link' });
  assert.equal(stored().ai_model, 'after-link');
  await f.api('settings/bulk', 'PUT', { settings: { aiProvider: 'gemini', aiModel: 'new-provider-model' } });
  assert.equal(stored().ai_provider, 'openai');
  const newKey = 'fixture-new-provider-key';
  await f.api('sync/push', 'POST', { settings: [{ key: 'aiApiKey', value: newKey }] });
  assertEncrypted(f.stored(aiKey), {
    ...ai, ai_provider: 'gemini', ai_model: 'new-provider-model', ai_api_key: newKey, owner_user_id: f.user.id,
  }, 'ai_api_key');
});
