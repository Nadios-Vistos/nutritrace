import db from '../db.js';
import { fetchChecked, readBody, serviceBase } from './ssrf-guard.js';
import { MEALIE_MIRROR_KEY, readSharedConfig, writeSharedConfig } from './shared-config-secrets.js';
import { detectImageTypeFromBuffer } from './image-magic.js';

const STATUS = 'mealie_mirror_status';
const PAGE_SIZE = 100;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const RECIPE_ID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const readConfig = db.prepare('SELECT value FROM app_config WHERE key = ?');
const writeConfig = db.prepare(`INSERT INTO app_config (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
const recipeById = db.prepare('SELECT payload FROM mealie_recipes WHERE id = ?');
let running = null;

function read(key) {
  return JSON.parse(readConfig.get(key)?.value || '{}');
}

export function mirrorStatus() {
  const saved = readSharedConfig(MEALIE_MIRROR_KEY);
  const { url = '', token, enabled = false } = saved?.config ?? {};
  return {
    ...(saved ? read(STATUS) : {}), url, enabled: enabled && !!token, hasToken: !!token, running: !!running,
    ...(saved?.unreadable ? { error: 'secret_unreadable' } : {}),
    count: db.prepare('SELECT COUNT(*) AS n FROM mealie_recipes').get().n,
  };
}

export function configureMirror({ url, token, enabled }) {
  const prior = readSharedConfig(MEALIE_MIRROR_KEY)?.config ?? {};
  const base = serviceBase(typeof url === 'string' ? url.trim() : '');
  if (!base || typeof enabled !== 'boolean' || (token != null && typeof token !== 'string')) return false;
  const supplied = token?.trim();
  const nextToken = supplied || (base === prior.url ? prior.token : '');
  if (enabled && !nextToken) return false;
  if (nextToken && (nextToken.length > 4096 || /[\s\u0000-\u001f]/.test(nextToken))) return false;
  const next = { url: base, token: nextToken, enabled };
  if (JSON.stringify(next) !== JSON.stringify(prior)) {
    writeSharedConfig(MEALIE_MIRROR_KEY, next);
    writeConfig.run(STATUS, '{}');
  }
  return true;
}

export function mirrorRecipes() {
  return db.prepare('SELECT id, payload FROM mealie_recipes ORDER BY name COLLATE NOCASE').all()
    .map(({ id, payload }) => {
      // Existing rows and backups may still carry the old internal URL.
      const recipe = JSON.parse(payload);
      return { ...recipe, imgUrl: recipe.imgUrl && RECIPE_ID.test(id) ? imageUrl(id) : '' };
    });
}

const imageUrl = id => `/api/mealie/library/${encodeURIComponent(id)}/image`;

export async function fetchMirrorRecipeImage(id) {
  const row = RECIPE_ID.test(id) && recipeById.get(id);
  if (!row || !JSON.parse(row.payload)?.imgUrl) return { status: 404 };
  const config = readSharedConfig(MEALIE_MIRROR_KEY)?.config;
  const url = serviceBase(config?.url);
  if (!config?.enabled || !config.token || !url) return { status: 404 };

  try {
    const response = await fetchMirror(
      { url, token: config.token },
      `/api/media/recipes/${encodeURIComponent(id)}/images/original.webp`,
      'image/*',
    );
    const contentType = response.headers.get('content-type')?.toLowerCase();
    const size = Number(response.headers.get('content-length'));
    if (!response.ok || !contentType?.startsWith('image/') || size > MAX_IMAGE_BYTES) {
      await response.body?.cancel();
      return { status: response.status === 404 ? 404 : 502 };
    }
    const bytes = await readBody(response, MAX_IMAGE_BYTES);
    const type = detectImageTypeFromBuffer(bytes);
    return type ? { status: 200, type: `image/${type}`, bytes } : { status: 502 };
  } catch {
    return { status: 502 };
  }
}

const nutritionKeys = {
  calories: 'calories', proteinContent: 'proteins', carbohydrateContent: 'carbohydrates',
  fatContent: 'fat', saturatedFatContent: 'saturated-fat', fiberContent: 'fiber',
  sugarContent: 'sugars', sodiumContent: 'sodium', cholesterolContent: 'cholesterol',
  transFatContent: 'trans-fat',
};

function nutrient(value, key) {
  if (value == null || value === '') return undefined;
  const match = String(value).trim().match(/^(\d+(?:[.,]\d+)?)\s*(kcal|kj|calories?|g|mg|[µμu]g)?$/i);
  if (!match) return undefined;
  const amount = Number(match[1].replace(',', '.'));
  const unit = match[2]?.toLowerCase();
  if (!Number.isFinite(amount)) return undefined;
  if (key === 'calories') return unit === 'kj' ? amount / 4.184 : !unit || unit === 'kcal' || unit.startsWith('calorie') ? amount : undefined;
  const mass = key === 'sodium' || key === 'cholesterol' ? 'mg' : 'g';
  if (!unit || unit === mass) return amount;
  if (unit === 'mg' && mass === 'g') return amount / 1000;
  if (unit === 'g' && mass === 'mg') return amount * 1000;
  if (/^[µμu]g$/.test(unit)) return amount / (mass === 'g' ? 1e6 : 1e3);
}

function mapRecipe(detail) {
  const nutrition = {};
  for (const [key, name] of Object.entries(nutritionKeys)) {
    const value = nutrient(detail.nutrition?.[key], name);
    if (value != null) nutrition[name] = value;
  }
  const ingredients = (detail.recipeIngredient || []).flatMap(item => {
    const name = item.food?.name || item.display || item.note || item.originalText;
    return name ? [{
      name: String(name).slice(0, 300), portion: Number(item.quantity) || 1, quantity: 1,
      unit: item.unit?.abbreviation || item.unit?.name || '', nutrition: {}, notes: item.food ? item.note || '' : '',
    }] : [];
  });
  const steps = (detail.recipeInstructions || []).map(step => step.text).filter(Boolean);
  const servings = Number(detail.recipeServings) || null;
  return {
    name: detail.name, portion: 1, unit: 'serving', servings, nutrition, items: ingredients,
    notes: [detail.description, ...steps.map((step, index) => `${index + 1}. ${step}`)].filter(Boolean).join('\n\n'),
    source_app: 'mealie-mirror', source_external_id: detail.id,
    imgUrl: detail.image ? imageUrl(detail.id) : '',
    is_recipe: true, _shared_by: 'Mealie',
  };
}

function fetchMirror(config, path, accept) {
  return fetchChecked(config.url + path, {
    headers: { Authorization: `Bearer ${config.token}`, Accept: accept },
    signal: AbortSignal.timeout(15000),
  }, { allowPrivate: true, sameOrigin: true, maxRedirects: 2 });
}

async function request(config, path) {
  const response = await fetchMirror(config, path, 'application/json');
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error([401, 403].includes(response.status) ? 'unauthorized' : 'unavailable');
  }
  return JSON.parse((await readBody(response, 5 * 1024 * 1024)).toString('utf8'));
}

async function synchronise(config) {
  const recipes = new Map();
  let expected = null;
  for (let page = 1; ; page++) {
    const data = await request(config, `/api/recipes?perPage=${PAGE_SIZE}&page=${page}&orderBy=id&orderDirection=asc`);
    const pages = data.total_pages ?? data.totalPages;
    const total = data.total;
    if (!Array.isArray(data.items) || !Number.isInteger(pages) || pages < 0 || pages > 500 ||
        !Number.isInteger(total) || total < 0 || (pages === 0 && total > 0)) throw new Error('invalid');
    // The catalogue changed between two pages: this snapshot cannot be trusted.
    expected ??= { pages, total };
    if (expected.pages !== pages || expected.total !== total) throw new Error('invalid');
    for (const recipe of data.items) {
      if (!RECIPE_ID.test(recipe?.id) ||
          typeof recipe.slug !== 'string' || !/^[\p{L}\p{N}_-]+$/u.test(recipe.slug) ||
          recipes.has(recipe.id)) throw new Error('invalid');
      recipes.set(recipe.id, recipe);
    }
    if (page >= pages) {
      if (recipes.size !== total) throw new Error('invalid');
      break;
    }
  }

  const previous = new Map(db.prepare('SELECT id, revision FROM mealie_recipes').all().map(row => [row.id, row.revision]));
  const changes = [];
  for (const [id, recipe] of recipes) {
    const stamp = recipe.updatedAt || recipe.dateUpdated;
    const revision = stamp ? JSON.stringify([config.url, recipe.slug, stamp, recipe.image]) : null;
    if (revision && previous.get(id) === revision) continue;
    const detail = await request(config, '/api/recipes/' + encodeURIComponent(recipe.slug));
    if (detail?.id !== id || typeof detail.name !== 'string' || !detail.name.trim() ||
        !Array.isArray(detail.recipeIngredient) ||
        (detail.recipeInstructions != null && !Array.isArray(detail.recipeInstructions))) throw new Error('invalid');
    const mapped = mapRecipe(detail);
    changes.push([id, mapped.name, revision, JSON.stringify(mapped)]);
  }

  // A partial download must never be mistaken for deletions in Mealie.
  if (JSON.stringify(config) !== JSON.stringify(readSharedConfig(MEALIE_MIRROR_KEY)?.config)) return;
  db.transaction(() => {
    const upsert = db.prepare(`INSERT INTO mealie_recipes (id, name, revision, payload) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, revision = excluded.revision, payload = excluded.payload`);
    for (const row of changes) upsert.run(...row);
    const remove = db.prepare('DELETE FROM mealie_recipes WHERE id = ?');
    for (const id of previous.keys()) if (!recipes.has(id)) remove.run(id);
    writeConfig.run(STATUS, JSON.stringify({ lastSync: new Date().toISOString() }));
  })();
}

export function syncMealieMirror() {
  if (running) return running;
  const config = readSharedConfig(MEALIE_MIRROR_KEY)?.config;
  if (!config?.enabled || !config.token) return Promise.resolve();
  running = synchronise(config).catch(error => {
    if (JSON.stringify(config) !== JSON.stringify(readSharedConfig(MEALIE_MIRROR_KEY)?.config)) return;
    const reason = ['invalid', 'unauthorized'].includes(error.message) ? error.message : 'unavailable';
    writeConfig.run(STATUS, JSON.stringify({ ...read(STATUS), error: reason }));
  }).finally(() => { running = null; });
  return running;
}
