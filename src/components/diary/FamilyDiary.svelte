<script>
  import { onMount } from 'svelte';
  import { _, locale } from 'svelte-i18n';
  import FamilyMealPhoto from './FamilyMealPhoto.svelte';
  import FamilyMascot from './FamilyMascot.svelte';
  import FamilyAvatarEditor from './FamilyAvatarEditor.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { familyAvatar } from '../../stores/settings.js';
  import { normalizeAvatar } from '../../lib/family-avatar.js';
  import { localDateStr } from '../../lib/db.js';
  import { formatWater } from '../../lib/water-volume.js';

  export let calories = 0;
  export let budget = null;
  export let adaptiveBudget = false;
  export let meals = [];
  export let date;
  export let onSaveBudget;
  export let onAdd;
  export let onDetailed;
  export let waterTotal = null;
  export let waterGoal = 0;
  export let waterUnit = 'ml';
  export let onWater;

  let editingBudget = false;
  let draftBudget;
  let mealIndex = 0;
  let photoTarget = null;
  let editingAvatar = false;
  let now = new Date();

  onMount(() => {
    const timer = setInterval(() => { now = new Date(); }, 60_000);
    return () => clearInterval(timer);
  });

  $: hasBudget = Number.isSafeInteger(budget) && budget > 0;
  $: consumed = Math.max(0, Math.round(calories || 0));
  $: remaining = hasBudget ? budget - consumed : 0;
  $: progress = hasBudget ? Math.min(consumed, budget) : 0;
  $: fill = hasBudget ? progress / budget : 0;
  $: hasWaterGoal = waterTotal != null && waterGoal > 0;
  $: waterFill = hasWaterGoal ? Math.min(1, waterTotal / waterGoal) : 0;
  $: thirsty = hasWaterGoal && date === localDateStr(now) && now.getHours() >= 12 && waterFill < 0.5;
  $: calorieMood = fill < 0.5 ? 'smile' : fill < 0.9 ? 'curious' : 'calm';
  $: mood = thirsty ? 'thirsty' : calorieMood;
  $: waterAmount = waterTotal == null ? '' : formatWater(waterTotal, waterUnit, $locale);
  $: waterTarget = hasWaterGoal ? formatWater(waterGoal, waterUnit, $locale) : '';
  $: format = new Intl.NumberFormat($locale || undefined);
  $: targetMeal = mealIndex < meals.length ? mealIndex : 0;
  $: avatar = normalizeAvatar($familyAvatar);

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

<section class="family-card" aria-labelledby="family-budget-title">
  <header>
    <h2 id="family-budget-title">{$_('family_diary.title')}</h2>
    <button type="button" class="detailed-button" on:click={onDetailed}>
      <span class="material-symbols-rounded" aria-hidden="true">list_alt</span>
      {$_('family_diary.disable')}
    </button>
  </header>

  <div class="budget-hero">
    <div class="gauge-column">
      <span aria-hidden="true">100%</span>
      <div class="gauge" role={hasBudget ? 'meter' : undefined} aria-hidden={!hasBudget ? 'true' : undefined}
        aria-labelledby={hasBudget ? 'family-budget-title' : undefined} aria-valuemin={hasBudget ? 0 : undefined}
        aria-valuemax={hasBudget ? budget : undefined} aria-valuenow={hasBudget ? progress : undefined}>
        <div class="gauge-fill" style:height={`${fill * 100}%`}></div>
        <div class="gauge-ticks" aria-hidden="true"></div>
      </div>
      <span aria-hidden="true">0%</span>
    </div>
    <div class="hero-summary">
      <button type="button" class="mascot-button" aria-label={$_('family_avatar.edit')}
        aria-description={thirsty ? $_('water_tracking.thirsty_hint') : undefined} on:click={() => editingAvatar = true}>
        <span class="mascot-stage"><FamilyMascot {avatar} {mood} /></span>
        <span class="mascot-name">{$_(`family_avatar.kind.${avatar.kind}`)}
          <span class="material-symbols-rounded" aria-hidden="true">edit</span>
        </span>
      </button>
      <div class="gauge-value" aria-live="polite">
        <strong>{format.format(hasBudget ? Math.abs(remaining) : consumed)} <small>kcal</small></strong>
        <span>{hasBudget ? (remaining < 0 ? $_('family_diary.over_budget') : $_('family_diary.remaining')) : $_('family_diary.consumed')}</span>
      </div>
      {#if waterTotal != null}
        <button type="button" class="water-gauge" on:click={onWater}
          aria-label={$_(hasWaterGoal ? 'water_tracking.open_with_goal' : 'water_tracking.open_to_add', { values: { total: waterAmount, goal: waterTarget } })}>
          <span class="water-line">
            <span class="water-label"><span class="material-symbols-rounded" aria-hidden="true">water_drop</span>{$_('diary_deep.water')}</span>
            <strong>{waterAmount}{#if hasWaterGoal} / {waterTarget}{/if}</strong>
            <span class="material-symbols-rounded water-add" aria-hidden="true">add_circle</span>
          </span>
          {#if hasWaterGoal}<span class="water-track" aria-hidden="true"><span style:width={`${waterFill * 100}%`}></span></span>{/if}
        </button>
      {/if}
    </div>
  </div>

  <div class="budget-totals">
    <div class="metric"><span>{$_('family_diary.consumed')}</span><strong>{format.format(consumed)} kcal</strong></div>
    {#if adaptiveBudget}
      <div class="metric"><span>{$_('family_onboarding.adaptive_budget')}</span><strong>{format.format(budget)} kcal</strong></div>
    {:else}
      <button type="button" class="metric budget-edit" on:click={editBudget}
        aria-label={hasBudget ? $_('family_diary.edit_budget') : $_('family_diary.set_budget')}>
        <span>{$_('family_diary.budget')} <span class="material-symbols-rounded" aria-hidden="true">edit</span></span>
        <strong>{hasBudget ? `${format.format(budget)} kcal` : $_('family_diary.set_budget')}</strong>
      </button>
    {/if}
  </div>

  <Sheet bind:open={editingBudget} title={$_('family_diary.daily_budget')}>
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
  </Sheet>

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
        <button type="button" class="quick-button primary" aria-label={$_('diary.add_food')} on:click={() => onAdd(targetMeal, 'food')}>
          <span class="material-symbols-rounded" aria-hidden="true">add_circle</span>
          {$_('family_diary.action_food')}
        </button>
        <button type="button" class="quick-button" aria-label={$_('foods.scan_barcode')} on:click={() => onAdd(targetMeal, 'scan')}>
          <span class="material-symbols-rounded" aria-hidden="true">qr_code_scanner</span>
          {$_('family_diary.scan')}
        </button>
        <button type="button" class="quick-button" aria-label={$_('family_diary.saved_meals')} on:click={() => onAdd(targetMeal, 'meals')}>
          <span class="material-symbols-rounded" aria-hidden="true">dinner_dining</span>
          {$_('family_diary.action_meals')}
        </button>
        <button type="button" class="quick-button" aria-label={$_('meal_photo.open')} on:click={() => photoTarget = { date, meal: targetMeal }}>
          <span class="material-symbols-rounded" aria-hidden="true">photo_camera</span>
          {$_('family_diary.action_photo')}
        </button>
      </div>
    </div>
  {/if}
</section>

{#if photoTarget}
  <FamilyMealPhoto date={photoTarget.date} meal={photoTarget.meal} onClose={() => photoTarget = null} />
{/if}
{#if editingAvatar}
  <FamilyAvatarEditor {avatar} onClose={() => editingAvatar = false}
    onSave={(profile) => { familyAvatar.set(profile); editingAvatar = false; }} />
{/if}

<style>
  .family-card { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: clamp(7px, 1.2dvh, 12px); }
  header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2px 8px; }
  h2 { margin: 0; font-size: 1.05rem; }
  .detailed-button { min-height: 40px; display: inline-flex; align-items: center; gap: 5px; color: var(--family-accent); font-weight: 650; font-size: .78rem; }
  .detailed-button .material-symbols-rounded { font-size: 18px; }
  .budget-hero {
    display: grid; flex: 1; min-height: 196px; grid-template-columns: minmax(48px, 25%) minmax(0, 1fr);
    gap: clamp(8px, 3vw, 24px); padding: clamp(10px, 2dvh, 18px) clamp(12px, 4vw, 28px);
    background: radial-gradient(ellipse at 78% 16%, #9f3556, transparent 68%), linear-gradient(145deg, #691a36, #471126);
    color: #fff3ea; border-radius: 20px; border: 1px solid #a54a64;
  }
  .gauge-column { display: grid; grid-template-rows: auto minmax(80px, 1fr) auto; justify-items: center; gap: 4px; color: #ffe0d9; font-size: .72rem; }
  .gauge { position: relative; width: clamp(33px, 10vw, 57px); border: 1px solid #de8f9f; background: #430e24; border-radius: 14px; overflow: hidden; }
  .gauge-fill { position: absolute; inset: auto 0 0; background: linear-gradient(0deg, #a92d54, #ffb3a7); transition: height var(--dur-base) ease-out; }
  .gauge-ticks { position: absolute; inset: 0 0 0 auto; width: 30%; background: repeating-linear-gradient(to top, #fff0e9a6 0 1px, transparent 1px 25%); }
  .hero-summary { display: flex; flex-direction: column; justify-content: center; align-items: center; min-width: 0; gap: 3px; text-align: center; }
  .mascot-button { display: grid; justify-items: center; gap: 3px; width: 100%; color: inherit; }
  .mascot-stage { display: grid; place-items: center; height: clamp(80px, 19dvh, 148px); width: 100%; }
  .mascot-name { color: #ffe0d9; font-size: .72rem; font-weight: 650; letter-spacing: .06em; }
  .mascot-name .material-symbols-rounded { font-size: 13px; vertical-align: middle; }
  .gauge-value { display: grid; justify-items: center; }
  .gauge-value strong { font-size: clamp(1.6rem, 9vw, 3rem); line-height: 1.05; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .gauge-value small { font-size: .4em; }
  .gauge-value > span { color: #ffe0d9; font-size: .82rem; }
  .water-gauge { display: grid; align-content: center; gap: 4px; width: 100%; min-height: 44px; margin-top: 6px; padding: 5px 7px; color: #fff3ea; border: 1px solid #d0879d; border-radius: 9px; background: #50172d; }
  .water-line { display: flex; align-items: center; justify-content: space-between; gap: 4px; min-width: 0; font-size: .71rem; }
  .water-line strong { min-width: 0; overflow-wrap: anywhere; }
  .water-label { display: flex; align-items: center; gap: 2px; }
  .water-label .material-symbols-rounded, .water-add { font-size: 15px; color: #9ce4ff; }
  .water-track { height: 5px; border-radius: 4px; background: #a96981; overflow: hidden; }
  .water-track > span { display: block; height: 100%; border-radius: inherit; background: #9ce4ff; transition: width var(--dur-base) ease-out; }
  .budget-totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .metric { display: grid; align-content: center; justify-items: center; gap: 2px; min-height: 53px; padding: 4px; text-align: center; border: 1px solid var(--family-border); border-radius: 12px; background: var(--family-surface); }
  .metric > span { color: var(--text-2); font-size: .74rem; }
  .metric strong { font-size: .94rem; }
  .metric .material-symbols-rounded { font-size: 13px; vertical-align: middle; }
  .budget-edit { color: var(--family-accent); }
  .quick-add { display: grid; gap: 6px; }
  .quick-add label { display: grid; align-items: center; grid-template-columns: auto minmax(0, 1fr); gap: 8px; font-size: .82rem; }
  .quick-add .select { height: 42px; min-width: 0; background: var(--family-surface); border-color: var(--family-border); }
  .quick-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .quick-button { display: grid; justify-items: center; align-content: center; gap: 2px; min-height: 54px; padding: 4px 2px; border: 1px solid var(--family-border); border-radius: 12px; background: var(--family-surface); color: var(--family-accent); font-size: .73rem; font-weight: 650; }
  .quick-button.primary { color: #fff5ef; background: #781d3d; border-color: #781d3d; }
  .quick-button .material-symbols-rounded { font-size: 20px; }
  .budget-form, .budget-form label { display: grid; gap: 8px; }
  .budget-form p { margin: 0; color: var(--text-2); font-size: .875rem; }
  .budget-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  @media (max-height: 650px) {
    .family-card { gap: 6px; }
    .budget-hero { min-height: 164px; padding-block: 8px; }
    .budget-hero:has(.water-gauge) { padding-block: 5px; }
    .hero-summary:has(.water-gauge) { gap: 1px; }
    .mascot-stage { height: clamp(74px, 14dvh, 94px); }
    .hero-summary:has(.water-gauge) .mascot-stage { height: clamp(56px, 10dvh, 70px); }
    .water-gauge { margin-top: 0; }
    .metric { min-height: 48px; }
    .quick-button { min-height: 48px; }
  }
</style>
