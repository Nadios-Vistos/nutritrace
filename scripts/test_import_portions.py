import runpy
import unittest
from fractions import Fraction
from pathlib import Path

atlas_portions = runpy.run_path(str(Path(__file__).with_name("import-portions.py")))["atlas_portions"]


class AtlasPhotoMatchTest(unittest.TestCase):
    def test_only_compatible_photo_portions_are_linked(self):
        food = {
            "description": "Beans and rice, with tomatoes",
            "foodPortions": [{"modifier": "1", "portionDescription": "1 cup", "gramWeight": 170}],
        }
        images = [
            ("1", .5, "correct.png", "Beans and rice, with tomatoes", Fraction(1, 2)),
            ("1", .5, "wrong-quantity.png", "Beans and rice, with tomatoes", Fraction(1)),
            ("1", 1.5, "plain.png", "Beans and rice, plain", Fraction(3, 2)),
            ("1", 2, "canned.png", "Beans and rice, with tomatoes, canned", Fraction(2)),
        ]
        portions = atlas_portions(food, images)
        self.assertEqual([(row[1], row[2]) for row in portions], [(85, "atlas/correct.png"), (170, None)])


if __name__ == "__main__":
    unittest.main()
