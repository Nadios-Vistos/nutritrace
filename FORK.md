# Ce fork : écarts avec le projet d'origine et mise à jour

Ce dépôt est un fork de [traceapps/nutritrace](https://github.com/traceapps/nutritrace).
Ce document dit où le fork s'écarte de l'original, pourquoi, et comment se
recaler sur une nouvelle version publiée. État au 10 novembre 2026, base
v1.4.0.

## Branches

| Branche | Contenu |
| --- | --- |
| `main` | L'original, plus un commit : `.github/workflows/docker.yml` fabrique à la demande l'image amd64 du fork sur GHCR. |
| `mode-familial` | Tout le travail du fork. C'est la branche à construire et à déployer. |

## Ce que le fork ajoute

Journal simplifié et avatars, parcours d'objectifs pour les adultes, catalogue
Ciqual 2025, aliments du quotidien, atlas de portions (FNDDS et photos ASA24),
miroir de la bibliothèque Mealie, IA partagée avec quota quotidien,
reconnaissance des repas par photo, hydratation comptant les boissons,
traduction française complète. Les sources de données sont décrites dans
`LICENSES.md`, les flux de données dans `PRIVACY.md`.

## Où sont les écarts

Le fork ajoute 44 fichiers qui lui sont propres (hors images de portions) et
modifie 107 fichiers de l'original (+6 211 / −1 760 lignes). Seuls ces
derniers peuvent entrer en conflit lors d'une mise à jour.

| Catégorie | Fichiers | Lignes | Risque de conflit | Que faire |
| --- | --- | --- | --- | --- |
| Traductions `src/i18n/en.json`, `fr.json` | 2 | +3 286 / −51 | Élevé mais mécanique | Garder les deux côtés ; `npm run i18n:check` détecte les doublons. Proposer la traduction française à l'original. |
| Commit Garmin #279 repris de `dev` | 15 | +632 / −49 | Disparaît | À retirer quand l'original publie la v1.5 (voir procédure). |
| Tests d'origine rendus compatibles Windows | 24 | +111 / −101 | Moyen | À proposer à l'original ; sinon reprendre leur version et réappliquer `scripts/fixtures/source-text.js`. |
| Écrans et bibliothèques `src/` | 51 | +2 247 / −1 515 | Élevé | Voir ci-dessous. |
| Serveur `server/` | 19 | +393 / −61 | Faible à moyen | Ajouts localisés (routes, tables, appels à `hydrationTotal`). |
| Documentation | 3 | +125 / −20 | Faible | Reprendre leur version, réinsérer les sections du fork. |

### Écrans les plus touchés

| Fichier | Lignes | Nature des modifications |
| --- | --- | --- |
| `src/routes/Diary.svelte` | +351 / −569 | Bascule vers `FamilyDiary.svelte`, eau déplacée dans `WaterSheet.svelte`, textes traduits. |
| `src/routes/Foods.svelte` | +340 / −149 | Sources Ciqual, quotidien, atlas et Mealie dans la recherche ; textes traduits. |
| `src/routes/MealEditor.svelte` | +339 / −207 | Recherche d'ingrédients sur toutes les sources, portions visuelles ; textes traduits. |
| `src/components/settings/SettingsWellness.svelte` | +340 / −16 | Presque entièrement le commit Garmin #279. |
| `src/routes/Goals.svelte` | +109 / −30 | Budget adaptatif familial, relance du parcours d'objectifs. |
| `src/routes/Statistics.svelte`, `src/components/ai/Trace.svelte` | ≈ +72 / −62 chacun | Surtout des textes traduits. |

Ces modifications sont réparties en dizaines de petits blocs (62 dans
`Diary.svelte`, 63 dans `Foods.svelte`). La plupart ne sont pas du « code
familial » déplaçable : ce sont des textes en dur remplacés par des clés de
traduction, ou des changements du comportement d'origine (hydratation,
recherche multi-sources). Les extraire dans des composants ne les ferait pas
disparaître. Ce qui était isolable l'a été :

- `src/components/diary/Family*.svelte`, `WaterSheet.svelte`
- `src/components/foods/MealieRecipeSheet.svelte`
- `src/components/settings/FamilyAiSettings.svelte`, `MealieMirror.svelte`
- `src/components/ui/PortionPicker.svelte`
- `src/lib/` : `ciqual.js`, `portions.js`, `portion-atlas.js`, `family-*.js`,
  `meal-photo.js`, `photo-vision.js`, `mealie-mirror-image.js`, `water-volume.js`
- `server/lib/` : `mealie-mirror.js`, `family-ai.js`, `family-ai-quota.js`,
  `shared-config-secrets.js`

La liste complète et à jour des fichiers d'origine modifiés s'obtient par :

```sh
git diff --stat --diff-filter=M main...mode-familial
```

## Le commit Garmin

`d7e9d50` « Garmin: connect with a Personal API Key (#279) » est repris de la
branche `dev` de l'original (leur commit `fb53dde`), avant sa publication. Il
n'appartient pas au fork. Quand une version publiée le contient, il faut le
retirer de `mode-familial` au lieu de le fusionner.

## Règles pour limiter les écarts

1. Tout nouveau code du fork va dans un fichier propre au fork. Un fichier
   d'origine ne reçoit que l'import et la ligne de branchement.
2. Ne pas reformater ni réordonner un fichier d'origine, et conserver ses fins
   de ligne (certains sont en CRLF, d'autres en LF).
3. Tout texte visible passe par `en.json` et `fr.json`.
4. Les corrections utiles à tous (traduction, compatibilité Windows des tests,
   bogues de l'original) sont à proposer à l'original : une fois acceptées,
   elles sortent de l'écart.
5. Avant de pousser : `npm run i18n:check` et `npm test`.

## Se recaler sur une nouvelle version

L'original publie chaque version sur sa branche `main` en un seul commit
regroupé. Ne pas fusionner sa branche `dev` : un essai a donné 120 fichiers
en conflit.

Préparation, une seule fois :

```sh
git remote add upstream https://github.com/traceapps/nutritrace.git
```

À chaque version publiée :

```sh
# 1. Sauvegarder l'état actuel
git fetch upstream --tags
git fetch origin
git branch sauvegarde-avant-maj origin/mode-familial
git tag ancienne-base origin/main

# 2. Recaler main (un seul commit du fork : le workflow Docker)
git checkout main
git rebase upstream/main
git push --force-with-lease origin main

# 3. Recaler mode-familial sur le nouveau main
git checkout mode-familial
git rebase --onto main ancienne-base
```

Pendant l'étape 3 :

- **Commit Garmin** : si la nouvelle version contient déjà #279, lancer plutôt
  `git rebase -i --onto main ancienne-base` et supprimer la ligne de `d7e9d50`.
- **`src/i18n/*.json`** : garder les clés des deux côtés.
- **`package-lock.json`** : prendre leur version, puis `npm install`.
- **Écrans** : partir de leur version et réappliquer les blocs du fork, en
  s'aidant de `git diff ancienne-base sauvegarde-avant-maj -- <fichier>`.

Vérification puis publication :

```sh
npm ci && npm ci --prefix server
npm run i18n:check && npm test && npm run build
git push --force-with-lease origin mode-familial
git tag -d ancienne-base
```

Avant de déployer la nouvelle image : faire une sauvegarde complète depuis
l'application, lancer le workflow « Fabriquer l'image du fork » sur
`mode-familial`, puis vérifier le journal, la recherche d'aliments, le miroir
Mealie et l'IA partagée. Mettre à jour la date et la base en tête de ce
document.
