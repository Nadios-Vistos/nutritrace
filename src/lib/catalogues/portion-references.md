# Portion references

- Food identity and nutritional composition come from the [Anses–Ciqual 2025 table](https://ciqual.anses.fr/), or from the original food selected in NutriTrace. The keys in `portion-references.json` are Ciqual food codes.
- The `fdc` field identifies the matching [USDA FoodData Central](https://fdc.nal.usda.gov/) entry in FNDDS 2021–2023 (CC0). Each reference is a localized measure label, an approximate edible weight in grams, and optionally an image filename. Weights use the corresponding household measure from FNDDS, scaled for fractions or multiples. Ciqual and FNDDS entries were matched by food and preparation state.
- The `cnf` field identifies the food in the [Canadian Nutrient File, Health Canada, 2015](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/nutrient-data/canadian-nutrient-file-2015-download-files.html). For these rows the fourth value holds the original French and English measure labels. The importer converts each measure factor to grams by multiplying it by 100. This is a NutriTrace adaptation. The original nutrient values are not imported or altered.
- The unmodified images in `public/portions/` come from the freely available [NCI ASA24® Portion Size Image Database](https://epi.grants.cancer.gov/asa24/resources/portionsize.html). The original filename identifies each photo. The quantity depicted is matched using the ASA24 image index and the food-specific household measure. These images are reference examples. The gram values shown alongside them are estimates for the equivalent measure.
- Packaged foods use the serving quantity and unit reported by [Open Food Facts](https://openfoodfacts.github.io/documentation/docs/Product-Opener/schemas/schemas/product/) when they are compatible with the nutrition basis. An explicit multipack such as `4 × 125 g` also supplies a single-unit measure. NutriTrace reuses user-defined food measures.

## Extend the catalogue

Download the [FNDDS 2021–2023 JSON ZIP](https://fdc.nal.usda.gov/download-datasets/), the [ASA24 image ZIP](https://epi.grants.cancer.gov/asa24/resources/portionsize.html) and the optional Canadian Nutrient File 2015 CSV ZIP above. Keep the original archives outside the repository. The ASA24 archive contains the image metadata workbook.

Run the importer from the repository root. Use `py` in place of `python3` if needed on Windows.

```sh
python3 scripts/import-portions.py --fndds fndds.zip --asa24 asa24.zip --cnf cnf.zip --report portions.csv
```

The default preview leaves the catalogue untouched. The report shows illustrated foods, weights without photos, ambiguous candidates and foods with no match. Add `--apply` to write the approved additions. Omitting `--asa24` lets you add weights without fetching the image archive.

The import uses the reviewed Ciqual-to-FNDDS links in `scripts/portion-import-mappings.json`. For each match it checks the original USDA food code and measure before adding ASA24 images. The Canadian import uses unique French name matches. Reordered or ambiguous names are reported for review. Existing photos are preserved and rerunning the same import does not duplicate entries.

New ASA24 images go into `public/portions/atlas/`. The web app downloads them on demand from the NutriTrace server and keeps recently opened images in a bounded offline cache. The original portion images stay in the initial offline cache.

## Import the full USDA atlas

The complete import keeps the FNDDS foods under their original USDA IDs and
uses each food's own nutrition and household measures. It appears as
**Portion atlas** in Foods and the recipe ingredient picker. In French the
atlas uses `fndds-atlas-fr.json` for food names, categories and household
measures. Search still accepts the original USDA names. IDs, nutrient
values and weights come from the original atlas.

```sh
python3 scripts/import-portions.py --full-atlas --download-dir ../portion-sources --with-photos --report atlas.csv --apply
```

Omit `--apply` to preview the import. Use `--fndds` and `--asa24` to point
to archives already on disk. The download option reuses verified ZIPs on
subsequent runs. The original ASA24 archive is about 670 MB. Only the
selected PNGs and the compact catalogue are included in the application.

After updating the USDA catalogue, fill any missing French labels with
`python3 scripts/translate-portion-atlas.py --model /path/to/translate-en_fr-1_9`.
The optional maintenance script uses `ctranslate2`, `sentencepiece` and the
extracted [Argos English-to-French package](https://github.com/argosopentech/argospm-index).
Review new translations in the JSON file. Rerunning the script preserves
existing labels and removes entries no longer present in the source.

The full import requires a food code and a measured serving. A photo is
included only if ASA24 links it to the food and if its unit and quantity
agree with the FNDDS household measure (cups, slices, pieces, ounces and the
other measures of the image index). A photo whose title names the food and
its preparation is preferred. When none exists, the photo ASA24 uses for a
close food (plain milk for goat milk) is kept and flagged, and the portion
picker says the photos show a similar food. The catalogue includes the
measured quantities for foods whose photos could not be matched. The report
lists the count of portion choices and photos for each FNDDS ID.

`--remote-photos` reads the ASA24 archive online through partial downloads:
the image index (about 13 MB) and the selected PNGs only, instead of the
670 MB archive.

```sh
python3 scripts/import-portions.py --full-atlas --fndds fndds.zip --remote-photos --report atlas.csv --apply
```

## Visual cues without photos

Ciqual foods with neither a household measure nor a photo get usual visual
cues by food family: plate fractions, palm, glass, bowl, spoon, 125 g pot,
30 g cheese portion, bread slice, handful, 80 g fruit or vegetable portion,
ice-cream scoop. The rules are in `src/lib/portion-pictograms.js` and the
drawings in `src/lib/portion-pictogram-art.js`. They are orders of magnitude,
presented as approximate, and foods outside these families keep the
reference quantities.
