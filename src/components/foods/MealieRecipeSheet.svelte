<script>
  // Fork (mode familial) : fiche d'une recette du miroir Mealie, avec ajout
  // au journal et enregistrement dans les aliments personnels. Extraite de
  // Foods.svelte pour limiter les modifications de ce fichier d'origine.
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';
  import Sheet from '../ui/Sheet.svelte';
  import { decimalInput, parseDecimal } from '../../lib/decimal-input.js';
  import { showSuccess, showError } from '../../stores/toast.js';
  import { editorState } from '../../stores/editorState.js';
  import { API } from '../../lib/api.js';

  export let recipe = null;
  export let pickMode = false;
  export let pickMeal = 0;
  export let pickDate = '';

  const dispatch = createEventDispatcher();
  let portions = '1';
  let importing = false;
  let adding = false;
  $: recipe, portions = '1';

  async function saveToFoods() {
    const current = recipe;
    if (!current || importing) return;
    importing = true;
    try {
      await API.importMirroredRecipe(current);
      if (recipe === current) recipe = null;
      showSuccess($_('food_editor.saved'));
      dispatch('saved');
    } catch {
      showError($_('common.errors.save_failed'));
    } finally {
      importing = false;
    }
  }

  async function logRecipe() {
    const current = recipe;
    const quantity = parseDecimal(portions);
    if (!current || current.nutrition.calories == null || !Number.isFinite(quantity) || quantity <= 0 || adding) return;
    adding = true;
    try {
      const { addDiaryItem } = await import('../../stores/diary.js');
      await addDiaryItem({
        name: current.name, portion: 1, unit: 'serving', quantity,
        nutrition: current.nutrition, source_app: current.source_app, source_external_id: current.source_external_id,
      }, Number(pickMeal) || 0, pickDate || undefined);
      showSuccess($_('foods.toast.added_to_diary'));
      editorState.lastMealAdded = Number(pickMeal) || 0;
      recipe = null;
      history.back();
    } catch {
      showError($_('mealie_mirror.log_error'));
    } finally {
      adding = false;
    }
  }
</script>

<Sheet open={recipe != null} title={recipe?.name || ''} on:close={() => recipe = null}>
  {#if recipe}
    <div class="mealie-recipe">
      {#if recipe.nutrition.calories == null}
        <p>{$_('mealie_mirror.missing')}</p>
      {:else if pickMode}
        <form on:submit|preventDefault={logRecipe}>
          <label>{$_('foods_deep.num_servings')}
            <input class="input" type="text" inputmode="decimal" use:decimalInput bind:value={portions} />
          </label>
          <p>{$_('mealie_mirror.per_serving', { values: { kcal: recipe.nutrition.calories } })}</p>
          <button class="btn btn-primary" type="submit" disabled={adding || !(parseDecimal(portions) > 0)}>{$_('foods.add_to_diary')}</button>
        </form>
      {:else}
        <p>{$_('mealie_mirror.per_serving', { values: { kcal: recipe.nutrition.calories } })}</p>
      {/if}
      {#if recipe.items.length}
        <ul>
          {#each recipe.items as ingredient}
            <li>{ingredient.portion} {ingredient.unit} {ingredient.name}{ingredient.notes ? ' · ' + ingredient.notes : ''}</li>
          {/each}
        </ul>
      {/if}
      {#if recipe.notes}<p class="mealie-recipe-notes">{recipe.notes}</p>{/if}
      {#if !pickMode}
        <button class="btn btn-secondary" type="button" on:click={saveToFoods} disabled={importing}>
          {$_('foods.save_to_foods')}
        </button>
      {/if}
    </div>
  {/if}
</Sheet>

<style>
  .mealie-recipe { display: grid; gap: 12px; padding: 8px 0; }
  .mealie-recipe form { display: grid; gap: 8px; }
  .mealie-recipe ul { padding-inline-start: 22px; }
  .mealie-recipe-notes { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
