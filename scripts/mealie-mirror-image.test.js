import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { readSource } from './fixtures/source-text.js';

const dir = mkdtempSync(join(tmpdir(), 'nt-mealie-image-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.UPLOADS_PATH = join(dir, 'uploads');
process.env.JWT_SECRET = 'mealie-mirror-image-test-only';
const { default: db } = await import('../server/db.js');
const { configureMirror, syncMealieMirror } = await import('../server/lib/mealie-mirror.js');
const { authenticate, signToken } = await import('../server/middleware/auth.js');
const { csrfProtect } = await import('../server/middleware/csrf.js');
const { default: mealie } = await import('../server/routes/mealie.js');
const { default: foods } = await import('../server/routes/foods.js');
const { default: upload } = await import('../server/routes/upload.js');
const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const prefix = '/nutri';
const id = 'aabbccdd-1234-4567-8abc-000000000001';
const legacyId = 'aabbccdd-1234-4567-8abc-000000000002';
const noPhotoId = 'aabbccdd-1234-4567-8abc-000000000003';
const imagePath = id => '/api/mealie/library/' + id + '/image';
const upstreamPath = id => '/api/media/recipes/' + id + '/images/original.webp';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=', 'base64');
const recipes = [
  { id, slug: 'current', name: 'Current recipe', image: 'v1', updatedAt: 'v1' },
  { id: legacyId, slug: 'legacy', name: 'Legacy recipe', image: 'v1', updatedAt: 'v1' },
  { id: noPhotoId, slug: 'no-photo', name: 'No photo', updatedAt: 'v1' },
].map(recipe => ({ ...recipe, recipeServings: 4, recipeIngredient: [], nutrition: { calories: '275 kcal' } }));
const calls = [];
let origin;
let upstreamBase;
let upstream;
let server;
let replyToImage;
const normalImage = res => res.writeHead(200, { 'Content-Type': 'image/png' }).end(image);
let token;
let member;
const headers = () => ({ Authorization: 'Bearer ' + token });

async function start(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

test.before(async () => {
  upstream = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    calls.push({ path, authorization: req.headers.authorization });
    if (req.headers.authorization !== 'Bearer mirror-token') return res.writeHead(401).end();
    if (path.startsWith('/api/media/')) return replyToImage(res);
    const body = path === '/api/recipes'
      ? { items: recipes, total: recipes.length, total_pages: 1 }
      : recipes.find(recipe => path === '/api/recipes/' + recipe.slug);
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  });
  upstreamBase = await start(upstream);
  assert.equal(configureMirror({ url: upstreamBase, token: 'mirror-token', enabled: true }), true);
  await syncMealieMirror();
  const oldRow = db.prepare('SELECT payload FROM mealie_recipes WHERE id = ?').get(legacyId);
  const oldRecipe = { ...JSON.parse(oldRow.payload), imgUrl: 'http://old-mealie.invalid' + upstreamPath(legacyId) };
  db.prepare('UPDATE mealie_recipes SET payload = ? WHERE id = ?').run(JSON.stringify(oldRecipe), legacyId);

  db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('member', 'fixture', 'user')").run();
  member = db.prepare("SELECT * FROM users WHERE username = 'member'").get();
  token = signToken(member);
  const app = express();
  const router = express.Router();
  router.use(express.json(), cookieParser(), authenticate, csrfProtect);
  router.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use('/api/mealie', mealie);
  router.use('/api/foods', foods);
  router.use('/api/upload', upload);
  app.use(prefix, router);
  server = createServer(app);
  origin = await start(server);
});

test.beforeEach(() => {
  calls.length = 0;
  replyToImage = normalImage;
});

test.after(async () => {
  await Promise.all([upstream, server].filter(Boolean).map(server => new Promise(resolve => server.close(resolve))));
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function instanceFetch(path, options) {
  return fetch(origin + prefix + path, options);
}

async function library() {
  const response = await instanceFetch('/api/mealie/library', { headers: headers() });
  assert.equal(response.status, 200);
  return response.json();
}

test('the mirror exposes local image URLs for new rows and legacy backups', async () => {
  const stored = db.prepare('SELECT payload FROM mealie_recipes WHERE id = ?').get(id);
  assert.equal(JSON.parse(stored.payload).imgUrl, imagePath(id));
  const entries = new Map((await library()).map(recipe => [recipe.source_external_id, recipe]));
  assert.equal(entries.get(id).imgUrl, imagePath(id));
  assert.equal(entries.get(legacyId).imgUrl, imagePath(legacyId));
  assert.equal(entries.get(noPhotoId).imgUrl, '');
});

test('images require a session and a mirrored UUID with a photo', async () => {
  const anonymous = await instanceFetch(imagePath(id));
  assert.equal(anonymous.status, 401);
  await anonymous.body?.cancel();
  for (const rejected of [noPhotoId, 'aabbccdd-1234-4567-8abc-000000000099', 'current', '%2E%2E%2Fsettings']) {
    const response = await instanceFetch(imagePath(rejected), { headers: headers() });
    assert.equal(response.status, 404);
  }
  assert.deepEqual(calls, []);
});

test('the image uses the configured token and private browser caching', async () => {
  const response = await instanceFetch(imagePath(legacyId) + '?url=https://outside.invalid', { headers: headers() });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.match(response.headers.get('cache-control'), /^private, max-age=\d+$/);
  assert.match(response.headers.get('vary'), /Cookie/);
  assert.match(response.headers.get('vary'), /Authorization/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  assert.deepEqual(calls, [{ path: upstreamPath(legacyId), authorization: 'Bearer mirror-token' }]);
});

test('the mirror refuses redirects to other origins', async t => {
  let redirected = false;
  const other = createServer((_req, res) => {
    redirected = true;
    normalImage(res);
  });
  t.after(() => new Promise(resolve => other.close(resolve)));
  const destination = await start(other);
  replyToImage = res => res.writeHead(302, { Location: destination + '/unexpected' }).end();
  const response = await instanceFetch(imagePath(id), { headers: headers() });
  assert.equal(response.status, 502);
  assert.equal(redirected, false);
  assert.deepEqual(calls, [{ path: upstreamPath(id), authorization: 'Bearer mirror-token' }]);
});

test('disabling the mirror stops on-demand image requests to Mealie', async t => {
  t.after(() => configureMirror({ url: upstreamBase, enabled: true }));
  assert.equal(configureMirror({ url: upstreamBase, enabled: false }), true);
  const response = await instanceFetch(imagePath(id), { headers: headers() });
  assert.equal(response.status, 404);
  assert.deepEqual(calls, []);
});

test('missing, non-image, SVG and oversized upstream responses are not served', async t => {
  const invalid = [
    ['missing', 404, res => res.writeHead(404).end()],
    ['HTML', 502, res => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>')],
    ['spoofed MIME', 502, res => res.writeHead(200, { 'Content-Type': 'image/webp' }).end('<html>not an image</html>')],
    ['SVG', 502, res => res.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['oversized length', 502, res => res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': 11 * 1024 * 1024 }).end(image)],
    ['oversized chunked body', 502, res => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.write(image);
      res.end(Buffer.alloc(10 * 1024 * 1024));
    }],
  ];
  for (const [name, status, reply] of invalid) {
    await t.test(name, async () => {
      replyToImage = reply;
      const response = await instanceFetch(imagePath(id), { headers: headers() });
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await response.text(), '');
    });
  }
});

function client(native) {
  const source = readSource(new URL('../src/lib/api.js', import.meta.url))
    .replace(/^import .*;\n/gm, '').replace(/^export \{ API, USDA \};$/m, '').replace(/^export const NtApi /m, 'const NtApi ');
  const external = [];
  const API = runInNewContext(source + '\nAPI;', {
    isNative: native, getServerUrl: () => origin + prefix, getAuthToken: () => token,
    apiUrl: path => native ? origin + prefix + path : prefix + path,
    resolveAssetUrl: path => path,
    createOfflineApi: http => http,
    localStorage: { getItem: key => key === 'nt:csrf' ? jwt.decode(token).csrf : null },
    FormData,
    fetch(url, options) {
      const target = new URL(url, origin);
      const requestHeaders = new Headers(options.headers);
      if (target.origin !== origin) {
        external.push(requestHeaders);
        return Promise.resolve(new Response(image, { headers: { 'Content-Type': 'image/png' } }));
      }
      if (!native && options.credentials === 'include') requestHeaders.set('Cookie', 'nt_token=' + token);
      return fetch(target, { ...options, headers: requestHeaders });
    },
  });
  return { API, external };
}

test('the web client imports a private food and uploads its mirror photo with the session cookie', async () => {
  const { API } = client(false);
  const recipe = (await library()).find(recipe => recipe.source_external_id === id);
  const saved = await API.importMirroredRecipe(recipe);
  assert.equal(saved.name, 'Current recipe');
  assert.deepEqual(saved.nutrition, { calories: 275 });
  assert.equal(saved.source_external_id, id);
  assert.equal(saved.user_id, member.id);
  assert.equal(saved.visibility, 'private');
  assert.match(saved.imgUrl, /^\/uploads\/.+\.png$/);
  assert.deepEqual(readFileSync(join(process.env.UPLOADS_PATH, saved.imgUrl.split('/').at(-1))), image);
  assert.deepEqual(calls, [{ path: upstreamPath(id), authorization: 'Bearer mirror-token' }]);
});

test('Android downloads mirror blobs with Bearer auth and keeps that token away from external images', async () => {
  const { API, external } = client(true);
  const blob = await API._fetchImageBlob(imagePath(id));
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), image);
  await API._fetchImageBlob('https://external.invalid' + imagePath(id));
  assert.equal(external[0].has('Authorization'), false);
});
