# Licenses & Data Sources

NutriTrace's source code is licensed under [AGPL-3.0](LICENSE). Some of the
integrations and data sources it can talk to are covered by separate licenses.
This file lists them so operators and contributors know what applies to what.

## Code

- **NutriTrace** — AGPL-3.0 (see [LICENSE](LICENSE)). Applies to the entire
  codebase in this repository including the Android app source.

## Data sources

This fork bundles the Anses Ciqual catalogue, a USDA FNDDS portion atlas and
portion references adapted from FNDDS and the Canadian Nutrient File. The
matching and import process is described in the
[portion reference documentation](src/lib/catalogues/portion-references.md).

| Source                       | License                          | How NutriTrace uses it                                                                                                         |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Ciqual 2025 (Anses)**       | [Licence Ouverte Etalab 2.0][ciqual-license] | Bundled read-only catalogue. Records use the Ciqual food codes and published numeric values per 100 g. |
| **Open Food Facts**          | [ODbL 1.0][odbl]                 | Live queries against the OFF public API. Only foods the user actually searches are cached locally in that user's own SQLite.   |
| **Open Food Facts (mirror)** | [ODbL 1.0][odbl]                 | Opt-in via `OFF_LOCAL_DB` env var. Server downloads OFF's own public snapshot ([Hugging Face][hf-off]) to the operator's disk. |
| **USDA FoodData Central**    | Public domain, [CC0 1.0][usda-license] | Live queries with the user's own [api.data.gov][usda] key. |
| **FNDDS 2021–2023 (USDA ARS)** | Public domain, [CC0 1.0][usda-license] | Bundled atlas of foods, nutrient values and household measures in grams. Selected measures also provide portion weights for Ciqual foods. |
| **Canadian Nutrient File 2015 (Health Canada)** | [Open Government Licence – Canada][cnf-license] and [2015 reuse guidance][cnf-terms] | Selected French and English measure labels and conversion factors used for portion weights on matched Ciqual foods. |
| **Mealie**                   | Original terms of the recipes; Mealie software is MIT | Per-user live queries or an administrator-configured mirror. |
| **Local Foods**              | Owned by the self-hoster         | User-created via the app UI or CSV import.                                                                                     |

[odbl]: https://opendatacommons.org/licenses/odbl/1-0/
[hf-off]: https://huggingface.co/datasets/openfoodfacts/product-database
[usda]: https://api.data.gov/
[usda-license]: https://fdc.nal.usda.gov/api-guide/
[fndds]: https://fdc.nal.usda.gov/download-datasets/
[cnf]: https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/nutrient-data/canadian-nutrient-file-2015-download-files.html
[cnf-record]: https://open.canada.ca/data/en/dataset/089885f9-ed53-44e6-854a-14d21a1ec2e0
[cnf-license]: https://open.canada.ca/open-government-licence-canada
[cnf-terms]: https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/nutrient-data/canadian-nutrient-file-compilation-canadian-food-composition-data-users-guide.html
[ciqual-license]: https://ciqual.anses.fr/cms/fr/mentions-legales

The bundled extract credits **Anses. 2025. Table de composition nutritionnelle
des aliments Ciqual** ([source and release][ciqual]). Regenerate it from the
official `alim`, `alim_grp` and `compo` XML files with
`python3 scripts/import-ciqual.py SOURCE_DIR src/lib/catalogues/ciqual-2025.json`.

[ciqual]: https://doi.org/10.57745/RDMHWY

## Notes for operators

### Open Food Facts (default live API)

Individual per-request records are queried on demand. Only a small per-user
cache of foods actually searched accumulates in each user's local SQLite. No
substantial derived database is redistributed by NutriTrace, so ODbL's
share-alike terms don't apply to the default configuration.

### Open Food Facts local mirror (`OFF_LOCAL_DB`)

Opt-in. When enabled, the NutriTrace server downloads OFF's own publicly
published snapshot (Parquet format from Hugging Face by default) to the
operator's disk and queries it locally. The Docker image itself never contains
OFF data; the download happens on the operator's volume at runtime.

**ODbL share-alike does apply to operators who run a multi-user or public
NutriTrace instance with the local mirror enabled.** Because operators are
running a service against a derived-database query engine, they inherit
OFF's ODbL obligations for their operation. In practice this is straightforward
to comply with: OFF's source data is already publicly available at the
Hugging Face URL above under ODbL, so pointing users at that link satisfies
the "source available" requirement. If an operator projects, restructures,
or extends the OFF data beyond straight lookups, they may need to make that
derived database available under ODbL as well.

Single-user self-hosters running the mirror for their own use don't have
public-facing obligations.

### USDA FoodData Central

Source and attribution — U.S. Department of Agriculture, Agricultural
Research Service, FoodData Central, FNDDS 2021–2023. The bundled atlas
preserves USDA food identifiers and adds French search aliases.
USDA publishes FoodData Central data under CC0 1.0 and requests attribution.
[Dataset][fndds] · [USDA licensing statement][usda-license]

### Canadian Nutrient File 2015

Source and attribution — Canadian Nutrient File, Health Canada, 2015
(*Fichier canadien sur les éléments nutritifs*). The open-data record lists
the Open Government Licence – Canada. Health Canada's reuse guidance allows
commercial and non-commercial use and asks users to preserve nutrient values,
credit the source and avoid implying official status or endorsement.
[Dataset][cnf] · [Open-data record][cnf-record] · [2015 reuse guidance][cnf-terms]

NutriTrace adapts the measure factors by multiplying them by 100 to obtain
grams. The resulting portion references are a NutriTrace adaptation. The
nutrient values shown for those matched foods come from Ciqual.

### Mealie

Users can connect a Mealie instance with a personal API token. An
administrator can also mirror a Mealie recipe library for signed-in users.
Recipes pulled from Mealie retain their original terms.
[What the mirror stores](PRIVACY.md#shared-mealie-mirror)

## Bundled assets

| Asset | License | Where |
| ----- | ------- | ----- |
| **Inter** (UI typeface) | [SIL Open Font License 1.1][ofl] | `public/fonts/inter-*.woff2` |
| **Material Symbols Rounded** (icons) | [Apache License 2.0][apache] | `public/fonts/material-symbols-rounded.woff2` |
| **ASA24® portion photos (NCI)** | The NCI states the images are freely available for use. Public redistribution terms are unconfirmed. | Selected PNGs under `public/portions/`, including `public/portions/atlas/`. |

Fonts are served by your own instance, never from a CDN. One file per script
subset, so a browser downloads only the scripts a page needs. Regenerate them
with `scripts/fetch-fonts.mjs`.

### ASA24® portion photos

The fork includes unmodified PNGs from the NCI ASA24® Portion Size Image Database.
NutriTrace matches them to household measures to illustrate portion choices.
The gram weights shown with the photos are estimates for the equivalent measure.
[NCI image collection][asa24]

The collection describes the images as “freely available for use” and
credits Baylor College of Medicine's Children's Nutrition Research Center
and Westat for their development. The NCI's general policy distinguishes
graphics credited to NCI from copyrighted graphics owned by third parties.
The published guidance leaves redistribution of these PNGs in public
repositories and packaged builds unconfirmed. [NCI graphics reuse policy][nci-reuse]

[ofl]: https://openfontlicense.org/
[apache]: https://www.apache.org/licenses/LICENSE-2.0
[asa24]: https://epi.grants.cancer.gov/asa24/resources/portionsize.html
[nci-reuse]: https://www.cancer.gov/policies/copyright-reuse

## Third-party code dependencies

Bundled Node.js dependencies (Express, better-sqlite3, DuckDB bindings,
Svelte, Capacitor plugins, etc.) each ship under their own permissive
licenses (MIT / Apache-2.0 / BSD variants). See `package.json` and
`server/package.json` for the full dependency lists; run `npm ls --long`
or `npx license-checker` in either directory for machine-readable output.

## Questions

If any of the above needs clarification or you spot something worth
correcting, open an issue on the [GitHub repository][repo] and it'll get
looked at.

[repo]: https://github.com/TraceApps/nutritrace/issues
