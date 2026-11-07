#!/usr/bin/env python3
"""Build the read-only NutriTrace catalogue from the Ciqual 2025 XML export.

Anses. 2025. Table de composition nutritionnelle des aliments Ciqual.
https://doi.org/10.57745/RDMHWY — Licence Ouverte Etalab 2.0.
Download and verify the XML files from https://zenodo.org/records/17550133.
"""

import argparse
import json
import math
from pathlib import Path
from xml.etree import ElementTree as ET


EXPORT_DATE = "2025_11_03"
NUTRIENTS = {
    "328": "calories",
    "327": "kilojoules",
    "25000": "proteins",
    "31000": "carbohydrates",
    "32000": "sugars",
    "34100": "fiber",
    "40000": "fat",
    "40302": "saturated-fat",
    "40303": "monounsaturated-fat",
    "40304": "polyunsaturated-fat",
    "75100": "cholesterol",
    "10004": "salt",
    "10110": "sodium",
    "10120": "magnesium",
    "10150": "phosphorus",
    "10190": "potassium",
    "10200": "calcium",
    "10260": "iron",
    "10300": "zinc",
    "52100": "vitamin-d",
    "53100": "vitamin-e",
    "55100": "vitamin-c",
    "56100": "b1",
    "56200": "b2",
    "56310": "b3",
    "56500": "b6",
    "56600": "b12",
    "56700": "b9",
    "60000": "alcohol",
}


def rows(directory, kind):
    path = directory / f"{kind}_{EXPORT_DATE}.xml"
    for _, element in ET.iterparse(path):
        if element.tag == kind.upper():
            yield {field.tag: (field.text or "").strip() for field in element}
            element.clear()


def exact_value(text):
    # Ciqual also publishes missing values, traces and upper bounds. Keep those
    # absent in NutriTrace rather than turning them into a measured number.
    try:
        value = float(text.replace(",", "."))
    except ValueError:
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return int(value) if value.is_integer() else value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="directory with the three Ciqual XML files")
    parser.add_argument("output", type=Path, help="path for the generated catalogue JSON")
    args = parser.parse_args()

    groups = {row["alim_grp_code"]: row["alim_grp_nom_fr"] for row in rows(args.source, "alim_grp")}
    foods = {}
    for row in rows(args.source, "alim"):
        code = row["alim_code"]
        if code in foods:
            raise ValueError(f"Duplicate food code: {code}")
        foods[code] = (row["alim_nom_fr"], groups.get(row["alim_grp_code"], ""), {})

    for row in rows(args.source, "compo"):
        nutrient = NUTRIENTS.get(row["const_code"])
        if nutrient is None:
            continue
        value = exact_value(row["teneur"])
        if value is not None:
            foods[row["alim_code"]][2][nutrient] = value

    if len(foods) != 3484:
        raise ValueError(f"Expected 3484 Ciqual 2025 foods, got {len(foods)}")

    keys = list(NUTRIENTS.values())
    with args.output.open("w", encoding="utf-8", newline="\n") as output:
        output.write('{\n  "source":"Anses, Table Ciqual 2025",\n')
        output.write('  "url":"https://doi.org/10.57745/RDMHWY",\n')
        output.write('  "license":"Licence Ouverte Etalab 2.0",\n')
        output.write(f'  "nutrients":{json.dumps(keys, separators=(",", ":"))},\n  "foods":[\n')
        for index, (code, (name, group, nutrition)) in enumerate(foods.items()):
            row = [code, name, group, *(nutrition.get(key) for key in keys)]
            separator = "," if index < len(foods) - 1 else ""
            output.write(f'    {json.dumps(row, ensure_ascii=False, separators=(",", ":"))}{separator}\n')
        output.write("  ]\n}\n")

    with_energy = sum("calories" in nutrition for _, _, nutrition in foods.values())
    print(f"{len(foods)} foods, {with_energy} with published numeric kcal, {len(keys)} mapped nutrients")


if __name__ == "__main__":
    main()
