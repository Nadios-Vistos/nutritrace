// Fork (mode familial) : photos personnelles des aliments de référence.
// Une photo de repas gardée lors de la reconnaissance illustre ensuite les
// aliments reconnus, partout où le catalogue les affiche.

const SOURCES = new Set(['ciqual', 'fndds-atlas']);
export const FOOD_PHOTO_LIMIT = 300;

let current = {};

export function foodPhotoKey(food) {
  const source = food?.source_app || food?.source;
  const id = food?.source_external_id;
  return SOURCES.has(source) && id != null && id !== '' ? `${source}:${id}` : null;
}

/** Le magasin des réglages appelle ceci à chaque changement. */
export function setFoodPhotos(photos) {
  current = photos && typeof photos === 'object' && !Array.isArray(photos) ? photos : {};
}

export function foodPhotoFor(food) {
  const entry = current[foodPhotoKey(food)];
  return Array.isArray(entry) && typeof entry[0] === 'string' ? entry[0] : '';
}

/** Renvoie l'aliment avec sa photo personnelle, sans toucher à une image existante. */
export function withFoodPhoto(food) {
  if (!food || food.imgUrl) return food;
  const imgUrl = foodPhotoFor(food);
  return imgUrl ? { ...food, imgUrl } : food;
}

export function withFoodPhotos(foods) {
  for (const key in current) return foods.map(withFoodPhoto);
  return foods;
}

/**
 * Associe la photo d'un repas à ses aliments.
 * Une photo ne montrant qu'un aliment devient sa photo attitrée. Une photo
 * d'assiette composée n'illustre un aliment que s'il n'a pas déjà sa photo
 * attitrée. Les entrées les plus anciennes sortent au-delà de la limite.
 *
 * @param {Record<string, [string, 0|1]>} photos  valeur actuelle du réglage
 * @param {object[]} foods  aliments enregistrés depuis la photo
 * @param {string} url  adresse de la photo sur le serveur
 */
export function rememberMealPhoto(photos, foods, url) {
  const keys = [...new Set(foods.map(foodPhotoKey).filter(Boolean))];
  if (!url || !keys.length) return photos;
  const alone = keys.length === 1 && foods.length === 1 ? 1 : 0;
  const next = { ...(photos && typeof photos === 'object' && !Array.isArray(photos) ? photos : {}) };
  let changed = false;
  for (const key of keys) {
    if (!alone && next[key]?.[1] === 1) continue;
    delete next[key];
    next[key] = [url, alone];
    changed = true;
  }
  if (!changed) return photos;
  const overflow = Object.keys(next).length - FOOD_PHOTO_LIMIT;
  if (overflow > 0) for (const key of Object.keys(next).slice(0, overflow)) delete next[key];
  return next;
}

export function dataUrlToFile(dataUrl, name) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type: match[1] });
}
