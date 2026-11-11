"""Fill missing French Atlas entries using an extracted Argos en-fr model."""
import argparse
import json
import re
from pathlib import Path

CATALOGUES = Path(__file__).resolve().parents[1] / "src" / "lib" / "catalogues"


def expand_abbreviations(text):
    text = re.sub(r"\bNFS\b", "not further specified", text)
    text = re.sub(r"\bNS as to\b", "unspecified", text)
    text = re.sub(r"\bfl oz\b", "fluid ounces", text)
    return re.sub(r"\boz\b", "ounces", text)

def clean_translation(text):
    return " ".join(text.replace("▁", " ").split())


def entries(atlas):
    return {
        "foods": {str(row[0]): row[1] for row in atlas["foods"]},
        "categories": {name: name for name in atlas["categories"]},
        "measures": {measure[3]["en"]: measure[3]["en"]
                     for row in atlas["foods"] for measure in row[4]
                     if len(measure) > 3 and measure[3].get("en") and not measure[3].get("fr")},
    }


def translate_missing(atlas, existing, model):
    from ctranslate2 import Translator
    from sentencepiece import SentencePieceProcessor

    processor = SentencePieceProcessor(model_file=str(model / "sentencepiece.model"))
    translator = Translator(str(model / "model"), device="cpu", compute_type="int8",
                            inter_threads=4, intra_threads=2)
    catalogue = {}
    for group, originals in entries(atlas).items():
        translations = existing.get(group, {})
        missing = [(key, name) for key, name in originals.items() if not translations.get(key)]
        for start in range(0, len(missing), 256):
            chunk = missing[start:start + 256]
            tokens = processor.encode([expand_abbreviations(name) for _, name in chunk], out_type=str)
            results = translator.translate_batch(tokens, beam_size=4, max_batch_size=48,
                                                 max_decoding_length=160)
            for (key, original), result in zip(chunk, results, strict=True):
                name = clean_translation(processor.decode(result.hypotheses[0]))
                if not name:
                    raise ValueError(f"No translation for {key}: {original}")
                translations[key] = name
            print(f"{group}: {min(start + len(chunk), len(missing))}/{len(missing)}", flush=True)
        catalogue[group] = {key: translations[key] for key in originals}
    return catalogue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True, help="Extracted Argos en-fr 1.9 model directory")
    parser.add_argument("--output", type=Path, default=CATALOGUES / "fndds-atlas-fr.json")
    args = parser.parse_args()
    atlas = json.loads((CATALOGUES / "fndds-atlas.json").read_text(encoding="utf-8"))
    existing = json.loads(args.output.read_text(encoding="utf-8")) if args.output.exists() else {}
    catalogue = translate_missing(atlas, existing, args.model)
    args.output.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
