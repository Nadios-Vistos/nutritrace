import references from './catalogues/portion-references.json' with { type: 'json' };
import { parseAltUnits, unitSystem } from './units.js';
import { atlasFoodId } from './portion-atlas.js';
import { pictogramPortions } from './portion-pictograms.js';

const byFdcId = new Map();
for (const reference of Object.values(references)) {
  if (!reference.fdc) continue;
  const key = String(reference.fdc);
  if (!byFdcId.has(key)) byFdcId.set(key, reference);
}

function referenceFor(food) {
  if (food.source_app === 'ciqual' || food.source === 'ciqual') {
    return Object.hasOwn(references, food.source_external_id) ? references[food.source_external_id] : undefined;
  }
  const fdcId = /^fdcId_(\d+)$/.exec(food.barcode || '')?.[1];
  return byFdcId.get(fdcId);
}

export function portionOptions(food, { unit = food?.unit || 'g', referenceSteps = false, atlasMeasures, category } = {}) {
  if (!food) return [];
  const options = [];
  const baseUnit = food.unit || 'g';
  const sameSystem = unitSystem(baseUnit);
  const altUnits = (parseAltUnits(food.alt_units) || []).filter(Boolean);
  const add = (option) => {
    if (Number.isFinite(option.amount) && option.amount > 0
        && !options.some(row => row.unit === option.unit && row.amount === option.amount)) {
      options.push(option);
    }
  };
  const declared = food.offServing;
  if (declared && sameSystem && unitSystem(declared.unit) === sameSystem) {
    add({ amount: declared.amount, unit: declared.unit, label: 'package', source: 'off' });
  }
  const packUnit = food.offPackUnit;
  if (packUnit && sameSystem && unitSystem(packUnit.unit) === sameSystem) {
    add({ amount: packUnit.amount, unit: packUnit.unit, label: 'packUnit', source: 'off' });
  }
  const baseIsWeighed = sameSystem === 'g' || altUnits.some(({ abbr, grams }) =>
    typeof abbr === 'string' && abbr.toLowerCase() === baseUnit.toLowerCase() && Number(grams) > 0);
  if (baseIsWeighed && food.nutrition_basis !== 'ml') {
    for (const { abbr, grams } of altUnits) {
      if (!abbr || typeof abbr !== 'string') continue;
      const label = abbr === 'serving' ? 'package' : abbr === 'package_unit' ? 'packUnit' : null;
      add({ amount: Number(grams), unit: 'g', label,
        customLabel: abbr, source: 'food' });
    }
    const reference = referenceFor(food);
    const measures = atlasFoodId(food) ? (food.portionMeasures ?? atlasMeasures) : reference?.portions;
    for (const [label, amount, image, localized, similar] of measures || []) {
      add({ amount, unit: 'g', label, image, localized, source: reference?.cnf ? 'cnf' : 'usda',
        ...(similar && image && { similar: true }) });
    }
  }
  // Aliment Ciqual sans mesure ni photo : repères visuels usuels par famille.
  if (!options.length && sameSystem === 'g' && food.nutrition_basis !== 'ml'
      && (food.source_app === 'ciqual' || food.source === 'ciqual')) {
    for (const row of pictogramPortions(food.category ? food : { ...food, category })) {
      add({ ...row, unit: 'g', source: 'pictogram' });
    }
  }
  if (!options.length && referenceSteps) {
    for (const amount of unit === 'ml' ? [125, 250, 375] : [50, 100, 150]) {
      add({ amount, unit, label: 'reference', source: 'default' });
    }
  }
  if (!options.length) {
    add({ amount: Number(food.portion) || 100, unit: baseUnit, label: 'reference', source: 'default' });
  }
  return options.sort((a, b) => a.amount - b.amount);
}

export function portionFraction(amount, fraction) {
  return Math.round(amount * fraction * 10000) / 10000;
}
