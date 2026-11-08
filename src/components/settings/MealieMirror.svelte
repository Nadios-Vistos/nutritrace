<script>
  import { onMount, onDestroy } from 'svelte';
  import { _, locale } from 'svelte-i18n';
  import { NtApi } from '../../lib/api.js';

  let status;
  let url = '';
  let token = '';
  let enabled = false;
  let busy = false;
  let failed = false;
  let saved = false;
  let timer;
  let closed = false;
  $: dirty = status && (url.trim() !== status.url || enabled !== status.enabled || !!token.trim());

  async function refresh() {
    try {
      status = await NtApi.get('/api/mealie/mirror');
      failed = false;
      if (status.running && !closed) timer = setTimeout(refresh, 3000);
    } catch {
      failed = true;
    }
  }

  onMount(async () => {
    await refresh();
    if (status) {
      url = status.url;
      enabled = status.enabled;
    }
  });
  onDestroy(() => { closed = true; clearTimeout(timer); });

  async function save() {
    busy = true;
    failed = false;
    saved = false;
    try {
      status = await NtApi.put('/api/mealie/mirror', { url, token, enabled });
      url = status.url;
      token = '';
      saved = true;
      if (enabled) await sync();
    } catch { failed = true; }
    finally { busy = false; }
  }

  async function sync() {
    busy = true;
    failed = false;
    clearTimeout(timer);
    try {
      status = await NtApi.post('/api/mealie/mirror/sync', {});
      if (status.running && !closed) timer = setTimeout(refresh, 3000);
    } catch { failed = true; }
    finally { busy = false; }
  }
</script>

<section class="card mealie-mirror" aria-labelledby="mealie-mirror-title">
  <h2 id="mealie-mirror-title">{$_('mealie_mirror.title')}</h2>
  <p class="text-2">{$_('mealie_mirror.description')}</p>
  {#if status}
    <form on:submit|preventDefault={save}>
      <label>{$_('settings_integrations.base_url')}
        <input class="input" type="url" required bind:value={url} autocomplete="off" />
      </label>
      <label>{$_('mealie_mirror.token')}
        <input class="input" type="password" bind:value={token} autocomplete="new-password"
          placeholder={status.hasToken && url.trim() === status.url ? $_('mealie_mirror.token_saved') : ''} />
      </label>
      <label class="toggle-row">
        {$_('mealie_mirror.enable')}
        <input type="checkbox" bind:checked={enabled} />
      </label>
      <div class="mirror-buttons">
        <button class="btn btn-primary" type="submit" disabled={busy || status.running || !dirty}>{$_('common.save')}</button>
        <button class="btn btn-secondary" type="button" on:click={sync} disabled={busy || status.running || dirty || !status.enabled}>{$_('mealie_mirror.sync_now')}</button>
      </div>
    </form>
    <p class="text-2" role="status">
      {$_('mealie_mirror.count', { values: { count: status.count } })}
      {#if status.running} · {$_('mealie_mirror.syncing')}
      {:else if status.lastSync} · {$_('mealie_mirror.last_sync', { values: { date: new Date(status.lastSync).toLocaleString($locale || undefined) } })}
      {:else if saved} · {$_('mealie_mirror.saved')}
      {/if}
    </p>
    {#if status.error && !status.running}<p role="alert">{$_('mealie_mirror.error_' + status.error)}</p>{/if}
  {/if}
  {#if failed}
    <p role="alert">{$_('mealie_mirror.error_settings')}</p>
    {#if !status}<button class="btn btn-secondary" type="button" on:click={refresh}>{$_('foods_deep.retry')}</button>{/if}
  {/if}
</section>

<style>
  .mealie-mirror { display: grid; gap: 12px; padding: 16px; }
  h2 { margin: 0; font-size: 1.05rem; }
  p { margin: 0; }
  form { display: grid; gap: 12px; }
  label .input { display: block; width: 100%; margin-top: 4px; }
  .toggle-row, .mirror-buttons { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .toggle-row { justify-content: space-between; }
  .toggle-row input { accent-color: var(--accent); }
</style>
