const units = {
  ml: { factor: 1, precision: 0, label: 'ml' },
  oz: { factor: 29.5735, precision: 1, label: 'fl oz' },
  L: { factor: 1000, precision: 3, label: 'L' },
  G: { factor: 3785.41, precision: 4, label: 'G' },
};

const unitInfo = (unit) => Object.hasOwn(units, unit) ? units[unit] : units.ml;
export const waterUnitLabel = (unit) => unitInfo(unit).label;

export function waterInputValue(ml, unit) {
  const { factor, precision } = unitInfo(unit);
  return String(Number((ml / factor).toFixed(precision)));
}

export function parseWaterVolume(value, unit) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const ml = Math.round(Number(text) * unitInfo(unit).factor);
  return Number.isSafeInteger(ml) ? ml : null;
}

export function formatWater(ml, unit, locale) {
  const { precision, label } = unitInfo(unit);
  const number = new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: precision });
  return `${number.format(Number(waterInputValue(ml, unit)))} ${label}`;
}

const defaultContainers = {
  '1': ['Small Bottle', 'water_tracking.container_small'],
  '2': ['Standard Bottle', 'water_tracking.container_standard'],
  '3': ['Large Bottle', 'water_tracking.container_large'],
};

export function waterShortcuts(containers) {
  return containers.filter(container => !(String(container.id) === '4' &&
    container.name === 'Gallon Jug' && container.volumeMl === 3785));
}

export function waterContainerLabel(container, translate) {
  const preset = defaultContainers[container.id];
  return preset?.[0] === container.name ? translate(preset[1]) : container.name;
}
