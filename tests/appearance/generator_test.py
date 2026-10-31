"""Regression coverage for semantic role discovery in the legacy CSS bridge."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = spec_from_file_location("appearance_generator", ROOT / "tools/generate-appearance.py")
GENERATOR = module_from_spec(SPEC)
SPEC.loader.exec_module(GENERATOR)


class AppearanceGeneratorTests(unittest.TestCase):
    def collect(self, css):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "sample.css"
            source.write_text(css, encoding="utf-8")
            return GENERATOR.collect_roles([source])

    def test_descendant_color_does_not_promote_call_row_ancestor(self):
        roles = self.collect(".nx-call-row .nx-call-main strong{color:#fff;background:transparent}")
        self.assertNotIn("nx-call-row", roles["primary"])
        self.assertNotIn("nx-call-row", roles["ink"])
        self.assertNotIn("nx-call-row", roles["grouped"])

    def test_state_subject_does_not_turn_shared_row_or_state_into_role(self):
        roles = self.collect(".gx-row.active{color:#fff;background:rgb(255,0,0)}")
        for role in roles.values():
            self.assertNotIn("gx-row", role)
            self.assertNotIn("active", role)

    def test_attribute_selected_rules_do_not_reclassify_the_base_component(self):
        roles = self.collect('.u27-date[data-selected="true"]{color:#fff;background:rgb(0,104,217)}')
        for role in roles.values():
            self.assertNotIn("u27-date", role)

    def test_media_and_brand_art_are_not_recolored_as_content_cards(self):
        roles = self.collect(
            ".kg-live-card-art{background:linear-gradient(#111,#222);color:#fff}"
            ".kg-post-visual{background:linear-gradient(#111,#222);color:#fff}"
            ".pm-art{background:#7733aa;color:#fff}"
            ".pm-hero{background:#7733aa;color:#fff}"
        )
        for role in roles.values():
            for name in ("kg-live-card-art", "kg-post-visual", "pm-art", "pm-hero"):
                self.assertNotIn(name, role)

    def test_rgb_red_is_opaque_and_rgba_zero_is_transparent(self):
        self.assertTrue(GENERATOR.has_fill({"background": "rgb(255, 0, 0)"}))
        self.assertTrue(GENERATOR.has_fill({"background": "rgba(255, 0, 0, .2)"}))
        self.assertFalse(GENERATOR.has_fill({"background": "rgba(255, 0, 0, 0)"}))


if __name__ == "__main__":
    unittest.main()
