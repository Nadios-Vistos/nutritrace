import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOOD_PHOTO_LIMIT, dataUrlToFile, foodPhotoKey, rememberMealPhoto, setFoodPhotos, withFoodPhoto, withFoodPhotos,
} from '../src/lib/food-photos.js';
import { searchCiqual } from '../src/lib/ciqual.js';

const rice = { name: 'Riz blanc, cuit', source: 'ciqual', source_external_id: '9104' };
const chicken = { name: 'Poulet, rôti', source_app: 'ciqual', source_external_id: '36005' };

test('only reference catalogue foods get a key', () => {
  assert.equal(foodPhotoKey(rice), 'ciqual:9104');
  assert.equal(foodPhotoKey({ source_app: 'fndds-atlas', source_external_id: 12 }), 'fndds-atlas:12');
  assert.equal(foodPhotoKey({ source: 'off', source_external_id: '301' }), null);
  assert.equal(foodPhotoKey({ source: 'ciqual' }), null);
});

test('a photo of a single food becomes its own photo', () => {
  assert.deepEqual(rememberMealPhoto({}, [rice], '/uploads/a.jpg'), { 'ciqual:9104': ['/uploads/a.jpg', 1] });
});

test('a plate photo illustrates its foods but never replaces a dedicated photo', () => {
  const own = rememberMealPhoto({}, [rice], '/uploads/rice.jpg');
  const plate = rememberMealPhoto(own, [rice, chicken], '/uploads/plate.jpg');
  assert.deepEqual(plate, { 'ciqual:9104': ['/uploads/rice.jpg', 1], 'ciqual:36005': ['/uploads/plate.jpg', 0] });
  const newer = rememberMealPhoto(plate, [chicken, rice], '/uploads/plate2.jpg');
  assert.equal(newer['ciqual:36005'][0], '/uploads/plate2.jpg');
  assert.equal(rememberMealPhoto(plate, [chicken], '/uploads/chicken.jpg')['ciqual:36005'][1], 1);
});

test('nothing changes without a photo or a catalogue food', () => {
  const photos = { 'ciqual:9104': ['/uploads/a.jpg', 1] };
  assert.equal(rememberMealPhoto(photos, [rice], ''), photos);
  assert.equal(rememberMealPhoto(photos, [{ name: 'Maison' }], '/uploads/b.jpg'), photos);
  assert.equal(rememberMealPhoto(photos, [rice, chicken].slice(0, 1).concat(rice), '/uploads/b.jpg'), photos);
});

test('the oldest photos leave once the limit is reached', () => {
  let photos = {};
  for (let id = 0; id <= FOOD_PHOTO_LIMIT; id++) {
    photos = rememberMealPhoto(photos, [{ source: 'ciqual', source_external_id: String(id) }], `/uploads/${id}.jpg`);
  }
  assert.equal(Object.keys(photos).length, FOOD_PHOTO_LIMIT);
  assert.equal(photos['ciqual:0'], undefined);
  assert.ok(photos[`ciqual:${FOOD_PHOTO_LIMIT}`]);
});

test('catalogue searches return foods with their personal photo', t => {
  t.after(() => setFoodPhotos({}));
  const catalogue = { foods: [{ ...rice, searchName: 'riz blanc cuit' }, { ...chicken, searchName: 'poulet roti' }] };
  assert.equal(searchCiqual(catalogue, 'riz')[0].imgUrl, undefined);
  setFoodPhotos({ 'ciqual:9104': ['/uploads/a.jpg', 1] });
  assert.equal(searchCiqual(catalogue, 'riz')[0].imgUrl, '/uploads/a.jpg');
  assert.equal(searchCiqual(catalogue, 'poulet')[0].imgUrl, undefined);
  assert.equal(withFoodPhoto({ ...rice, imgUrl: '/own.png' }).imgUrl, '/own.png');
  setFoodPhotos(['not', 'a', 'map']);
  assert.equal(withFoodPhotos(catalogue.foods), catalogue.foods);
});

test('a data URL becomes an uploadable file', () => {
  const file = dataUrlToFile('data:image/jpeg;base64,/9j/4A==', 'repas.jpg');
  assert.equal(file.type, 'image/jpeg');
  assert.equal(file.name, 'repas.jpg');
  assert.equal(file.size, 4);
  assert.equal(dataUrlToFile('nope', 'x'), null);
});
