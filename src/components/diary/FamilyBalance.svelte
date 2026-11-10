<script>
  // Fork (mode familial) : écart cumulé au budget sur 7 et 30 jours, avec
  // son équivalent estimé en poids. Calcul dans lib/calorie-balance.js.
  import { _, locale } from 'svelte-i18n';
  import Sheet from '../ui/Sheet.svelte';
  import { NtApi } from '../../lib/api.js';
  import { Nutrition } from '../../lib/nutrition.js';
  import { localDateStr } from '../../lib/db.js';
  import { calorieBalance } from '../../lib/calorie-balance.js';

  /** (date: 'YYYY-MM-DD') => budget en kcal, ou null */
  export let budgetFor = () => null;
  /** Change quand le journal affiché change : relance le chargement. */
  export let refresh = '';

  const PERIODS = [{ key: 'week', days: 7 }, { key: 'month', days: 30 }];
  let kcalByDate = null;
  let helpOpen = false;
  let request = 0;

  async function load() {
    const current = ++request;
    const all = await NtApi.getAllDiary().catch(() => null);
    if (current !== request || !all) return;
    const map = new Map();
    for (const entry of all) {
      if (!entry?.date) continue;
      const totals = Nutrition.sum((entry.items || []).map(item => Nutrition.calculate(item)));
      map.set(entry.date, Math.round(totals.calories || 0));
    }
    kcalByDate = map;
  }

  $: refresh, load();
  $: today = (refresh, localDateStr());
  $: results = kcalByDate
    ? PERIODS.map(period => ({ ...period, ...calorieBalance(kcalByDate, budgetFor, { today, days: period.days }) }))
    : [];
  $: visible = results.some(result => result.days > 0);
  $: whole = new Intl.NumberFormat($locale || undefined);
  $: signed = new Intl.NumberFormat($locale || undefined, {
    signDisplay: 'exceptZero', minimumFractionDigits: 1, maximumFractionDigits: 1,
  });

  function gapLabel(result, translate, format) {
    if (result.kcal === 0) return translate('family_balance.even');
    return translate(result.kcal > 0 ? 'family_balance.over' : 'family_balance.under',
      { values: { kcal: format.format(Math.abs(result.kcal)) } });
  }
</script>

{#if visible}
  <section class="balance" aria-labelledby="family-balance-title">
    <header>
      <h3 id="family-balance-title">{$_('family_balance.title')}</h3>
      <button type="button" class="help" aria-label={$_('family_balance.help_open')} on:click={() => helpOpen = true}>
        <span class="material-symbols-rounded" aria-hidden="true">help</span>
      </button>
    </header>
    <div class="periods">
      {#each results as result (result.key)}
        <div class="period">
          <span class="label">{$_(`family_balance.${result.key}`)}</span>
          {#if result.days > 0}
            <strong>{gapLabel(result, $_, whole)}</strong>
            <span class="weight">{$_('family_balance.weight', { values: { kg: signed.format(result.kg) } })}</span>
            <span class="count">{$_('family_balance.days', { values: { count: result.days } })}</span>
          {:else}
            <span class="count">{$_('family_balance.none')}</span>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <Sheet bind:open={helpOpen} title={$_('family_balance.help_title')}>
    <div class="help-text">
      <p>{$_('family_balance.help_sum')}</p>
      <p>{$_('family_balance.help_weight')}</p>
      <p>{$_('family_balance.help_budget')}</p>
      <p>{$_('family_balance.help_balance')}</p>
    </div>
  </Sheet>
{/if}

<style>
  .balance { display: grid; gap: 6px; margin-top: 10px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h3 { margin: 0; font-size: .86rem; font-weight: 650; }
  .help { display: grid; place-items: center; width: 32px; height: 32px; border: 0; background: none; color: var(--text-2); }
  .help .material-symbols-rounded { font-size: 18px; }
  .periods { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .period { display: grid; justify-items: center; gap: 2px; padding: 8px 4px; text-align: center; border: 1px solid var(--family-border); border-radius: 12px; background: var(--family-surface); }
  .label, .count { color: var(--text-2); font-size: .74rem; }
  strong { font-size: .9rem; }
  .weight { font-size: .82rem; }
  .help-text { display: grid; gap: 10px; padding: 8px 0; }
  .help-text p { margin: 0; }
</style>
