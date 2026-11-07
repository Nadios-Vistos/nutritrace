<script>
  import { onDestroy } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { aiEffectivelyEnabled, aiProvider, aiApiKey, aiModel, aiBaseUrl, envLocks } from '../../stores/settings.js';
  import { avatarKinds, avatarPreset, normalizeAvatar, skinColors, hairColors, eyeColors, hairStyles, suggestAvatar } from '../../lib/family-avatar.js';
  import { prepareVisionPhoto } from '../../lib/photo-vision.js';
  import AttachImageButton from '../ai/AttachImageButton.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import FamilyMascot from './FamilyMascot.svelte';

  export let avatar;
  export let onSave;
  export let onClose;

  let draft = normalizeAvatar(avatar);
  let photo = '';
  let preparing = false;
  let analysing = false;
  let error = '';
  let suggested = false;
  let active = true;
  $: busy = preparing || analysing;
  onDestroy(() => active = false);

  const fields = [
    { key: 'style', values: hairStyles },
    { key: 'skin', values: Object.keys(skinColors) },
    { key: 'hair', values: Object.keys(hairColors) },
    { key: 'eyes', values: Object.keys(eyeColors) },
  ];

  function choose(kind) {
    if (kind === draft.kind) return;
    draft = avatarPreset(kind);
    photo = '';
    error = '';
    suggested = false;
  }

  async function pickPhoto(event) {
    const file = event.detail[0];
    if (!file || busy) return;
    preparing = true;
    photo = '';
    error = '';
    suggested = false;
    try {
      const prepared = await prepareVisionPhoto(file);
      if (active) photo = prepared;
    } catch {
      if (active) error = 'meal_photo.photo_error';
    } finally {
      preparing = false;
    }
  }

  async function analyse() {
    if (!photo || busy || !$aiEffectivelyEnabled) return;
    analysing = true;
    error = '';
    try {
      const result = await suggestAvatar(photo, draft, {
        proxy: !!$envLocks.ai, provider: $aiProvider, apiKey: $aiApiKey,
        model: $aiModel, baseUrl: $aiBaseUrl,
      });
      if (!active) return;
      draft = result;
      photo = '';
      suggested = true;
    } catch {
      if (active) error = 'family_avatar.analysis_error';
    } finally {
      analysing = false;
    }
  }
</script>

<Sheet open title={$_('family_avatar.edit')} on:close={onClose}>
  <form class="avatar-editor" on:submit|preventDefault={() => onSave(draft)}>
    <div class="choices">
      {#each avatarKinds as kind}
        <button type="button" aria-pressed={draft.kind === kind} disabled={busy} on:click={() => choose(kind)}>
          <div class="choice-preview"><FamilyMascot avatar={draft.kind === kind ? draft : avatarPreset(kind)} decorative /></div>
          {$_(`family_avatar.kind.${kind}`)}
        </button>
      {/each}
    </div>

    {#if draft.kind !== 'rabbit'}
      <details>
        <summary>{$_('family_avatar.customize')}</summary>
        <fieldset disabled={busy}>
          {#each fields as { key, values }}
            <label>
              {$_(`family_avatar.field.${key}`)}
              <select class="select" value={draft[key]} on:change={(event) => draft = { ...draft, [key]: event.currentTarget.value }}>
                {#each values as value}
                  <option value={value}>{$_(`family_avatar.option.${value}`)}</option>
                {/each}
              </select>
            </label>
          {/each}
          <label class="glasses"><input type="checkbox" bind:checked={draft.glasses} /> {$_('family_avatar.glasses')}</label>
        </fieldset>
      </details>
      <details>
        <summary>{$_('family_avatar.from_photo')}</summary>
        {#if $aiEffectivelyEnabled}
          <p>{$_('family_avatar.privacy')}</p>
          <AttachImageButton inlineChoices capture="user" disabled={busy} on:files={pickPhoto} />
          {#if photo}
            <img class="portrait" src={photo} alt={$_('family_avatar.selected_photo')} />
            <button class="btn btn-secondary" type="button" on:click={analyse} disabled={busy}>
              {$_(analysing ? 'family_avatar.analysing' : 'family_avatar.analyse')}
            </button>
          {/if}
          {#if suggested}<p role="status">{$_('family_avatar.review')}</p>{/if}
          {#if error}<p class="error" role="alert">{$_(error)}</p>{/if}
        {:else}
          <p>{$_('family_avatar.ai_required')}</p>
          <a href="#/settings/ai" on:click={onClose}>{$_('meal_photo.settings')}</a>
        {/if}
      </details>
    {/if}

    <button type="submit" class="btn btn-primary save" disabled={busy}>{$_('common.save')}</button>
  </form>
</Sheet>

<style>
  .avatar-editor, details { display: grid; gap: 12px; }
  .choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .choices button {
    display: grid; justify-items: center; align-content: center; gap: 4px; padding: 6px 3px;
    min-height: 106px; border: 1px solid var(--border); border-radius: 12px;
    background: var(--surface-2); font-size: .76rem; font-weight: 650;
  }
  .choices button[aria-pressed="true"] { border-color: #a74c6b; background: color-mix(in srgb, #a74c6b 24%, var(--surface-2)); }
  .choice-preview { display: grid; place-items: center; width: min(100%, 96px); }
  .choices button[aria-pressed="true"] .choice-preview { background: #731e3d; border-radius: 9px; }
  details { border: 1px solid var(--border); border-radius: 10px; padding: 9px; }
  summary { cursor: pointer; padding-block: 4px; font-weight: 650; }
  fieldset { margin: 8px 0 0; padding: 0; border: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  label { display: grid; gap: 4px; font-size: .84rem; }
  .glasses { display: flex; align-items: center; min-height: 42px; }
  .portrait { display: block; width: 64px; height: 64px; object-fit: cover; border-radius: 8px; margin: 8px 0; }
  p { margin: 6px 0; color: var(--text-2); font-size: .84rem; }
  .error { color: var(--danger); }
  .save { justify-self: end; background: #781d3d; color: #fff5ef; }
</style>
