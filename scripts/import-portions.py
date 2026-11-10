"""Extend the Ciqual portion catalogue from local USDA, ASA24 and CNF exports."""

import argparse
import csv
import io
import json
import math
import re
import shutil
import unicodedata
import zipfile
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOGUES = ROOT / "src/lib/catalogues"
IMAGE_DIR = ROOT / "public/portions"
PNG_HEADER = b"\x89PNG\r\n\x1a\n"
PORTION_COUNT = 4
REPORT_STATUS = {
    "illustrated": "Illustré",
    "weight_only": "Grammage seul",
    "needs_review": "À vérifier",
    "unmatched": "Sans correspondance",
}
REPORT_SOURCE = {"fndds": "USDA FNDDS", "cnf": "Santé Canada"}
REPORT_CHANGE = {"new": "Ajouté", "photos_added": "Photos ajoutées"}
ATLAS_NUTRIENTS = {
    1008: "calories", 1003: "proteins", 1004: "fat", 1005: "carbohydrates",
    1258: "saturated-fat", 1257: "trans-fat", 1292: "monounsaturated-fat",
    1293: "polyunsaturated-fat", 2000: "sugars", 1235: "added-sugars",
    1079: "fiber", 1093: "sodium", 1253: "cholesterol", 1087: "calcium",
    1089: "iron", 1092: "potassium", 1090: "magnesium", 1095: "zinc",
    1091: "phosphorus", 1162: "vitamin-c", 1106: "vitamin-a", 1114: "vitamin-d",
    1109: "vitamin-e", 1185: "vitamin-k", 1165: "b1", 1166: "b2", 1167: "b3",
    1175: "b6", 1177: "b9", 1178: "b12",
}
FRENCH_SEARCH = {
    "apple":"pomme pommes", "applesauce":"compote pomme", "pear":"poire poires", "banana":"banane bananes",
    "strawberry":"fraise fraises", "raspberry":"framboise framboises", "blueberry":"myrtille myrtilles",
    "grape":"raisin raisins", "peach":"peche peches", "cherry":"cerise cerises", "lemon":"citron citrons",
    "pineapple":"ananas", "avocado":"avocat avocats", "watermelon":"pasteque", "mango":"mangue mangues",
    "potato":"pomme de terre pommes de terre", "carrot":"carotte carottes", "tomato":"tomate tomates",
    "cucumber":"concombre concombres", "broccoli":"brocoli", "cauliflower":"chou fleur",
    "spinach":"epinard epinards", "eggplant":"aubergine aubergines", "zucchini":"courgette courgettes",
    "pepper":"poivron poivre", "onion":"oignon oignons", "garlic":"ail", "mushroom":"champignon champignons",
    "asparagus":"asperge asperges", "beet":"betterave betteraves", "lettuce":"laitue salade",
    "green bean":"haricot vert haricots verts", "pea":"pois", "chickpea":"pois chiche pois chiches",
    "lentil":"lentille lentilles", "bean":"haricot haricots", "corn":"mais", "rice":"riz",
    "pasta":"pate pates", "noodle":"nouille nouilles", "oat":"avoine", "oatmeal":"porridge avoine",
    "bread":"pain", "flour":"farine", "cereal":"cereale cereales", "cookie":"biscuit biscuits",
    "cake":"gateau gateaux", "pie":"tarte tourte", "pancake":"crepe crepes",
    "chicken":"poulet", "turkey":"dinde", "beef":"boeuf", "pork":"porc", "lamb":"agneau", "veal":"veau",
    "sausage":"saucisse saucisses", "ham":"jambon", "salmon":"saumon", "tuna":"thon", "cod":"cabillaud",
    "shrimp":"crevette crevettes", "fish":"poisson", "egg":"oeuf oeufs", "milk":"lait", "cheese":"fromage",
    "yogurt":"yaourt yogourt", "cream":"creme", "ice cream":"glace", "butter":"beurre",
    "oil":"huile", "olive oil":"huile olive", "peanut":"arachide cacahuete", "almond":"amande amandes",
    "walnut":"noix", "cashew":"cajou", "honey":"miel", "sugar":"sucre", "juice":"jus",
    "coffee":"cafe", "tea":"the", "water":"eau", "soup":"soupe potage", "salad":"salade",
    "raw":"cru crue", "cooked":"cuit cuite", "boiled":"bouilli bouillie", "grilled":"grille grillee",
    "fried":"frit frite", "roasted":"roti rotie", "canned":"conserve", "dried":"sec seche",
    "white":"blanc blanche", "brown":"complet complete brun", "whole":"entier entiere",
}
PHOTO_QUALIFIERS = set(
    "raw cooked canned dried frozen fried grilled roasted smoked breaded white brown "
    "chocolate vanilla strawberry tomato cheese meat meatless chicken pork beef turkey sauce gravy".split()
)
FNDDS_DOWNLOAD = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip"
ASA24_DOWNLOAD = "https://asa24.nci.nih.gov/Asa24PortionImages.zip"


def normalized(name):
    name = name.casefold().replace("œ", "oe").replace("æ", "ae")
    name = "".join(char for char in unicodedata.normalize("NFD", name) if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", name))


def zip_entry(archive, filename):
    matches = [entry for entry in archive.namelist() if PurePosixPath(entry).name == filename]
    if len(matches) != 1:
        raise ValueError(f"Expected a single {filename} in {archive.filename}")
    return matches[0]


def asa_sheet(book, sheet_number):
    strings = ["".join(node.itertext()) for node in ET.fromstring(book.read("xl/sharedStrings.xml"))]
    xml = ET.fromstring(book.read(f"xl/worksheets/sheet{sheet_number}.xml"))
    for row in xml.findall(".//{*}row"):
        cells = {}
        for cell in row.findall("{*}c"):
            value = cell.findtext("{*}v")
            if value is not None:
                column = re.match(r"[A-Z]+", cell.attrib["r"])[0]
                cells[column] = strings[int(value)] if cell.get("t") == "s" else value
        yield cells


def asa_index(book, file_names, approved_codes):
    aerial = {row["B"]: row.get("F", "") for row in asa_sheet(book, 1)
              if row.get("G") == "Aerial" and row.get("B") in file_names}
    index = defaultdict(set)
    for row in asa_sheet(book, 2):
        if (row.get("J") != "PORTION" or row.get("D") not in approved_codes
                or row.get("E") != "0" or row.get("H") != "0"):
            continue
        filename = row.get("C", "")
        if not re.fullmatch(r"[a-zA-Z0-9_-]+\.png", filename) or filename not in aerial:
            continue
        index[row["D"]].add((row["G"], float(row["I"]), filename, aerial[filename]))
    return index


def spread(rows):
    """Choose evenly across the available sizes, keeping both ends."""
    if len(rows) <= PORTION_COUNT:
        return rows
    return [rows[round(i * (len(rows) - 1) / (PORTION_COUNT - 1))] for i in range(PORTION_COUNT)]


def fndds_reference(food, approved, images, file_names):
    measures = {str(p["modifier"]): p for p in food["foodPortions"] if p["gramWeight"] > 0}
    by_description = {p["portionDescription"]: p["gramWeight"] for p in measures.values()}
    portion_rows = {}
    for filename, description, factor, label in approved.get("photos", []):
        if filename not in file_names:
            continue
        if not re.fullmatch(r"[a-zA-Z0-9_-]+\.png", filename):
            raise ValueError(f"Invalid photo filename {filename}")
        grams = round(by_description[description] * factor, 1)
        if not math.isfinite(grams) or not 0 < grams <= 750:
            raise ValueError(f"Invalid portion {grams} g for {food['description']}")
        portion_rows[grams] = [label, grams, f"atlas/{filename}"]

    # Some series need an explicit check: the atlas has previously reused
    # an image of a different preparation or size for the same food code.
    for modifier, factor, filename, title in sorted([] if "photos" in approved else images):
        measure = measures.get(modifier)
        if not measure:
            continue
        if approved.get("photoPrefixes") and not any(
                title.casefold().startswith(prefix.casefold()) for prefix in approved["photoPrefixes"]):
            continue
        grams = round(measure["gramWeight"] * factor, 1)
        if math.isfinite(grams) and 0 < grams <= 750:
            portion_rows.setdefault(grams, ["reference", grams, f"atlas/{filename}"])
    if len(portion_rows) >= 2:
        return {"fdc": food["fdcId"], "portions": spread([portion_rows[g] for g in sorted(portion_rows)])}

    for description, label, factor in approved["measures"]:
        grams = round(by_description[description] * factor, 1)
        if not math.isfinite(grams) or not 0 < grams <= 750:
            raise ValueError(f"Invalid portion {grams} g for {food['description']}")
        row = portion_rows.get(grams)
        portion_rows[grams] = [label, grams, row[2]] if row else [label, grams]
    return {"fdc": food["fdcId"], "portions": spread([portion_rows[g] for g in sorted(portion_rows)])}


def cnf_index(path):
    if not path:
        return {}, {}
    with zipfile.ZipFile(path) as archive:
        def rows(name):
            return csv.DictReader(archive.read(zip_entry(archive, name)).decode("cp1252").splitlines())

        names = defaultdict(list)
        for row in rows("FOOD NAME.csv"):
            names[normalized(row["FoodDescriptionF"])].append((row["FoodID"], row["FoodDescriptionF"]))
        measures = {row["MeasureID"]: (row["MeasureDescriptionF"], row["MeasureDescription"])
                    for row in rows("MEASURE NAME.csv")}
        weights = defaultdict(dict)
        for row in rows("CONVERSION FACTOR.csv"):
            measure = measures.get(row["MeasureID"])
            if not measure or not row["ConversionFactorValue"]:
                continue
            french, english = measure
            grams = round(float(row["ConversionFactorValue"]) * 100, 1)
            if (0 < grams <= 750 and french and english and len(french) <= 60
                    and not re.fullmatch(r"[\d., ]+\s*g", french, re.IGNORECASE)):
                weights[row["FoodID"]].setdefault(grams, ["reference", grams, None, {"fr": french, "en": english}])
    references = {id_: {"cnf": id_, "portions": spread([rows[g] for g in sorted(rows)])}
                  for id_, rows in weights.items()}
    return names, references


def status(reference):
    return "illustrated" if any(len(row) > 2 and row[2] for row in reference["portions"]) else "weight_only"


def singular(word):
    if word.endswith("ies"):
        return word[:-3] + "y"
    if word.endswith("oes"):
        return word[:-2]
    if word.endswith(("ches", "shes", "xes", "zes")):
        return word[:-2]
    return word.removesuffix("s") if len(word) > 3 and not word.endswith("ss") else word


def words(name):
    return [singular(word) for word in normalized(name).split()]


def cup_count(label):
    match = re.match(r"^\s*(\d+(?:[- ]\d+/\d+|/\d+)?|\d+\.\d+)\s+cups?\b", label, re.I)
    if not match:
        return None
    try:
        return sum(Fraction(part) for part in re.split(r"[- ]", match[1]))
    except (ValueError, ZeroDivisionError):
        return None


def cup_labels(count):
    whole = count.numerator // count.denominator
    fraction = count - whole
    symbols = {Fraction(1, 4): "¼", Fraction(1, 2): "½", Fraction(3, 4): "¾",
               Fraction(1, 8): "⅛", Fraction(3, 8): "⅜", Fraction(5, 8): "⅝", Fraction(7, 8): "⅞"}
    amount = str(whole) if whole else ""
    if fraction:
        amount += symbols.get(fraction, f"{' ' if whole else ''}{fraction}")
    return {"en": f"{amount} cup" + ("s" if count > 1 else ""),
            "fr": f"{amount} tasse" + ("s" if count > 1 else "")}


# Household measures other than cups, with their French label (singular, plural).
# Ounces have no everyday French equivalent: the weight shown beside the photo
# is the useful figure, so the label stays generic.
FRENCH_MEASURES = {
    "piece": ("pièce", "pièces"), "slice": ("tranche", "tranches"), "bar": ("barre", "barres"),
    "roll": ("petit pain", "petits pains"), "sandwich": ("sandwich", "sandwichs"), "fruit": ("fruit", "fruits"),
    "whole vegetable": ("légume entier", "légumes entiers"), "medium whole vegetable": ("légume moyen", "légumes moyens"),
    "head": ("tête", "têtes"), "pastry": ("pâtisserie", "pâtisseries"), "package": ("paquet", "paquets"),
    "bag": ("sachet", "sachets"), "patty": ("galette", "galettes"), "cookie": ("biscuit", "biscuits"),
    "muffin": ("muffin", "muffins"), "doughnut": ("beignet", "beignets"), "link": ("saucisse", "saucisses"),
    "scoop": ("boule", "boules"), "waffle": ("gaufre", "gaufres"), "pancake": ("pancake", "pancakes"),
    "bagel": ("bagel", "bagels"), "biscuit": ("petit pain rond", "petits pains ronds"), "omelet": ("omelette", "omelettes"),
    "potato": ("pomme de terre", "pommes de terre"), "cracker": ("cracker", "crackers"),
    "breadstick": ("gressin", "gressins"), "pita": ("pain pita", "pains pita"), "wedge": ("quartier", "quartiers"),
    "tablespoon": ("cuillère à soupe", "cuillères à soupe"), "teaspoon": ("cuillère à café", "cuillères à café"),
    "small": ("petit", "petits"), "medium": ("moyen", "moyens"), "large": ("grand", "grands"),
    "pie": ("tourte", "tourtes"), "egg": ("œuf", "œufs"), "strip": ("lanière", "lanières"),
    "stick": ("bâtonnet", "bâtonnets"), "tortilla": ("tortilla", "tortillas"), "taco": ("taco", "tacos"),
    "burrito": ("burrito", "burritos"), "nugget": ("nugget", "nuggets"), "wing": ("aile", "ailes"),
    "drumstick": ("pilon", "pilons"), "thigh": ("cuisse", "cuisses"), "breast": ("blanc", "blancs"),
    "fillet": ("filet", "filets"), "chop": ("côtelette", "côtelettes"), "meatball": ("boulette", "boulettes"),
    "hot dog": ("hot-dog", "hot-dogs"), "frankfurter": ("saucisse", "saucisses"), "ear": ("épi", "épis"),
    "spear": ("pointe", "pointes"), "stalk": ("branche", "branches"), "leaf": ("feuille", "feuilles"),
    "can": ("canette", "canettes"), "bottle": ("bouteille", "bouteilles"), "glass": ("verre", "verres"),
    "container": ("pot", "pots"), "cone": ("cornet", "cornets"), "cupcake": ("cupcake", "cupcakes"),
    "brownie": ("brownie", "brownies"), "square": ("carré", "carrés"), "ounce": ("portion", "portions"),
    "fluid ounce": ("portion", "portions"),
}
FRACTION_SYMBOLS = {Fraction(1, 4): "¼", Fraction(1, 2): "½", Fraction(3, 4): "¾", Fraction(1, 3): "⅓",
                    Fraction(2, 3): "⅔", Fraction(1, 8): "⅛", Fraction(3, 8): "⅜", Fraction(5, 8): "⅝",
                    Fraction(7, 8): "⅞"}


def parse_measure(label):
    """Split "1 1/2 slices, thin" into (Fraction(3, 2), "slice"). None when it has no leading quantity."""
    match = re.match(r"^\s*(\d+(?:[- ]\d+/\d+|/\d+)?|\d*\.\d+)\s+([^,(]+)", label or "")
    if not match:
        return None
    try:
        count = (Fraction(match[1]) if "." in match[1]
                 else sum(Fraction(part) for part in re.split(r"[- ]", match[1])))
    except (ValueError, ZeroDivisionError):
        return None
    unit = normalized(match[2])
    unit = {"fo": "fluid ounce", "fl oz": "fluid ounce", "oz": "ounce", "tbsp": "tablespoon", "tsp": "teaspoon"}.get(unit, unit)
    unit = " ".join(parts[:-1] + [singular(parts[-1])]) if (parts := unit.split()) else ""
    return (count, unit) if count > 0 and unit else None


def measure_labels(count, unit):
    if unit == "cup":
        return cup_labels(count)
    whole = count.numerator // count.denominator
    fraction = count - whole
    amount = str(whole) if whole else ""
    if fraction:
        amount += FRACTION_SYMBOLS.get(fraction, f"{' ' if whole else ''}{fraction}")
    plural = count > 1
    french = FRENCH_MEASURES.get(unit)
    english = unit + ("s" if plural and not unit.endswith(("s", "medium", "large", "small")) else "")
    return {"en": f"{amount} {english}", "fr": f"{amount} {french[plural]}" if french else ""}


def food_photos(archive, pictures):
    index = defaultdict(list)
    with zipfile.ZipFile(archive.open(zip_entry(archive, "ASA24_ImageMetadata.xlsx"))) as book:
        aerial = {row["B"]: (row.get("F", ""), parse_measure(row.get("H", ""))) for row in asa_sheet(book, 1)
                  if row.get("G") == "Aerial" and row.get("B") in pictures}
        for row in asa_sheet(book, 2):
            if row.get("J") != "PORTION" or row.get("E") != "0" or row.get("H") != "0":
                continue
            filename = row.get("C", "")
            title, count = aerial.get(filename, ("", None))
            if count and re.fullmatch(r"[A-Za-z0-9_-]+\.png", filename):
                index[row["D"]].append((row["G"], float(row["I"]), filename, title, count))
    return index


def atlas_portions(food, images):
    measures = {}
    rows = {}
    for measure in food["foodPortions"]:
        label = measure.get("portionDescription", "")
        grams = round(measure["gramWeight"], 1)
        if not label or "not specified" in label.lower() or not 0 < grams <= 1000:
            continue
        if not re.match(r"^\d", label) or len(label) > 64 or re.match(r"^\d+\s+g(?:rams?)?$", label, re.I):
            continue
        measures[str(measure["modifier"])] = (label, grams)
        parsed = parse_measure(label)
        text = measure_labels(*parsed)["fr"] if parsed else ""
        rows.setdefault(grams, ["reference", grams, None, {"en": label, "fr": text}])

    name = food["description"]
    core = set(words(name.split(",")[0]))
    qualifiers = set(words(name)) & PHOTO_QUALIFIERS
    photos = {}
    similar = {}
    for code, multiplier, filename, title, count in sorted(set(images), key=lambda row: row[:3]):
        if code not in measures:
            continue
        label, base_grams = measures[code]
        base = parse_measure(label)
        # ASA24 links each photo to a food code, a measure and a multiplier.
        # The unit and the quantity must agree with the FNDDS measure.
        if not base or not count or base[1] != count[1]:
            continue
        if not math.isclose(float(count[0] / base[0]), multiplier, abs_tol=0.001):
            continue
        grams = round(base_grams * multiplier, 1)
        if not 0 < grams <= 750:
            continue
        title_words = set(words(title))
        # A photo whose title names this food and preparation is shown as is.
        # ASA24 also reuses the photo of a close food (milk for goat milk):
        # it still shows the volume, and is kept, flagged, when nothing better exists.
        exact = bool(core) and core <= title_words and (title_words & PHOTO_QUALIFIERS) == qualifiers
        row = ["reference", grams, f"atlas/{filename}", measure_labels(*count)]
        if exact:
            photos.setdefault(grams, row)
        else:
            similar.setdefault(grams, row + [1])
    if not photos:
        photos = similar
    selected_photos = spread([photos[g] for g in sorted(photos)])
    for row in selected_photos:
        rows.pop(row[1], None)
    slots = PORTION_COUNT - len(selected_photos)
    ordered = [rows[g] for g in sorted(rows)]
    if slots == 1 and ordered:
        ordered = [ordered[len(ordered) // 2]]
    elif slots > 1 and len(ordered) > slots:
        ordered = [ordered[round(i * (len(ordered) - 1) / (slots - 1))] for i in range(slots)]
    return sorted(selected_photos + ordered[:slots], key=lambda row: row[1])


def import_full_atlas(args, archive):
    output = CATALOGUES / "fndds-atlas.json"
    prior_photos = set()
    if args.apply and output.exists():
        prior = json.loads(output.read_text(encoding="utf-8"))
        prior_photos = {row[2] for food in prior["foods"] for row in food[4] if row[2]}
    if prior_photos and not archive:
        raise ValueError("Pass --asa24 or --with-photos to refresh the illustrated atlas")
    pictures = {PurePosixPath(name).name: name for name in archive.namelist() if name.endswith(".png")} if archive else {}
    photos = food_photos(archive, pictures) if archive else {}
    with zipfile.ZipFile(args.fndds) as data:
        foods = json.loads(data.read(zip_entry(data, "surveyDownload.json")))["SurveyFoods"]

    categories = {}
    payload = []
    used_photos = set()
    illustrated = 0
    for food in foods:
        nutrients = {row["nutrient"]["id"]: row["amount"] for row in food["foodNutrients"]
                     if isinstance(row.get("amount"), (int, float)) and math.isfinite(row["amount"])}
        if 1008 not in nutrients:
            continue
        portions = atlas_portions(food, photos.get(str(food["foodCode"]), []))
        if not portions:
            continue
        linked = {PurePosixPath(row[2]).name for row in portions if row[2]}
        used_photos.update(linked)
        illustrated += bool(linked)
        name = food["description"]
        tokenized = " " + " ".join(words(name)) + " "
        aliases = sorted({word for key, values in FRENCH_SEARCH.items()
                          if f" {key} " in tokenized for word in values.split()})
        category = food["wweiaFoodCategory"]["wweiaFoodCategoryDescription"]
        category_id = categories.setdefault(category, len(categories))
        payload.append([food["fdcId"], name, category_id,
                        [nutrients.get(id_) for id_ in ATLAS_NUTRIENTS], portions, " ".join(aliases)])

    category_names = list(categories)
    if args.apply:
        assets = {name: archive.read(pictures[name]) for name in used_photos}
        if any(not blob.startswith(PNG_HEADER) for blob in assets.values()):
            raise ValueError("Invalid PNG in ASA24 archive")
        if assets:
            (IMAGE_DIR / "atlas").mkdir(parents=True, exist_ok=True)
        for name, blob in assets.items():
            (IMAGE_DIR / "atlas" / name).write_bytes(blob)
        temp = output.with_suffix(".json.tmp")
        temp.write_text(json.dumps({"nutrients": list(ATLAS_NUTRIENTS.values()),
                                    "categories": category_names, "foods": payload},
                                   ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        temp.replace(output)
        curated = json.loads((CATALOGUES / "portion-references.json").read_text(encoding="utf-8"))
        preserved = {row[2] for ref in curated.values() for row in ref["portions"] if len(row) > 2 and row[2]}
        preserved.update(f"atlas/{name}" for name in used_photos)
        for path in prior_photos - preserved:
            if re.fullmatch(r"atlas/[A-Za-z0-9_-]+\.png", path):
                (IMAGE_DIR / path).unlink(missing_ok=True)
    if args.report:
        with args.report.open("w", encoding="utf-8-sig", newline="") as report:
            writer = csv.writer(report, delimiter=";")
            writer.writerow(("fdc", "aliment_usda", "catégorie", "repères", "photos"))
            for id_, title, category, _, portions, _ in payload:
                writer.writerow((id_, title, category_names[category], len(portions),
                                 sum(bool(row[2]) for row in portions)))
    print(json.dumps({"mode": "apply" if args.apply else "preview", "foods": len(payload),
                      "illustrated": illustrated, "weights_only": len(payload) - illustrated,
                      "photos": len(used_photos)}))


def import_catalogue(args, atlas):
    current_path = CATALOGUES / "portion-references.json"
    existing = json.loads(current_path.read_text(encoding="utf-8"))
    catalogue = existing.copy()
    foods = json.loads((CATALOGUES / "ciqual-2025.json").read_text(encoding="utf-8"))["foods"]
    approved = json.loads(args.mappings.read_text(encoding="utf-8"))
    if not approved.keys() <= {row[0] for row in foods}:
        raise ValueError("Unknown Ciqual ID in reviewed mappings")
    with zipfile.ZipFile(args.fndds) as data:
        fndds = {str(food["foodCode"]): food
                 for food in json.loads(data.read(zip_entry(data, "surveyDownload.json")))["SurveyFoods"]}

    pictures = {}
    images = {}
    if atlas:
        pictures = {PurePosixPath(name).name: name for name in atlas.namelist() if name.endswith(".png")}
        with zipfile.ZipFile(atlas.open(zip_entry(atlas, "ASA24_ImageMetadata.xlsx"))) as book:
            images = asa_index(book, pictures, {entry["foodCode"] for entry in approved.values()})

    cnf_names, cnf_references = cnf_index(args.cnf)
    reordered_cnf = defaultdict(list)
    for name, rows in cnf_names.items():
        reordered_cnf[tuple(sorted(name.split()))].extend(rows)

    pending_assets = {}
    report = []
    for code, name, *_ in foods:
        reference = existing.get(code)
        source = ("cnf" if "cnf" in reference else "fndds") if reference else ""
        candidates = ""
        if code in approved:
            rule = approved[code]
            food = fndds[rule["foodCode"]]
            imported = fndds_reference(food, rule, images.get(rule["foodCode"], []), pictures)
            if not reference or (status(reference) == "weight_only" and status(imported) == "illustrated"):
                reference, source = imported, "fndds"
        if not reference:
            title = normalized(name)
            exact = cnf_names.get(title, [])
            if len(exact) == 1 and exact[0][0] in cnf_references:
                reference, source = cnf_references[exact[0][0]], "cnf"
            else:
                candidates = " | ".join(f"{id_} {label}" for id_, label in reordered_cnf.get(tuple(sorted(title.split())), []))

        if reference:
            catalogue[code] = reference
            for row in reference["portions"]:
                if len(row) > 2 and row[2] and not (IMAGE_DIR / row[2]).is_file():
                    filename = PurePosixPath(row[2]).name
                    if filename not in pictures or row[2] != f"atlas/{filename}":
                        raise ValueError(f"Missing asset {row[2]}")
                    pending_assets[row[2]] = pictures[filename]
        previous = existing.get(code)
        change = "new" if reference and not previous else "photos_added" if previous != reference else ""
        report.append((code, name, status(reference) if reference else ("needs_review" if candidates else "unmatched"),
                       source, (reference or {}).get("fdc", (reference or {}).get("cnf", "")),
                       sum(bool(row[2]) for row in reference["portions"] if len(row) > 2) if reference else 0,
                       candidates, change))

    if args.apply:
        assets = {path: atlas.read(name) for path, name in pending_assets.items()}
        if any(not data.startswith(PNG_HEADER) for data in assets.values()):
            raise ValueError("Invalid PNG in ASA24 archive")
        if assets:
            (IMAGE_DIR / "atlas").mkdir(parents=True, exist_ok=True)
        for path, data in assets.items():
            (IMAGE_DIR / path).write_bytes(data)
        encoded = ",\n".join(f'  "{key}": {json.dumps(value, ensure_ascii=False, separators=(",", ":"))}'
                             for key, value in sorted(catalogue.items(), key=lambda row: int(row[0])))
        tmp = current_path.with_suffix(".json.tmp")
        tmp.write_text("{\n" + encoded + "\n}\n", encoding="utf-8")
        tmp.replace(current_path)

    if args.report:
        with args.report.open("w", encoding="utf-8-sig", newline="") as output:
            writer = csv.writer(output, delimiter=";")
            writer.writerow(("ciqual", "aliment", "statut", "source", "id_source", "photos", "candidats_cnf", "changement"))
            for code, name, state, source, id_, photo_count, candidates, change in sorted(
                    report, key=lambda row: (not row[7], list(REPORT_STATUS).index(row[2]), row[1].casefold())):
                writer.writerow((code, name, REPORT_STATUS[state], REPORT_SOURCE.get(source, ""), id_, photo_count,
                                 candidates, REPORT_CHANGE.get(change, "")))
    print(json.dumps({"mode": "apply" if args.apply else "preview", "catalogue": dict(Counter(r[2] for r in report)),
                      "new_foods": len(catalogue.keys() - existing.keys()), "new_images": len(pending_assets),
                      "upgraded_to_photos": sum(status(old) == "weight_only" and status(catalogue[key]) == "illustrated"
                                                for key, old in existing.items())}))


class RemoteFile(io.RawIOBase):
    """Read a remote file through HTTP range requests, so that zipfile can
    fetch the index and the selected members of a large archive without
    downloading the whole of it."""

    BLOCK = 1 << 18

    def __init__(self, url):
        self.url = url
        self.position = 0
        self.blocks = {}
        with self._request(0, 0) as response:
            total = re.fullmatch(r"bytes 0-0/(\d+)", response.headers.get("Content-Range", ""))
            if response.status != 206 or not total:
                raise ValueError("The server does not support partial downloads")
            self.size = int(total[1])

    def _request(self, start, end):
        return urlopen(Request(self.url, headers={"User-Agent": "NutriTrace portion catalogue importer",
                                                  "Range": f"bytes={start}-{end}"}), timeout=60)

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=io.SEEK_SET):
        base = {io.SEEK_SET: 0, io.SEEK_CUR: self.position, io.SEEK_END: self.size}[whence]
        self.position = max(0, base + offset)
        return self.position

    def _block(self, index):
        if index not in self.blocks:
            start = index * self.BLOCK
            end = min(self.size, start + self.BLOCK) - 1
            with self._request(start, end) as response:
                data = response.read()
            if response.status != 206 or len(data) != end - start + 1:
                raise ValueError("Unexpected partial download")
            self.blocks[index] = data
        return self.blocks[index]

    def readinto(self, buffer):
        if self.position >= self.size:
            return 0
        index, offset = divmod(self.position, self.BLOCK)
        chunk = self._block(index)[offset:offset + len(buffer)]
        buffer[:len(chunk)] = chunk
        self.position += len(chunk)
        return len(chunk)


def download_zip(url, path, expected_file):
    if path.exists() and zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            zip_entry(archive, expected_file)
        return path
    partial = path.with_suffix(".part")
    try:
        request = Request(url, headers={"User-Agent": "NutriTrace portion catalogue importer"})
        with urlopen(request, timeout=60) as response, partial.open("wb") as output:
            shutil.copyfileobj(response, output)
        with zipfile.ZipFile(partial) as archive:
            zip_entry(archive, expected_file)
        partial.replace(path)
    finally:
        partial.unlink(missing_ok=True)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fndds", type=Path, help="FNDDS 2021–2023 JSON ZIP")
    parser.add_argument("--asa24", type=Path, help="ASA24 image archive with its XLSX metadata")
    parser.add_argument("--cnf", type=Path, help="Canadian Nutrient File 2015 CSV ZIP")
    parser.add_argument("--mappings", type=Path, default=ROOT / "scripts/portion-import-mappings.json")
    parser.add_argument("--report", type=Path, help="Export coverage and review candidates to CSV")
    parser.add_argument("--full-atlas", action="store_true", help="Import the complete USDA source separately")
    parser.add_argument("--download-dir", type=Path, help="Download and reuse official archives in this directory")
    parser.add_argument("--with-photos", action="store_true", help="Download the ASA24 archive if no --asa24 is supplied")
    parser.add_argument("--remote-photos", action="store_true",
                        help="Read the ASA24 archive online and fetch only the selected photos (about 13 MB of index)")
    parser.add_argument("--apply", action="store_true", help="Write the catalogue and new images")
    args = parser.parse_args()
    if not args.fndds and not args.download_dir:
        parser.error("Pass --fndds or --download-dir")
    if args.with_photos and not args.asa24 and not args.download_dir:
        parser.error("--with-photos needs --download-dir or --asa24")
    if args.download_dir:
        args.download_dir.mkdir(parents=True, exist_ok=True)
        if not args.fndds:
            args.fndds = download_zip(FNDDS_DOWNLOAD, args.download_dir / "fndds-2021-2023.zip", "surveyDownload.json")
        if args.with_photos and not args.asa24:
            args.asa24 = download_zip(ASA24_DOWNLOAD, args.download_dir / "asa24-images.zip", "ASA24_ImageMetadata.xlsx")
    operation = import_full_atlas if args.full_atlas else import_catalogue
    if args.remote_photos and not args.asa24:
        with zipfile.ZipFile(io.BufferedReader(RemoteFile(ASA24_DOWNLOAD), RemoteFile.BLOCK)) as atlas:
            operation(args, atlas)
    elif args.asa24:
        with zipfile.ZipFile(args.asa24) as atlas:
            operation(args, atlas)
    else:
        operation(args, None)


if __name__ == "__main__":
    main()
