<script>
  import { _, locale } from 'svelte-i18n';
  import { energyUnit } from '../../stores/settings.js';
  import { Nutrition } from '../../lib/nutrition.js';
  import { displayUnit, scaleFactor } from '../../lib/units.js';
  import { portionFraction, portionOptions } from '../../lib/portions.js';
  import { atlasFoodId, loadAtlasPortionMeasures } from '../../lib/portion-atlas.js';
  import { loadCiqual } from '../../lib/ciqual.js';
  import { pictogramMarkup } from '../../lib/portion-pictogram-art.js';
  import { parseDecimal } from '../../lib/decimal-input.js';

  export let food;
  export let amount;
  export let unit;
  export let quantity;
  export let referenceSteps = false;

  let selection = null;
  let fraction = 1;
  let unavailableImages = new Set();
  let recoveredMeasures;
  let recoveredCategory;
  const fractions = [[0.25, '¼'], [0.5, '½'], [1, '1'], [2, '2']];

  $: atlasId = food?.portionMeasures ? null : atlasFoodId(food);
  $: if (atlasId) recoverMeasures(atlasId);
  // Un aliment Ciqual repris du journal n'a plus sa catégorie : on la relit.
  $: ciqualCode = (food?.source_app === 'ciqual' || food?.source === 'ciqual') && !food.category
    ? String(food.source_external_id ?? '') : '';
  $: if (ciqualCode) recoverCategory(ciqualCode);
  $: options = portionOptions(food, { unit, referenceSteps,
    atlasMeasures: recoveredMeasures?.id === atlasId ? recoveredMeasures?.portions : undefined,
    category: recoveredCategory?.code === ciqualCode ? recoveredCategory?.category : undefined });
  $: format = new Intl.NumberFormat($locale || undefined, { maximumFractionDigits: 4 });
  $: active = parseDecimal(quantity) === 1
    ? options.find(row => row.unit === unit && row.amount === selection?.amount
        && portionFraction(row.amount, fraction) === parseDecimal(amount))
      || options.find(row => row.unit === unit && row.amount === parseDecimal(amount))
    : undefined;
  $: activeFraction = active && (active.amount === parseDecimal(amount) ? 1 : fraction);
  $: selectedEnergy = active ? energy({ amount: parseDecimal(amount), unit }, food, $energyUnit, format) : '';
  $: hasUsda = options.some(row => row.source === 'usda');
  $: hasCnf = options.some(row => row.source === 'cnf');
  $: hasPhotos = options.some(row => row.image);
  $: hasPictograms = options.some(row => row.pictogram);

  async function recoverMeasures(id) {
    try {
      const portions = await loadAtlasPortionMeasures(id);
      if (id === atlasId) recoveredMeasures = { id, portions };
    } catch { /* The recorded quantity and manual input are still available. */ }
  }

  async function recoverCategory(code) {
    try {
      const catalogue = await loadCiqual();
      const category = catalogue.foods.find(row => row.source_external_id === code)?.category;
      if (code === ciqualCode) recoveredCategory = { code, category };
    } catch { /* Les quantités de référence et la saisie manuelle restent disponibles. */ }
  }

  function choose(row, multiplier = 1) {
    selection = row;
    fraction = multiplier;
    amount = portionFraction(row.amount, multiplier);
    unit = row.unit;
    quantity = 1;
  }

  function energy(row, food, unitPreference, numberFormat) {
    if (!Number.isFinite(food.nutrition?.calories)) return '';
    const factor = scaleFactor(food.portion, food.unit || 'g', row.amount, row.unit, food);
    const value = Nutrition.displayEnergy(food.nutrition.calories * factor, unitPreference);
    return `${numberFormat.format(value.value)} ${value.unit}`;
  }
</script>

{#if options.length}
  <section class="portion-picker" aria-label={$_('portions.title')}>
    <strong>{$_('portions.title')}</strong>
    <div class="portion-options" class:photos={hasPhotos || hasPictograms}>
      {#each options as row (row.unit + ':' + row.amount)}
        {@const kcal = energy(row, food, $energyUnit, format)}
        <button class="portion-option" type="button" aria-pressed={active === row} on:click={() => choose(row)}>
          {#if row.image && !unavailableImages.has(row.image)}
            <img src={`${import.meta.env.BASE_URL}portions/${row.image}`} alt="" draggable="false"
              loading={row.image.startsWith('atlas/') ? 'lazy' : 'eager'}
              on:error={() => unavailableImages = new Set([...unavailableImages, row.image])}>
          {:else if row.pictogram}
            <svg class="portion-pictogram" viewBox="0 0 64 64" aria-hidden="true">{@html pictogramMarkup(row.pictogram)}</svg>
          {:else}
            <span class="material-symbols-rounded portion-icon" aria-hidden="true">
              {row.source === 'off' ? 'inventory_2' : row.unit === 'ml' ? 'water_full' : 'restaurant'}
            </span>
          {/if}
          <strong>{format.format(row.amount)} {displayUnit(row.unit, $_)}</strong>
          <span>{row.localized ? (row.localized[$locale?.split('-')[0]] || row.localized.en)
            : row.label ? $_(`portions.labels.${row.label}`) : displayUnit(row.customLabel, $_)}</span>
          {#if kcal}<span class="portion-energy">{kcal}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="portion-fractions" aria-label={$_('portions.multiplier')} role="group">
      {#each fractions as [multiplier, label]}
        <button type="button" aria-pressed={activeFraction === multiplier} disabled={!active}
          on:click={() => choose(active, multiplier)}>{label}</button>
      {/each}
      {#if active}
        <strong aria-live="polite">
          {format.format(parseDecimal(amount))} {displayUnit(unit, $_)}
          {#if selectedEnergy} · {selectedEnergy}{/if}
        </strong>
      {/if}
    </div>
    {#if hasUsda || hasCnf || hasPhotos || hasPictograms}
      <small>
        {$_(hasPictograms ? 'portions.pictogram_note' : 'portions.estimate')}
        {#if hasUsda} · <a href="https://fdc.nal.usda.gov/data-documentation/" target="_blank" rel="noreferrer">USDA FNDDS</a>{/if}
        {#if hasCnf} · <a href="https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/nutrient-data/canadian-nutrient-file-2015-download-files.html" target="_blank" rel="noreferrer">{$_('portions.cnf')}</a>{/if}
        {#if hasPhotos} · <a href="https://epi.grants.cancer.gov/asa24/resources/portionsize.html" target="_blank" rel="noreferrer">Photos ASA24 (NCI)</a>{/if}
      </small>
    {/if}
  </section>
{/if}

<style>
  .portion-picker { display: grid; gap: 8px; min-width: 0; }
  .portion-options { display: flex; gap: 8px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 2px 2px 7px; }
  .portion-option { display: grid; align-content: start; justify-items: center; gap: 3px; flex: 0 0 auto; min-width: 100px; max-width: 148px; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-2); color: var(--text-1); font-size: .77rem; scroll-snap-align: start; }
  .photos .portion-option { flex-basis: clamp(106px, 34vw, 148px); }
  .portion-option img, .photos .portion-icon { width: 100%; aspect-ratio: 1; object-fit: contain; border-radius: 7px; }
  .portion-pictogram { width: 72%; aspect-ratio: 1; color: var(--text-1); }
  .portion-icon { display: grid; place-items: center; color: var(--accent); font-size: 26px; }
  .portion-option[aria-pressed="true"], .portion-fractions button[aria-pressed="true"] { border-color: var(--accent); background: var(--surface-3); box-shadow: inset 0 0 0 1px var(--accent); }
  .portion-energy { color: var(--text-2); }
  .portion-fractions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .portion-fractions button { min-width: 38px; min-height: 38px; border: 1px solid var(--border); border-radius: 9px; font-weight: 650; }
  .portion-fractions button:disabled { opacity: .45; }
  .portion-fractions strong { margin-inline-start: auto; }
  small { color: var(--text-2); }
  small a { text-decoration: underline; }
</style>
