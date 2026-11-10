// Fork (mode familial) : dessins des repères de portion (viewBox 0 0 64 64).
// Traits en currentColor, quantité en var(--accent) : les pictogrammes
// suivent le thème clair ou sombre sans image à charger.

const LINE = 'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';
const SOFT = 'fill="var(--accent)" fill-opacity=".85"';
const FAINT = 'fill="currentColor" fill-opacity=".1"';

function plate(quarters) {
  const end = [[58, 32], [32, 58], [6, 32]][quarters - 1];
  const sweep = `M32 32 L32 12 A20 20 0 ${quarters > 2 ? 1 : 0} 1 ${32 + (end[0] - 32) * 20 / 26} ${32 + (end[1] - 32) * 20 / 26} Z`;
  return `<circle cx="32" cy="32" r="27" ${LINE}/><circle cx="32" cy="32" r="20" ${FAINT}/><path d="${sweep}" ${SOFT}/>`;
}

function vessel(outline, liquid) {
  return `<path d="${liquid}" ${SOFT}/><path d="${outline}" ${LINE}/>`;
}

function palm(level) {
  const fingers = [18, 26, 34, 42].map((x, index) =>
    `<rect x="${x}" y="${[12, 7, 9, 14][index]}" width="6" height="26" rx="3" ${LINE}/>`).join('');
  const hand = `${fingers}<path d="M16 34 h34 v14 a10 10 0 0 1 -10 10 h-12 a12 12 0 0 1 -12 -12 Z" ${LINE}/>`
    + `<path d="M16 42 l-7 -7 a3.5 3.5 0 0 1 5 -5 l6 5" ${LINE}/>`;
  const zone = level === 1 ? '<path d="M19 46 h28 v2 a8 8 0 0 1 -8 8 h-10 a10 10 0 0 1 -10 -10 Z"'
    : level === 2 ? '<path d="M19 36 h28 v12 a8 8 0 0 1 -8 8 h-10 a10 10 0 0 1 -10 -10 Z"'
    : '<path d="M19 22 h28 v26 a8 8 0 0 1 -8 8 h-10 a10 10 0 0 1 -10 -10 Z"';
  return `${zone} ${SOFT}/>${hand}`;
}

function repeated(count, draw) {
  const width = 64 / count;
  return Array.from({ length: count }, (_, index) => draw(width * index + width / 2, Math.min(1, 2.2 / count))).join('');
}

const egg = (count) => repeated(count, (cx, scale) =>
  `<path d="M${cx} ${32 - 20 * scale} c${9 * scale} 0 ${14 * scale} ${14 * scale} ${14 * scale} ${24 * scale} a${14 * scale} ${14 * scale} 0 0 1 ${-28 * scale} 0 c0 ${-10 * scale} ${5 * scale} ${-24 * scale} ${14 * scale} ${-24 * scale} Z" ${SOFT}/>`
  + `<path d="M${cx} ${32 - 20 * scale} c${9 * scale} 0 ${14 * scale} ${14 * scale} ${14 * scale} ${24 * scale} a${14 * scale} ${14 * scale} 0 0 1 ${-28 * scale} 0 c0 ${-10 * scale} ${5 * scale} ${-24 * scale} ${14 * scale} ${-24 * scale} Z" ${LINE}/>`);

const wedge = (count) => repeated(count, (cx, scale) => {
  const w = Math.min(24 * scale, 64 / count / 2 - 3);
  const shape = `M${cx - w} ${32 + 12 * scale} L${cx + w} ${32 - 14 * scale} V${32 + 12 * scale} Z`;
  return `<path d="${shape}" ${SOFT}/><path d="${shape}" ${LINE}/>`
    + `<circle cx="${cx + w * .45}" cy="${32 + 3 * scale}" r="${3 * scale}" fill="currentColor" fill-opacity=".35"/>`;
});

const pot = (count) => repeated(count, (cx, scale) => {
  const top = 13 * scale, bottom = 10 * scale, height = 30 * scale, y = 32 - height / 2 + 3 * scale;
  return `<path d="M${cx - top + 2} ${y + 8 * scale} L${cx - bottom} ${y + height} H${cx + bottom} L${cx + top - 2} ${y + 8 * scale} Z" ${SOFT}/>`
    + `<path d="M${cx - top} ${y} L${cx - bottom} ${y + height} H${cx + bottom} L${cx + top} ${y} Z" ${LINE}/>`
    + `<path d="M${cx - top - 2} ${y} H${cx + top + 2}" ${LINE}/>`;
});

const produce = (count) => repeated(count, (cx, scale) => {
  const r = 13 * scale;
  return `<circle cx="${cx}" cy="${35}" r="${r}" ${SOFT}/><circle cx="${cx}" cy="35" r="${r}" ${LINE}/>`
    + `<path d="M${cx} ${35 - r} q${1 * scale} ${-7 * scale} ${7 * scale} ${-9 * scale}" ${LINE}/>`;
});

const scoop = (count) => {
  const balls = [[32, 22]].concat(count > 1 ? [[21, 30]] : [], count > 2 ? [[43, 30]] : []);
  return balls.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="11" ${SOFT}/><circle cx="${cx}" cy="${cy}" r="11" ${LINE}/>`).join('')
    + `<path d="M12 36 H52 a20 16 0 0 1 -40 0 Z" fill="var(--surface-2, #fff)"/><path d="M12 36 H52 a20 16 0 0 1 -40 0 Z M26 52 v6 h12 v-6" ${LINE}/>`;
};

function spoon(large) {
  const [rx, ry, cy] = large ? [14, 18, 22] : [9, 12, 20];
  return `<ellipse cx="32" cy="${cy}" rx="${rx}" ry="${ry}" ${SOFT}/><ellipse cx="32" cy="${cy}" rx="${rx}" ry="${ry}" ${LINE}/>`
    + `<path d="M32 ${cy + ry} V${large ? 60 : 52}" fill="none" stroke="currentColor" stroke-width="${large ? 4 : 3}" stroke-linecap="round"/>`;
}

function baguette(parts) {
  const body = 'M8 44 a8 8 0 0 1 4 -12 L44 12 a8 8 0 0 1 11 3 a8 8 0 0 1 -3 11 L20 46 a8 8 0 0 1 -12 -2 Z';
  const clip = parts === 1 ? 'M4 28 L24 16 L34 52 L4 60 Z' : 'M4 28 L34 10 L46 44 L4 60 Z';
  return `<clipPath id="bg${parts}"><path d="${clip}"/></clipPath><path d="${body}" ${FAINT}/>`
    + `<path d="${body}" ${SOFT} clip-path="url(#bg${parts})"/><path d="${body}" ${LINE}/>`
    + `<path d="M22 28 l4 6 M31 23 l4 6 M40 18 l4 6" ${LINE}/>`;
}

function handful(full) {
  const dots = (full ? [[22, 30], [30, 26], [38, 27], [44, 32], [26, 35], [34, 33], [40, 37], [31, 39]]
    : [[26, 34], [33, 31], [39, 35], [31, 38]])
    .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="3.4" ${SOFT}/>`).join('');
  return `${dots}<path d="M8 34 c2 14 12 22 24 22 s22 -8 24 -22 M8 34 q4 -2 7 2 M56 34 q-4 -2 -7 2" ${LINE}/>`;
}

function cerealBowl(level) {
  const y = [44, 38, 33][level - 1];
  const half = Math.sqrt(Math.max(0, 1 - ((y - 30) / 24) ** 2)) * 24;
  return `<path d="M${32 - half} ${y} H${32 + half} A24 24 0 0 1 ${32 - half} ${y} Z" ${SOFT}/>`
    + `<path d="M8 30 H56 A24 24 0 0 1 8 30 Z" ${LINE}/>`;
}

const DRAWINGS = {
  'plate-1': () => plate(1), 'plate-2': () => plate(2), 'plate-3': () => plate(3),
  glass: () => vessel('M20 10 H44 L41 56 H23 Z', 'M21.2 26 H42.8 L41 56 H23 Z'),
  mug: () => vessel('M14 16 H42 V54 H14 Z M42 24 h6 a6 6 0 0 1 6 6 v6 a6 6 0 0 1 -6 6 h-6', 'M14 24 H42 V54 H14 Z'),
  bowl: () => vessel('M8 26 H56 A24 26 0 0 1 8 26 Z', 'M10 34 H54 A24 26 0 0 1 10 34 Z'),
  'bowl-large': () => vessel('M5 22 H59 A27 32 0 0 1 5 22 Z', 'M6.5 30 H57.5 A27 32 0 0 1 6.5 30 Z'),
  'palm-1': () => palm(1), 'palm-2': () => palm(2), 'palm-3': () => palm(3),
  'egg-1': () => egg(1), 'egg-2': () => egg(2), 'egg-3': () => egg(3),
  'cheese-1': () => wedge(1), 'cheese-2': () => wedge(2),
  'pot-1': () => pot(1), 'pot-2': () => pot(2),
  'spoon-1': () => spoon(false), 'spoon-2': () => spoon(true),
  'bread-1': () => '<path d="M14 54 V26 a9 9 0 0 1 9 -12 h18 a9 9 0 0 1 9 12 V54 Z" ' + SOFT + '/>'
    + '<path d="M14 54 V26 a9 9 0 0 1 9 -12 h18 a9 9 0 0 1 9 12 V54 Z" ' + LINE + '/>',
  'bread-2': () => baguette(1), 'bread-3': () => baguette(2),
  'cereal-1': () => cerealBowl(1), 'cereal-2': () => cerealBowl(2), 'cereal-3': () => cerealBowl(3),
  'handful-1': () => handful(false), 'handful-2': () => handful(true),
  'produce-1': () => produce(1), 'produce-2': () => produce(2), 'produce-3': () => produce(3),
  'scoop-1': () => scoop(1), 'scoop-2': () => scoop(2), 'scoop-3': () => scoop(3),
};

export const PICTOGRAM_IDS = Object.keys(DRAWINGS);

/** Contenu SVG (sans la balise svg) du pictogramme, ou une chaîne vide. */
export function pictogramMarkup(id) {
  return Object.hasOwn(DRAWINGS, id) ? DRAWINGS[id]() : '';
}
