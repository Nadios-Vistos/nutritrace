<script>
  import { onDestroy } from 'svelte';
  import { _ } from 'svelte-i18n';
  import AttachImageButton from '../ai/AttachImageButton.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { aiEffectivelyEnabled, aiProvider, aiApiKey, aiModel, aiBaseUrl, envLocks } from '../../stores/settings.js';
  import { _newUuid, addReviewedMeal } from '../../stores/diary.js';
  import { showSuccess } from '../../stores/toast.js';
  import { loadCiqual, searchCiqual } from '../../lib/ciqual.js';
  import { identifyMealPhoto, prepareMealPhoto } from '../../lib/meal-photo.js';
  import { acquireScreenWakeLock } from '../../lib/wake-lock.js';

  export let date;
  export let meal;
  export let onClose;

  let photo = '';
  let preparing = false;
  let analysing = false;
  let saving = false;
  let reviewed = false;
  let rows = [];
  let catalogue;
  let errorKey = '';
  let active = true;
  onDestroy(() => active = false);

  const newRow = (query = '') => ({ uuid: _newUuid(), query, food: null, grams: undefined });
  const validWeight = (grams) => Number.isFinite(grams) && grams > 0 && grams <= 10000;
  $: canSave = rows.length > 0 && rows.every(row => row.food && validWeight(row.grams));
  $: calories = rows.reduce((sum, row) => sum + (row.food && validWeight(row.grams)
    ? row.food.nutrition.calories * row.grams / 100 : 0), 0);

  function matches(query) {
    return query.trim() ? searchCiqual(catalogue, query)
      .filter(food => food.nutrition.calories != null).slice(0, 8) : [];
  }

  async function pickPhoto(event) {
    const file = event.detail[0];
    if (!file || preparing || analysing || saving) return;
    errorKey = '';
    preparing = true;
    try {
      const next = await prepareMealPhoto(file);
      if (!active) return;
      photo = next;
      reviewed = false;
      rows = [];
    } catch {
      if (active) errorKey = 'meal_photo.photo_error';
    } finally {
      preparing = false;
    }
  }

  async function analyse() {
    if (!photo || preparing || analysing || saving || !$aiEffectivelyEnabled) return;
    errorKey = '';
    analysing = true;
    const release = await acquireScreenWakeLock();
    try {
      const data = await loadCiqual();
      if (!active) return;
      const names = await identifyMealPhoto(photo, {
        proxy: !!$envLocks.ai, provider: $aiProvider, apiKey: $aiApiKey,
        model: $aiModel, baseUrl: $aiBaseUrl,
      });
      if (!active) return;
      catalogue = data;
      rows = names.map(name => newRow(name));
      reviewed = true;
    } catch {
      if (active) errorKey = 'meal_photo.analyse_error';
    } finally {
      analysing = false;
      await release();
    }
  }

  async function save() {
    if (!canSave || saving) return;
    saving = true;
    errorKey = '';
    try {
      const items = rows.map(({ food, grams, uuid }) => ({
        uuid,
        name: food.name,
        portion: grams,
        unit: 'g',
        quantity: 1,
        source: food.source,
        source_external_id: food.source_external_id,
        nutrition: Object.fromEntries(Object.entries(food.nutrition).map(([key, value]) => [key, value * grams / 100])),
      }));
      await addReviewedMeal(items, meal, date);
      if (active) {
        showSuccess($_('foods.toast.added_to_diary'));
        onClose();
      }
    } catch {
      if (active) errorKey = 'meal_photo.save_error';
    } finally {
      saving = false;
    }
  }
</script>

<Sheet open title={$_('meal_photo.open')} on:close={onClose}>
  <div class="meal-photo">
    {#if !$aiEffectivelyEnabled}
      <p>{$_('meal_photo.setup')}</p>
      <a class="btn btn-secondary" href="#/settings/ai" on:click={onClose}>{$_('meal_photo.settings')}</a>
    {:else}
      <div class="photo-picker">
        <AttachImageButton title={$_('meal_photo.choose')} disabled={preparing || analysing || saving} on:files={pickPhoto} />
        <span>{$_('meal_photo.choose')}</span>
      </div>
      {#if photo}
        <img class="meal-preview" src={photo} alt="" />
        {#if !reviewed}
          <p>{$_('meal_photo.privacy')}</p>
          <button type="button" class="btn btn-primary" on:click={analyse} disabled={preparing || analysing}>
            {analysing ? $_('meal_photo.analysing') : $_('meal_photo.analyse')}
          </button>
        {/if}
      {/if}
      {#if errorKey}<p class="photo-error" role="alert">{$_(errorKey)}</p>{/if}
      {#if reviewed}
        <form class="review" on:submit|preventDefault={save}>
          <p>{$_('meal_photo.review')}</p>
          {#if !rows.length}<p>{$_('meal_photo.empty')}</p>{/if}
          {#each rows as row (row.uuid)}
            {@const options = matches(row.query)}
            <fieldset class="food-review" disabled={saving}>
              <label>{$_('meal_photo.search')}
                <input class="input" type="search" maxlength="100" bind:value={row.query} on:input={() => row.food = null} />
              </label>
              {#if options.length}
                <label>{$_('meal_photo.choose_food')}
                  <select class="select" bind:value={row.food} required>
                    <option value={null}>{$_('meal_photo.choose_food')}</option>
                    {#each options as option (option.source_external_id)}
                      <option value={option}>{option.name}</option>
                    {/each}
                  </select>
                </label>
              {:else if row.query.trim()}
                <p>{$_('meal_photo.no_match')}</p>
              {/if}
              <label>{$_('meal_photo.grams')}
                <input class="input" type="number" min="0.1" max="10000" step="any" inputmode="decimal" bind:value={row.grams} required />
              </label>
              <div class="review-actions">
                {#each [50, 100, 150] as grams}
                  <button type="button" class="btn btn-secondary btn-sm" on:click={() => row.grams = grams}>{grams} g</button>
                {/each}
                <button type="button" class="btn-icon" aria-label={$_('meal_photo.remove')}
                  on:click={() => rows = rows.filter(other => other.uuid !== row.uuid)}>
                  <span class="material-symbols-rounded" aria-hidden="true">close</span>
                </button>
              </div>
            </fieldset>
          {/each}
          {#if rows.length < 8}
            <button type="button" class="btn btn-secondary" disabled={saving} on:click={() => rows = [...rows, newRow()]}>
              {$_('meal_photo.add_row')}
            </button>
          {/if}
          <strong aria-live="polite">{$_('meal_photo.total')} · {Math.round(calories)} kcal</strong>
          <button type="submit" class="btn btn-primary" disabled={!canSave || saving}>{$_('foods.add_to_diary')}</button>
        </form>
      {/if}
    {/if}
  </div>
</Sheet>

<style>
  .meal-photo, .review, .food-review, .food-review label { display: grid; gap: 10px; }
  .meal-photo { padding-block: 8px; }
  .meal-photo p { margin: 0; color: var(--text-2); }
  .photo-picker, .review-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .meal-preview { max-height: 170px; max-width: 100%; margin-inline: auto; border-radius: var(--radius-md); }
  .food-review { min-width: 0; margin: 0; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-md); }
  .food-review .select { width: 100%; text-overflow: ellipsis; }
  .meal-photo .photo-error { color: var(--danger); }
</style>
