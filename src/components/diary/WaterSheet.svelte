<script>
  import { _, locale } from 'svelte-i18n';
  import Sheet from '../ui/Sheet.svelte';
  import { decimalInput } from '../../lib/decimal-input.js';
  import { beverageVolume } from '../../lib/nutrition.js';
  import { formatWater, parseWaterVolume, waterInputValue, waterContainerLabel, waterUnitLabel } from '../../lib/water-volume.js';

  export let dateLabel;
  export let logs = [];
  export let items = [];
  export let total = 0;
  export let goal = 0;
  export let unit = 'ml';
  export let containers = [];
  export let onAdd;
  export let onEdit;
  export let onRemove;
  export let onGoal;
  export let onClose;

  const fallback = [250, 500, 1000].map(volumeMl => ({ id: volumeMl, volumeMl }));
  $: shortcuts = containers.length ? containers : fallback;
  $: orderedLogs = logs.map((log, index) => ({ log, index })).reverse();
  $: beverages = items.map(item => ({ name: item.name, volume: beverageVolume(item) })).filter(item => item.volume > 0);
  $: format = (ml) => formatWater(ml, unit, $locale);
  $: volumeLabel = $_('water_tracking.volume', { values: { unit: waterUnitLabel(unit) } });

  let amount = '';
  let goalDraft = '';
  let originalGoal = '';
  let editDraft = '';
  let originalEdit = '';
  let edited = null;
  let goalOpen = false;
  let busy = false;
  let error = '';

  async function save(action) {
    if (busy) return;
    error = '';
    busy = true;
    try {
      await action();
    } catch {
      error = 'water_tracking.save_error';
    } finally {
      busy = false;
    }
  }

  function addCustom() {
    const ml = parseWaterVolume(amount, unit);
    if (!(ml > 0)) {
      error = 'water_tracking.invalid_amount';
      return;
    }
    save(async () => { await onAdd(ml); amount = ''; });
  }

  function openGoal() {
    originalGoal = goalDraft = waterInputValue(goal, unit);
    goalOpen = true;
    error = '';
  }

  function saveGoal() {
    const ml = parseWaterVolume(goalDraft, unit);
    if (ml == null) {
      error = 'water_tracking.invalid_goal';
      return;
    }
    save(async () => {
      if (goalDraft.trim().replace(',', '.') !== originalGoal) await onGoal(ml);
      goalOpen = false;
    });
  }

  function edit(log, index) {
    edited = { log, index };
    originalEdit = editDraft = waterInputValue(log.amount, unit);
    error = '';
  }

  function saveEdit() {
    const ml = parseWaterVolume(editDraft, unit);
    if (!(ml > 0)) {
      error = 'water_tracking.invalid_amount';
      return;
    }
    save(async () => {
      if (editDraft.trim().replace(',', '.') !== originalEdit) await onEdit(edited.log, edited.index, ml);
      edited = null;
    });
  }
</script>

<Sheet open title={$_('water_tracking.title')} on:close={onClose}>
  <div class="water-sheet">
    <section class="summary" aria-label={$_('water_tracking.title')}>
      <p class="date">{dateLabel}</p>
      <div class="totals">
        <div><span>{$_('water_tracking.drunk')}</span><strong aria-live="polite">{format(total)}</strong></div>
        <button class="goal" type="button" disabled={busy} on:click={openGoal} aria-label={$_('water_tracking.edit_goal')}>
          <span>{$_('water_tracking.daily_goal')} <span class="material-symbols-rounded" aria-hidden="true">edit</span></span>
          <strong>{goal > 0 ? format(goal) : $_('water_tracking.no_goal')}</strong>
        </button>
      </div>
      {#if goal > 0}
        <progress value={Math.min(total, goal)} max={goal} aria-label={$_('water_tracking.daily_goal')}></progress>
        <p class="progress-label" aria-live="polite">
          {total >= goal ? $_('water_tracking.goal_reached') : $_('water_tracking.remaining', { values: { amount: format(goal - total) } })}
        </p>
      {/if}
      {#if goalOpen}
        <form class="edit-goal" on:submit|preventDefault={saveGoal}>
          <label for="water-goal">{$_('water_tracking.goal_input', { values: { unit: waterUnitLabel(unit) } })}</label>
          <div class="form-line">
            <input class="input" id="water-goal" type="text" inputmode="decimal" use:decimalInput bind:value={goalDraft} />
            <button class="btn btn-primary" type="submit" disabled={busy}>{$_('common.save')}</button>
          </div>
          <p>{$_('water_tracking.goal_help')}</p>
          <button type="button" class="btn btn-ghost" on:click={() => { goalOpen = false; error = ''; }}>{$_('common.cancel')}</button>
        </form>
      {/if}
    </section>

    <section class="add-section" aria-labelledby="water-add-heading">
      <h3 id="water-add-heading">{$_('water_tracking.add')}</h3>
      <div class="shortcuts">
        {#each shortcuts as container (container.id)}
          <button type="button" class="btn btn-secondary shortcut" disabled={busy} on:click={() => save(() => onAdd(container.volumeMl))}>
            <strong>+ {format(container.volumeMl)}</strong>
            {#if container.name}<span>{waterContainerLabel(container, $_)}</span>{/if}
          </button>
        {/each}
      </div>
      <form class="custom-amount" on:submit|preventDefault={addCustom}>
        <label for="water-amount">{volumeLabel}</label>
        <div class="form-line">
          <input id="water-amount" class="input" type="text" inputmode="decimal" use:decimalInput bind:value={amount} />
          <button type="submit" class="btn btn-primary" disabled={busy}>{$_('diary.water.add')}</button>
        </div>
      </form>
    </section>

    {#if error}<p class="error" role="alert">{$_(error)}</p>{/if}

    <section class="history" aria-labelledby="water-history-heading">
      <h3 id="water-history-heading">{$_('water_tracking.history')}</h3>
      {#if !logs.length && !beverages.length}
        <p>{$_('water_tracking.empty')}</p>
      {:else}
        <ul>
          {#each orderedLogs as { log, index } (log.uuid || index)}
            <li>
              {#if edited && (edited.log.uuid ? edited.log.uuid === log.uuid : edited.log === log)}
                <form class="custom-amount" on:submit|preventDefault={saveEdit}>
                  <label for="water-edit">{volumeLabel}</label>
                  <div class="form-line">
                    <input id="water-edit" class="input" type="text" inputmode="decimal" use:decimalInput bind:value={editDraft} />
                    <button type="submit" class="btn btn-primary" disabled={busy}>{$_('common.save')}</button>
                    <button type="button" class="btn-icon" aria-label={$_('common.cancel')} on:click={() => { edited = null; error = ''; }}>
                      <span class="material-symbols-rounded" aria-hidden="true">close</span>
                    </button>
                  </div>
                </form>
              {:else}
                <div class="log-row">
                  <span><strong>{format(log.amount)}</strong> {#if log.time}<small>{log.time}</small>{/if}</span>
                  <button type="button" class="btn-icon" disabled={busy} aria-label={$_('water_tracking.edit_entry')} on:click={() => edit(log, index)}>
                    <span class="material-symbols-rounded" aria-hidden="true">edit</span>
                  </button>
                  <button type="button" class="btn-icon" disabled={busy} aria-label={$_('water_tracking.delete_entry')} on:click={() => save(() => onRemove(log, index))}>
                    <span class="material-symbols-rounded" aria-hidden="true">delete</span>
                  </button>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if beverages.length}
        <h4>{$_('water_tracking.diary_beverages')}</h4>
        <p>{$_('water_tracking.diary_beverages_help')}</p>
        <ul>
          {#each beverages as beverage}
            <li class="beverage-row"><span>{beverage.name}</span><strong>{format(beverage.volume)}</strong></li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</Sheet>

<style>
  .water-sheet { display: grid; gap: 18px; }
  section { min-width: 0; }
  .summary { padding: 12px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface-2); }
  .date, .progress-label { margin: 0; color: var(--text-2); font-size: .82rem; }
  .totals { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 8px; margin: 8px 0; }
  .totals > div, .goal { display: grid; text-align: left; gap: 4px; min-width: 0; }
  .totals > div > span, .goal > span { color: var(--text-2); font-size: .8rem; }
  .totals strong { overflow-wrap: anywhere; font-size: 1.05rem; }
  .goal { border: 1px solid var(--border); border-radius: 8px; background: var(--surface-1); padding: 6px 8px; min-height: 44px; }
  .goal .material-symbols-rounded { vertical-align: middle; font-size: 14px; }
  progress { width: 100%; height: 8px; accent-color: #3182bd; }
  h3 { margin: 0 0 8px; font-size: .98rem; }
  .shortcuts { display: flex; gap: 6px; flex-wrap: wrap; }
  .shortcut { display: grid; align-content: center; gap: 2px; min-height: 44px; padding: 6px 10px; }
  .shortcut > span { color: var(--text-2); font-size: .72rem; }
  .custom-amount, .edit-goal { display: grid; gap: 5px; margin-top: 10px; }
  .form-line { display: flex; align-items: center; gap: 6px; }
  .form-line input { flex: 1; min-width: 0; }
  .form-line button { flex-shrink: 0; }
  label, .edit-goal p, .history p { font-size: .83rem; color: var(--text-2); margin: 0; }
  .edit-goal > button { justify-self: start; }
  .history ul { list-style: none; margin: 0; padding: 0; }
  .history li { border-top: 1px solid var(--border); padding-block: 4px; }
  .log-row { display: flex; align-items: center; gap: 4px; }
  .log-row > span { flex: 1; }
  .log-row small { margin-inline-start: 6px; color: var(--text-2); }
  h4 { margin: 10px 0 4px; font-size: .9rem; }
  .beverage-row { display: flex; justify-content: space-between; gap: 8px; }
  .beverage-row strong { flex-shrink: 0; }
  .error { color: var(--danger); margin: 0; }
</style>
