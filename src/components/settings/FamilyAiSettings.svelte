<script>
  import { _ } from 'svelte-i18n';
  import { NtApi } from '../../lib/api.js';
  import { envLocks as serverEnvLocks } from '../../stores/settings.js';

  export let envLocks;
  export let saveSource;

  let dailyLimit;
  let busy = false;
  let errorKey = '';
  $: savedLimit = envLocks.ai_shared_daily_limit;
  $: dailyLimit = savedLimit;
  $: validLimit = Number.isSafeInteger(dailyLimit) && dailyLimit >= 0;

  async function update(changes) {
    if (busy) return;
    busy = true;
    errorKey = '';
    try {
      if (changes.enabled === true) await saveSource();
      const flags = await NtApi.put('/api/ai/family', changes);
      serverEnvLocks.update(locks => ({ ...locks, ...flags }));
    } catch {
      errorKey = changes.enabled === undefined ? 'settings_trace.family.quota_error' : 'settings_trace.family.error';
    } finally {
      busy = false;
    }
  }

  function activate() {
    return update({ enabled: true, ...(validLimit ? { dailyLimit } : {}) });
  }
</script>

<div class="card settings-card">
  <div class="setting-row">
    <div>
      <span class="setting-label">{$_('settings_trace.family.title')}</span>
      <div class="setting-desc">{$_('settings_trace.family.description')}</div>
    </div>
    <button type="button" class="btn btn-secondary" on:click={() => envLocks.ai_shared ? update({ enabled: false }) : activate()} disabled={busy}>
      {$_(envLocks.ai_shared ? 'settings_trace.family.disable' : 'settings_trace.family.enable')}
    </button>
  </div>
  {#if envLocks.ai_shared_needs_link}
    <div class="setting-row">
      <div class="setting-desc" role="status">{$_('settings_trace.family.link_notice')}</div>
      <button type="button" class="btn btn-secondary" on:click={activate} disabled={busy}>
        {$_('settings_trace.family.link')}
      </button>
    </div>
  {:else if envLocks.ai_shared}
    <div class="setting-row">
      <div class="setting-desc">{$_('settings_trace.family.auto_update')}</div>
    </div>
  {/if}
  <div class="setting-divider"></div>
  <form class="setting-row quota" on:submit|preventDefault={() => validLimit && update({ dailyLimit })}>
    <div>
      <label for="family-ai-daily-limit" class="setting-label">{$_('settings_trace.family.quota')}</label>
      <div id="family-ai-quota-hint" class="setting-desc">{$_('settings_trace.family.quota_hint')}</div>
    </div>
    <div class="quota-controls">
      <input id="family-ai-daily-limit" class="input" type="number" min="0" step="1" required
        aria-describedby="family-ai-quota-hint" bind:value={dailyLimit} disabled={busy} />
      <button type="submit" class="btn btn-secondary" disabled={busy || !validLimit || dailyLimit === savedLimit}>{$_('common.save')}</button>
    </div>
  </form>
  {#if envLocks.ai_shared_secret_unreadable}
    <div class="setting-row"><p class="setting-desc" role="alert">{$_('settings_trace.family.secret_unreadable')}</p></div>
  {/if}
  {#if errorKey}
    <div class="setting-row"><p class="setting-desc" role="alert">{$_(errorKey)}</p></div>
  {/if}
</div>

<style>
  .quota, .quota-controls { flex-wrap: wrap; gap: 8px; }
  .quota-controls { display: flex; align-items: center; }
  .quota-controls input { width: 7em; }
</style>
