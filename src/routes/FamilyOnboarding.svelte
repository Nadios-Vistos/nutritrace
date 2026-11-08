<script>
  import { _, locale } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { onMount, tick } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { NtApi } from '../lib/api.js';
  import FamilyMascot from '../components/diary/FamilyMascot.svelte';
  import { decimalInput } from '../lib/decimal-input.js';
  import { ACTIVITY_LEVELS, estimateFamilyGoals } from '../lib/family-onboarding.js';
  import { currentUser } from '../stores/auth.js';
  import { goals, loadServerSettings, weightUnit } from '../stores/settings.js';
  import { DB, localDateStr } from '../lib/db.js';
  import { readBodyStat } from '../lib/body-stats-unit.js';
  import { resolveGoalFor } from '../lib/goal-resolver.js';

  export let recalculating = false;

  const steps = ['welcome', 'profile', 'routine', 'result'];
  const icons = ['', 'person', 'directions_walk', ''];
  let step = 0;
  let heading;
  let saving = false;
  let saveError = false;
  let gender = '';
  let age = '';
  let height = '';
  let weight = '';
  let target = '';
  let activity = '';

  onMount(async () => {
    if (!recalculating) return;
    gender = DB.getSetting('gender', $currentUser?.gender || '');
    age = String(DB.getSetting('familyProfileAge', '') ?? '');
    const birthday = $currentUser?.birthday || DB.getSetting('dob', '');
    if (birthday) {
      const dob = new Date(birthday + 'T12:00:00');
      const today = new Date();
      if (Number.isFinite(dob.getTime())) {
        const beforeBirthday = today.getMonth() < dob.getMonth() ||
          (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
        age = String(today.getFullYear() - dob.getFullYear() - Number(beforeBirthday));
      }
    }
    height = String(DB.getSetting('height_cm', '') ?? '');
    weight = String(DB.getSetting('weight_kg', '') ?? '');
    activity = DB.getSetting('activity', '');
    const kg = value => readBodyStat({ weight: value, weight_unit: $weightUnit }, 'weight', 'kg');
    const goal = resolveGoalFor($goals?.weight, localDateStr());
    target = String((goal != null ? kg(goal) : DB.getSetting('target_weight', '')) ?? '');
    const initialWeight = weight;
    try {
      const today = localDateStr();
      const days = await NtApi.getAllDiary();
      for (const day of [...days].sort((a, b) => b.date.localeCompare(a.date))) {
        if (day.date > today) continue;
        const stats = day.body_stats || day.bodyStats;
        const value = readBodyStat({ weight_unit: $weightUnit, ...stats }, 'weight', 'kg');
        if (value > 0) {
          if (weight === initialWeight && step <= 2) weight = String(value);
          break;
        }
      }
    } catch { /* The profile weight is available when the journal cannot be loaded. */ }
  });

  function number(value) {
    const trimmed = value.trim();
    return /^\d+(?:[.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : NaN;
  }

  $: profile = {
    gender, age: number(age), height_cm: number(height),
    weight_kg: number(weight),
    target_weight: target.trim() ? number(target) : number(weight),
    activity,
  };
  $: validProfile = gender && Number.isInteger(profile.age) && profile.age >= 18 &&
    profile.age <= 120 && profile.height_cm >= 100 && profile.height_cm <= 250;
  $: estimate = estimateFamilyGoals(profile);
  $: numbers = new Intl.NumberFormat($locale || undefined, { maximumFractionDigits: 1 });

  async function go(to) {
    step = to;
    saveError = false;
    await tick();
    heading?.focus();
  }

  async function save(skip = false) {
    if (saving || (!skip && estimate.error)) return;
    const account = $currentUser.id;
    saving = true;
    saveError = false;
    try {
      const { user } = await NtApi.put('/api/auth/onboarding', {
        ...(!skip && { ...profile, adult: true }), skip, account, recalculate: recalculating,
      });
      if (get(currentUser)?.id !== user.id) return;
      await loadServerSettings();
      if (get(currentUser)?.id !== user.id) return;
      localStorage.setItem('nt:cachedUser', JSON.stringify(user));
      currentUser.set(user);
      if (recalculating) await push('/goals');
    } catch {
      saveError = true;
    } finally {
      saving = false;
    }
  }
  function advance() {
    if (step === 0 || (step === 1 && validProfile) || (step === 2 && estimate.error !== 'invalid')) go(step + 1);
    else if (step === 3) save();
  }
</script>

<main class="onboarding">
  <section class="card onboarding-card" aria-labelledby="onboarding-title">
    <div class="onboarding-progress" aria-hidden="true">
      {#each steps as _, i}
        <span class:reached={i <= step}></span>
      {/each}
    </div>
    {#if icons[step]}
      <div class="onboarding-icon"><span class="material-symbols-rounded" aria-hidden="true">{icons[step]}</span></div>
    {:else}
      <div class="onboarding-mascot"><FamilyMascot decorative mood={step === 0 ? 'smile' : 'curious'} /></div>
    {/if}
    <p class="step-count">{$_('family_onboarding.step', { values: { step: step + 1, total: steps.length } })}</p>
    <h1 id="onboarding-title" tabindex="-1" bind:this={heading}>{$_(recalculating && step === 0 ? 'family_onboarding.recalculate' : 'family_onboarding.' + steps[step])}</h1>
    <form on:submit|preventDefault={advance}>
      {#if step === 0}
        <p>{$_(recalculating ? 'family_onboarding.recalculate_intro' : 'family_onboarding.intro')}</p>
        <p class="text-2">{$_('family_onboarding.adult_only')}</p>
      {:else if step === 1}
        <fieldset>
          <legend>{$_('family_onboarding.sex')}</legend>
          <div class="profile-options">
            {#each ['female', 'male'] as value}
              <label class:chosen={gender === value}><input type="radio" name="sex" bind:group={gender} {value} /> {$_('family_onboarding.' + value)}</label>
            {/each}
          </div>
        </fieldset>
        <div class="profile-options">
          <label>{$_('family_onboarding.age')}<input class="input" type="text" inputmode="numeric" bind:value={age} /></label>
          <label>{$_('family_onboarding.height')}<input class="input" type="text" inputmode="decimal" use:decimalInput bind:value={height} /></label>
        </div>
        {#if age && profile.age < 18}<p class="text-2">{$_('family_onboarding.adult_only')}</p>{/if}
      {:else if step === 2}
        <div class="profile-options">
          <label>{$_('family_onboarding.weight')}<input class="input" type="text" inputmode="decimal" use:decimalInput bind:value={weight} /></label>
          <label>{$_('family_onboarding.target')}<input class="input" type="text" inputmode="decimal" use:decimalInput bind:value={target} placeholder={weight} /></label>
        </div>
        <p class="text-2">{$_('family_onboarding.target_hint')}</p>
        <fieldset>
          <legend>{$_('family_onboarding.activity')}</legend>
          {#each ACTIVITY_LEVELS as value}
            <label class="activity" class:chosen={activity === value}>
              <input type="radio" name="activity" bind:group={activity} {value} />
              <span><strong>{$_('family_onboarding.level.' + value)}</strong><small>{$_('family_onboarding.level_hint.' + value)}</small></span>
            </label>
          {/each}
        </fieldset>
      {:else}
        {#if estimate.error}
          <p role="status">{$_('family_onboarding.' + estimate.error)}</p>
        {:else}
          <dl class="onboarding-results">
            <div class="result-budget">
              <dt>{$_('family_onboarding.budget')}</dt>
              <dd>{numbers.format(estimate.calories)} <small>{$_('family_onboarding.kcal_day')}</small></dd>
            </div>
            <div><dt>{$_('family_onboarding.maintenance')}</dt><dd>{numbers.format(estimate.maintenance)} <small>{$_('family_onboarding.kcal_day')}</small></dd></div>
            <div><dt>{$_('family_onboarding.bmi')}</dt><dd>{numbers.format(estimate.bmi)}</dd></div>
          </dl>
          <p>{$_('family_onboarding.' + (estimate.direction === 0 ? 'maintain' : estimate.direction < 0 ? 'lose' : 'gain'))}</p>
          <p class="text-2">{$_(recalculating ? 'family_onboarding.recalculate_fixed' : 'family_onboarding.indicative')}</p>
        {/if}
      {/if}
      {#if saveError}<p role="alert">{$_('family_onboarding.save_error')}</p>{/if}
      <div class="onboarding-actions">
        {#if step > 0}<button class="btn btn-secondary" type="button" disabled={saving} on:click={() => go(step - 1)}>{$_('meal_editor.back')}</button>{/if}
        {#if step === 0}
          <button class="btn btn-primary" type="submit" disabled={saving}>{$_('family_onboarding.start')}</button>
        {:else if step < 3}
          <button class="btn btn-primary" type="submit" disabled={step === 1 ? !validProfile : estimate.error === 'invalid'}>
            {$_(step === 1 ? 'family_onboarding.next' : 'family_onboarding.see_result')}
          </button>
        {:else if !estimate.error}
          <button class="btn btn-primary" type="submit" disabled={saving}>{$_(saving ? 'common.saving' : 'family_onboarding.apply')}</button>
        {/if}
      </div>
      {#if recalculating}
        <button class="btn btn-ghost skip" type="button" disabled={saving} on:click={() => push('/goals')}>{$_('common.cancel')}</button>
      {:else if step === 0 || (step === 1 && age && profile.age < 18) || (step === 3 && estimate.error)}
        <button class="btn btn-ghost skip" type="button" disabled={saving} on:click={() => save(true)}>{$_('family_onboarding.skip')}</button>
      {/if}
    </form>
  </section>
</main>

<style>
  .onboarding {
    display: grid;
    place-items: center;
    min-height: 100dvh;
    height: 100dvh;
    overflow-y: auto;
    padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
  }
  .onboarding-card { width: min(100%, 480px); padding: clamp(16px, 5vw, 32px); }
  .onboarding-progress { display: flex; gap: 6px; margin-bottom: 20px; }
  .onboarding-progress span { flex: 1; height: 5px; border-radius: 4px; background: var(--surface-2); }
  .onboarding-progress .reached { background: var(--accent); }
  .onboarding-icon { display: grid; place-items: center; width: 52px; height: 52px; background: var(--accent-dim); color: var(--accent); border-radius: 16px; }
  .onboarding-icon span { font-size: 30px; }
  .onboarding-mascot { width: 72px; height: 66px; background: var(--accent-dim); border-radius: 18px; }
  .step-count { margin: 10px 0 2px; color: var(--text-2); font-size: .85rem; }
  h1 { margin: 0 0 16px; font-size: clamp(1.35rem, 6vw, 1.9rem); }
  form { display: grid; gap: 12px; }
  p, dl, dd { margin: 0; }
  fieldset { min-width: 0; border: 0; padding: 0; margin: 0; }
  legend { margin-bottom: 6px; font-weight: 600; }
  .profile-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .profile-options .input { margin-top: 5px; width: 100%; }
  fieldset label { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; }
  fieldset input { accent-color: var(--accent); }
  fieldset .chosen { border-color: var(--accent); background: var(--accent-dim); }
  .activity + .activity { margin-top: 5px; }
  small { display: block; color: var(--text-2); }
  .onboarding-results { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .onboarding-results div { padding: 10px; border-radius: var(--radius-md); background: var(--surface-2); }
  .onboarding-results dd { font-weight: 700; font-size: 1.25rem; }
  .onboarding-results small { display: inline; font-size: .8rem; }
  .onboarding-results .result-budget { grid-column: 1 / -1; background: var(--accent-dim); color: var(--accent); }
  .result-budget dd { font-size: 2rem; }
  .onboarding-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 4px; }
  .skip { justify-self: end; }
</style>
