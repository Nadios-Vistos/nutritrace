import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PICTOGRAM_FAMILIES, pictogramFamily, pictogramPortions } from '../src/lib/portion-pictograms.js';
import { PICTOGRAM_IDS, pictogramMarkup } from '../src/lib/portion-pictogram-art.js';
import { portionOptions } from '../src/lib/portions.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const food = (name, category, extra = {}) => ({
  name, category, source: 'ciqual', source_external_id: 'x', portion: 100, unit: 'g', nutrition: { calories: 100 }, ...extra,
});

test('each food family gets the expected visual cue', () => {
  const cases = [
    ['Riz blanc, cuit', 'produits céréaliers', 'plate'],
    ['Riz blanc, cru', 'produits céréaliers', null],
    ['Pain, baguette, courante', 'produits céréaliers', 'bread'],
    ['Pain au chocolat feuilleté, artisanal', 'produits céréaliers', null],
    ['Muesli floconneux aux fruits', 'produits céréaliers', 'cereal'],
    ['Boeuf, steak haché 15% MG, cuit', 'viandes, oeufs, poissons', 'palm'],
    ['Saucisson sec', 'viandes, oeufs, poissons', null],
    ['Oeuf à la coque', 'viandes, oeufs, poissons', 'egg'],
    ["Oeuf d'oie, cru", 'viandes, oeufs, poissons', null],
    ['Lasagnes à la bolognaise', 'entrées et plats composés', 'plate'],
    ['Pizza jambon fromage', 'entrées et plats composés', null],
    ['Soupe aux légumes variés, préemballée à réchauffer', 'entrées et plats composés', 'soup'],
    ['Soupe aux légumes variés, déshydratée', 'entrées et plats composés', null],
    ['Carotte, cuite', 'fruits, légumes, légumineuses et oléagineux', 'plate'],
    ['Pomme, chair et peau, crue', 'fruits, légumes, légumineuses et oléagineux', 'produce'],
    ['Amande, grillée, salée', 'fruits, légumes, légumineuses et oléagineux', 'handful'],
    ['Lentille, sèche', 'fruits, légumes, légumineuses et oléagineux', null],
    ['Camembert au lait cru', 'produits laitiers', 'cheese'],
    ['Yaourt nature', 'produits laitiers', 'pot'],
    ['Lait demi-écrémé, UHT', 'produits laitiers', 'drink'],
    ['Lait en poudre, entier', 'produits laitiers', null],
    ["Huile d'olive vierge extra", 'matières grasses', 'spoon'],
    ['Miel', 'produits sucrés', 'spread'],
    ['Biscuit sec nature', 'produits sucrés', null],
    ['Glace ou crème glacée, en bac', 'glaces et sorbets', 'scoop'],
    ['Sorbet, cône', 'glaces et sorbets', null],
    ['Vin rouge', 'eaux et autres boissons', null],
  ];
  for (const [name, category, family] of cases) {
    assert.equal(pictogramFamily(food(name, category)), family, name);
  }
  assert.equal(pictogramFamily(food('Jus de pomme, pur jus', 'eaux et autres boissons', { nutrition: { beverage_ml: 100 } })), 'drink');
  assert.equal(pictogramFamily({ name: 'Riz' }), null);
  assert.equal(pictogramFamily(null), null);
});

test('every cue has a drawing, increasing weights and a label in both languages', () => {
  const labels = { en: read('../src/i18n/en.json').portions.labels, fr: read('../src/i18n/fr.json').portions.labels };
  for (const [family, rows] of Object.entries(PICTOGRAM_FAMILIES)) {
    assert.deepEqual(rows.map(row => row[1]), [...rows.map(row => row[1])].sort((a, b) => a - b), family);
    for (const [pictogram, grams, label] of rows) {
      assert.ok(PICTOGRAM_IDS.includes(pictogram), pictogram);
      assert.match(pictogramMarkup(pictogram), /^<(path|circle|rect|ellipse|clipPath)/);
      assert.ok(grams > 0 && grams <= 400, `${family} ${grams}`);
      assert.ok(labels.en[label] && labels.fr[label], `label ${label}`);
    }
  }
  assert.equal(pictogramMarkup('missing'), '');
  assert.equal(pictogramMarkup('constructor'), '');
});

test('the portion picker offers cues only when a Ciqual food has no measure of its own', () => {
  const rice = portionOptions(food('Riz blanc, cuit', 'produits céréaliers'));
  assert.deepEqual(rice.map(row => [row.amount, row.unit, row.pictogram, row.source]),
    [[100, 'g', 'plate-1', 'pictogram'], [200, 'g', 'plate-2', 'pictogram'], [300, 'g', 'plate-3', 'pictogram']]);

  const references = read('../src/lib/catalogues/portion-references.json');
  const [code, reference] = Object.entries(references).find(([, row]) => row.portions?.length);
  const measured = portionOptions(food('Aliment avec mesures', 'produits céréaliers', { source_external_id: code }));
  assert.ok(measured.length >= reference.portions.length);
  assert.ok(measured.every(row => !row.pictogram));

  assert.ok(portionOptions(food('Saucisson sec', 'viandes, oeufs, poissons')).every(row => !row.pictogram));
  assert.ok(portionOptions({ ...food('Riz blanc, cuit', 'produits céréaliers'), source: 'off' }).every(row => !row.pictogram));
});

test('a diary item without its category uses the one looked up by the picker', () => {
  const item = food('Yaourt nature', undefined);
  assert.ok(portionOptions(item).every(row => !row.pictogram));
  assert.deepEqual(portionOptions(item, { category: 'produits laitiers' }).map(row => row.pictogram), ['pot-1', 'pot-2']);
  assert.deepEqual(pictogramPortions(food('Yaourt nature', 'produits laitiers')).map(row => row.label), ['pot', 'twoPots']);
});
