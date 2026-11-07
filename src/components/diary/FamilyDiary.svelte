<script>
  import { _, locale } from 'svelte-i18n';

  export let calories = 0;
  export let budget = null;
  export let meals = [];
  export let onSaveBudget;
  export let onAdd;

  let editingBudget = false;
  let draftBudget;
  let mealIndex = 0;

  $: hasBudget = Number.isSafeInteger(budget) && budget > 0;
  $: consumed = Math.max(0, Math.round(calories || 0));
  $: remaining = hasBudget ? budget - consumed : 0;
  $: progress = hasBudget ? Math.min(consumed, budget) : 0;
  $: format = new Intl.NumberFormat($locale || undefined);
  $: targetMeal = mealIndex < meals.length ? mealIndex : 0;

  function editBudget() {
    draftBudget = hasBudget ? budget : undefined;
    editingBudget = true;
  }

  function saveBudget() {
    if (!Number.isSafeInteger(draftBudget) || draftBudget <= 0) return;
    onSaveBudget(draftBudget);
    editingBudget = false;
  }
</script>

<section class="card family-card" aria-labelledby="family-budget-title">
  <header>
    <h2 id="family-budget-title">{$_('family_diary.title')}</h2>
    {#if !editingBudget}
      <button type="button" class="btn btn-secondary btn-sm" on:click={editBudget}>
        {hasBudget ? $_('family_diary.edit_budget') : $_('family_diary.set_budget')}
      </button>
    {/if}
  </header>

  {#if editingBudget}
    <form class="budget-form" on:submit|preventDefault={saveBudget}>
      <label>
        {$_('family_diary.daily_budget')}
        <input class="input" type="number" min="1" step="1" inputmode="numeric" required bind:value={draftBudget} />
      </label>
      <div class="budget-actions">
        <button type="submit" class="btn btn-primary btn-sm">{$_('common.save')}</button>
        <button type="button" class="btn btn-secondary btn-sm" on:click={() => editingBudget = false}>
          {$_('common.cancel')}
        </button>
      </div>
      <p>{$_('family_diary.budget_help')}</p>
    </form>
  {/if}

  {#if hasBudget}
    <div class="gauge" class:over-budget={remaining < 0}>
      <div role="meter" aria-labelledby="family-budget-title" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={progress}>
        <svg viewBox="0 0 280 151" aria-hidden="true" focusable="false">
          <path class="track" d="M 20,140 A 120,120 0 0 1 260,140" />
          {#if progress > 0}
            <path class="fill" d="M 20,140 A 120,120 0 0 1 260,140" pathLength="100"
              stroke-dasharray="{(progress / budget) * 100} 100" />
          {/if}
        </svg>
      </div>
      <div class="gauge-value" aria-live="polite">
        <strong>{format.format(Math.abs(remaining))} <small>kcal</small></strong>
        <span>{remaining < 0 ? $_('family_diary.over_budget') : $_('family_diary.remaining')}</span>
      </div>
    </div>
  {/if}

  <dl class="budget-totals">
    <div><dt>{$_('family_diary.consumed')}</dt><dd>{format.format(consumed)} kcal</dd></div>
    {#if hasBudget}
      <div><dt>{$_('family_diary.budget')}</dt><dd>{format.format(budget)} kcal</dd></div>
    {/if}
  </dl>

  {#if meals.length > 0}
    <div class="quick-add">
      <label>
        {$_('family_diary.meal_slot')}
        <select class="select" value={targetMeal} on:change={(event) => mealIndex = Number(event.currentTarget.value)}>
          {#each meals as meal, index}
            <option value={index}>{meal}</option>
          {/each}
        </select>
      </label>
      <div class="quick-actions">
        <button type="button" class="btn btn-primary" on:click={() => onAdd(targetMeal, 'food')}>
          <span class="material-symbols-rounded" aria-hidden="true">add</span>
          {$_('diary.add_food')}
        </button>
        <button type="button" class="btn btn-secondary" aria-label={$_('foods.scan_barcode')} on:click={() => onAdd(targetMeal, 'scan')}>
          <span class="material-symbols-rounded" aria-hidden="true">qr_code_scanner</span>
          {$_('family_diary.scan')}
        </button>
        <button type="button" class="btn btn-secondary" on:click={() => onAdd(targetMeal, 'meals')}>
          <span class="material-symbols-rounded" aria-hidden="true">dinner_dining</span>
          {$_('family_diary.saved_meals')}
        </button>
      </div>
    </div>
  {/if}
</section>

<style>
  .family-card { display: grid; gap: 16px; padding: clamp(14px, 4vw, 28px); }
  header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  h2 { margin: 0; font-size: 1.25rem; }
  .budget-form, .quick-add { display: grid; gap: 10px; }
  .budget-form label, .quick-add label { display: grid; gap: 4px; }
  .budget-form p, dt, .gauge-value span { color: var(--text-2); font-size: 0.875rem; }
  .budget-form p { margin: 0; }
  .budget-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .gauge { position: relative; width: min(100%, 350px); margin-inline: auto; }
  svg { display: block; width: 100%; }
  path { fill: none; stroke-width: 16; stroke-linecap: round; }
  .track { stroke: var(--border); }
  .fill { stroke: var(--accent); }
  .over-budget .fill { stroke: var(--danger); }
  .gauge-value { position: absolute; inset: auto 12% 7%; display: grid; justify-items: center; text-align: center; }
  .gauge-value strong { font-size: clamp(1.6rem, 8vw, 2.8rem); line-height: 1.1; font-variant-numeric: tabular-nums; }
  .gauge-value small { font-size: 0.4em; }
  .budget-totals { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 36px; margin: 0; text-align: center; }
  dd { margin: 4px 0 0; font-weight: 650; }
  .quick-add { border-top: 1px solid var(--border); padding-top: 14px; }
  .quick-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .quick-actions .btn { min-height: 44px; height: auto; white-space: normal; text-align: center; }
  .quick-actions .btn-primary { grid-column: 1 / -1; }
  .quick-actions .material-symbols-rounded { font-size: 19px; }
</style>
