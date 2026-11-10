import http.server
import io
import runpy
import threading
import unittest
import zipfile
from fractions import Fraction
from pathlib import Path

module = runpy.run_path(str(Path(__file__).with_name("import-portions.py")))
atlas_portions, measure, measure_labels, RemoteFile = (
    module[name] for name in ("atlas_portions", "parse_measure", "measure_labels", "RemoteFile"))


class MeasureTest(unittest.TestCase):
    def test_quantity_and_unit_are_read_from_household_labels(self):
        self.assertEqual(measure("1 cup"), (Fraction(1), "cup"))
        self.assertEqual(measure("1 1/2 cups, cooked"), (Fraction(3, 2), "cup"))
        self.assertEqual(measure("1-1/2 slices"), (Fraction(3, 2), "slice"))
        self.assertEqual(measure("2 slices, thin"), (Fraction(2), "slice"))
        self.assertEqual(measure("1/2 medium whole vegetable"), (Fraction(1, 2), "medium whole vegetable"))
        self.assertEqual(measure("3 ounces"), (Fraction(3), "ounce"))
        self.assertEqual(measure("8 fo"), (Fraction(8), "fluid ounce"))
        self.assertEqual(measure("1 piece (2\" x 2\")"), (Fraction(1), "piece"))
        self.assertIsNone(measure("Quantity not specified"))
        self.assertIsNone(measure("N/A"))
        self.assertIsNone(measure("0 cup"))

    def test_labels_are_localised(self):
        self.assertEqual(measure_labels(Fraction(1, 2), "cup"), {"en": "½ cup", "fr": "½ tasse"})
        self.assertEqual(measure_labels(Fraction(2), "slice"), {"en": "2 slices", "fr": "2 tranches"})
        self.assertEqual(measure_labels(Fraction(1), "piece"), {"en": "1 piece", "fr": "1 pièce"})
        self.assertEqual(measure_labels(Fraction(3, 2), "sandwich"), {"en": "1½ sandwichs", "fr": "1½ sandwichs"})
        self.assertEqual(measure_labels(Fraction(1), "gizmo"), {"en": "1 gizmo", "fr": ""})


class AtlasPhotoMatchTest(unittest.TestCase):
    def test_only_compatible_photo_portions_are_linked(self):
        food = {
            "description": "Beans and rice, with tomatoes",
            "foodPortions": [{"modifier": "1", "portionDescription": "1 cup", "gramWeight": 170}],
        }
        images = [
            ("1", .5, "correct.png", "Beans and rice, with tomatoes", (Fraction(1, 2), "cup")),
            ("1", .5, "wrong-quantity.png", "Beans and rice, with tomatoes", (Fraction(1), "cup")),
            ("1", 1.5, "plain.png", "Beans and rice, plain", (Fraction(3, 2), "cup")),
            ("1", 2, "canned.png", "Beans and rice, with tomatoes, canned", (Fraction(2), "cup")),
        ]
        portions = atlas_portions(food, images)
        self.assertEqual([(row[1], row[2]) for row in portions], [(85, "atlas/correct.png"), (170, None)])

    def test_a_close_food_photo_is_kept_and_flagged_when_no_exact_photo_exists(self):
        food = {
            "description": "Goat milk",
            "foodPortions": [{"modifier": "3", "portionDescription": "1 cup", "gramWeight": 244}],
        }
        images = [
            ("3", 1, "milk.png", "Beverage, 1 cup, glass measuring cup, Milk, NFS", (Fraction(1), "cup")),
            ("3", 2, "wrong-unit.png", "Beverage, Milk, NFS", (Fraction(2), "glass")),
        ]
        portions = atlas_portions(food, images)
        self.assertEqual([row[1:3] + row[4:] for row in portions], [[244, "atlas/milk.png", 1]])
        exact = images + [("3", .5, "goat.png", "Goat milk, 1/2 cup", (Fraction(1, 2), "cup"))]
        self.assertEqual([(row[1], row[2], len(row)) for row in atlas_portions(food, exact)],
                         [(122, "atlas/goat.png", 4), (244, None, 4)])

    def test_photos_of_pieces_and_slices_are_linked_when_the_unit_matches(self):
        food = {
            "description": "Bread, whole wheat",
            "foodPortions": [{"modifier": "7", "portionDescription": "1 slice", "gramWeight": 32}],
        }
        images = [
            ("7", 1, "one.png", "Whole wheat bread, 1 slice", (Fraction(1), "slice")),
            ("7", 2, "two.png", "Whole wheat bread, 2 slices", (Fraction(2), "slice")),
            ("7", 2, "pieces.png", "Whole wheat bread, 2 pieces", (Fraction(2), "piece")),
            ("7", 3, "unreadable.png", "Whole wheat bread", None),
        ]
        portions = atlas_portions(food, images)
        self.assertEqual([(row[1], row[2], row[3]["fr"]) for row in portions],
                         [(32, "atlas/one.png", "1 tranche"), (64, "atlas/two.png", "2 tranches")])


class RemoteArchiveTest(unittest.TestCase):
    def test_a_member_is_read_through_range_requests_only(self):
        payload = io.BytesIO()
        with zipfile.ZipFile(payload, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("filler.bin", bytes(range(256)) * 4000)
            archive.writestr("images/wanted.png", b"\x89PNG\r\n\x1a\n" + b"x" * 100)
        data = payload.getvalue()
        served = []

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                start, end = (int(part) for part in self.headers["Range"].removeprefix("bytes=").split("-"))
                served.append(end - start + 1)
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {start}-{end}/{len(data)}")
                self.send_header("Content-Length", str(end - start + 1))
                self.end_headers()
                self.wfile.write(data[start:end + 1])

            def log_message(self, *args):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        remote = RemoteFile(f"http://127.0.0.1:{server.server_port}/archive.zip")
        remote.BLOCK = 4096
        with zipfile.ZipFile(io.BufferedReader(remote, 4096)) as archive:
            self.assertEqual(archive.namelist(), ["filler.bin", "images/wanted.png"])
            self.assertTrue(archive.read("images/wanted.png").startswith(b"\x89PNG"))
        self.assertLess(sum(served), len(data) // 2)


if __name__ == "__main__":
    unittest.main()
