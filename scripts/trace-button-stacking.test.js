/**
 * The Trace button must not draw over an open sheet or dialog.
 *
 * It sat at z-index 400 while every sheet and dialog sits lower, so a
 * dragged button covered sheet titles and buttons (NutriTrace #233, where
 * it landed on top of the Copy sheet's title). It now sits between the
 * bottom bar and the lowest overlay: still above the page, never above a
 * layer that's open on top of the page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { listFiles, readSource, sourcePath, SRC } from './fixtures/source-text.js';

const trace = readSource(join(SRC, 'components/ai/Trace.svelte'));

const fabRule = trace.slice(trace.indexOf('  .ai-fab {'), trace.indexOf('}', trace.indexOf('  .ai-fab {')));
const fabZ = Number((fabRule.match(/z-index: (\d+);/) || [])[1]);

test('the Trace button sits above the page chrome but below every overlay', () => {
  assert.ok(Number.isFinite(fabZ), 'the button declares a z-index');
  assert.ok(fabZ > 50, `above the bottom bar (${fabZ})`);
  assert.ok(fabZ < 90, `below the lowest overlay, 90 (${fabZ})`);
});

const NOT_LAYERS = [
    // The widget rail slide-in on a wide screen, not a layer over the phone UI.
    'routes/Diary.svelte .diary-right-col-overlay',
];

test('no sheet or dialog backdrop sits below the Trace button', () => {
  const below = [];
  for (const f of listFiles(SRC).filter((x) => x.endsWith('.svelte'))) {
    const s = readSource(f);
    const style = s.slice(s.lastIndexOf('<style'));
    for (const m of style.matchAll(/\.([\w-]*(?:backdrop|overlay))[^{}]*\{([^}]*)\}/g)) {
      const z = Number((m[2].match(/z-index: (\d+);/) || [])[1]);
      // Only layers that cover the page: the ones with a fixed position.
      if (!Number.isFinite(z) || !/position: fixed/.test(m[2])) continue;
      const where = `${sourcePath(f)} .${m[1]}`;
      if (NOT_LAYERS.includes(where)) continue;
      if (z <= fabZ) below.push(`${where} z=${z}`);
    }
  }
  assert.deepEqual(below, []);
});
