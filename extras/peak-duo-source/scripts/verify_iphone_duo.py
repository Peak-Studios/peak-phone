"""Check handset scale, glass atlas, hinge sweep, and static/live display clearance."""
from pathlib import Path
import json
import math
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "scripts"))
bpy.ops.wm.open_mainfile(filepath=str(root / "source" / "peak-duo-iphone.blend"))
body = bpy.data.objects["peak_duo_body"]
leaf = bpy.data.objects["peak_duo_leaf"]
body_mesh = next(obj for obj in body.children if obj.type == "MESH")
leaf_mesh = next(obj for obj in leaf.children if obj.type == "MESH")
from handset_geometry import HINGE, STATIC_SCREEN_GAP, glass, live_screen_uv

hinge = Vector((HINGE, 0, 0))
folded_transform = Matrix.Translation(hinge) @ Matrix.Rotation(math.pi, 4, "Z")
identity = Matrix.Identity(4)

def tree(obj, transform):
    mesh = obj.data
    mesh.calc_loop_triangles()
    return BVHTree.FromPolygons(
        [transform @ vert.co for vert in mesh.vertices],
        [tuple(tri.vertices) for tri in mesh.loop_triangles],
        all_triangles=True,
        epsilon=1e-8,
    )

def surface_tree(display_name, static=False, transform=identity):
    half = "body" if display_name == "bodyInner" else "leaf"
    display = glass(half, display_name == "cover")
    offset = (STATIC_SCREEN_GAP if display_name == "cover" else -STATIC_SCREEN_GAP) if static else 0
    points = [Vector((x, y + offset, z)) for x, y, z in display["vertices"]]
    return BVHTree.FromPolygons(
        [transform @ point for point in points], display["faces"], all_triangles=True, epsilon=1e-8
    )

def surface_points(display_name, static=False, transform=identity):
    half = "body" if display_name == "bodyInner" else "leaf"
    display = glass(half, display_name == "cover")
    offset = (STATIC_SCREEN_GAP if display_name == "cover" else -STATIC_SCREEN_GAP) if static else 0
    return [transform @ Vector((x, y + offset, z)) for x, y, z in display["vertices"]]

def assert_facing(display_name):
    display = glass("body" if display_name == "bodyInner" else "leaf", display_name == "cover")
    for face in display["faces"]:
        a, b, c = (Vector(display["vertices"][index]) for index in face)
        normal_y = (b - a).cross(c - a).y
        assert normal_y * display["normal"] > 0, (display_name, normal_y, display["normal"])

fixed = tree(body_mesh, identity)
body_x = [v.co.x for v in body_mesh.data.vertices if v.co.x <= hinge.x + 1e-7]
leaf_x = [v.co.x for v in leaf_mesh.data.vertices]
body_z = [v.co.z for v in body_mesh.data.vertices]
leaf_z = [v.co.z for v in leaf_mesh.data.vertices]
assert abs((max(body_x)-min(body_x))-(max(leaf_x)-min(leaf_x))) < .00001, "Shell widths differ"
assert abs(min(body_z)-min(leaf_z)) < .00001 and abs(max(body_z)-max(leaf_z)) < .00001, "Panel top/bottom edges must align"
expanded_transform = Matrix.Translation(hinge)
expanded = [expanded_transform @ v.co for v in leaf_mesh.data.vertices]
folded = [folded_transform @ v.co for v in leaf_mesh.data.vertices]
assert min(v.x for v in expanded) > 0.035, "Moving half must open beyond the positive-X rim"
assert abs((min(v.x for v in folded)+max(v.x for v in folded))/2) < .002, "Closed leaf must cover the held half"

displays = {
    "bodyInner": ("body", False),
    "leafInner": ("leaf", False),
    "cover": ("leaf", True),
}
atlas_regions = {}
for display_name, (half, cover) in displays.items():
    display = glass(half, cover)
    assert_facing(display_name)
    mapped = [live_screen_uv(display_name, u, v) for u, v in display["uvs"]]
    atlas_regions[display_name] = [min(u for u, _ in mapped), max(u for u, _ in mapped)]
expected_regions = {"bodyInner": [.25, .5], "leafInner": [0, .25], "cover": [.5, .75]}
for name, expected in expected_regions.items():
    assert max(abs(a-b) for a,b in zip(atlas_regions[name], expected)) < 1e-7, (name, atlas_regions[name])

live_offset_y = glass("body")["vertices"][0][1]
static_body_y = live_offset_y - STATIC_SCREEN_GAP
static_leaf_y = live_offset_y - STATIC_SCREEN_GAP
cover_live_y = glass("leaf", True)["vertices"][0][1]
static_cover_y = cover_live_y + STATIC_SCREEN_GAP
for obj, y in ((body_mesh, static_body_y), (leaf_mesh, static_leaf_y), (leaf_mesh, static_cover_y)):
    assert any(abs(vertex.co.y-y) < 1e-7 for vertex in obj.data.vertices), (obj.name, y)

body_static_points = surface_points("bodyInner", static=True)
body_live_points = surface_points("bodyInner")
leaf_static_points = surface_points("leafInner", static=True, transform=folded_transform)
leaf_live_points = surface_points("leafInner", transform=folded_transform)
closed_static_clearance = min(point.y for point in leaf_static_points) - max(point.y for point in body_static_points)
closed_live_clearance = min(point.y for point in leaf_live_points) - max(point.y for point in body_live_points)
open_static_live_gap = min(point.y for point in body_live_points) - max(point.y for point in body_static_points)
assert abs(closed_static_clearance-(2*(abs(live_offset_y)+STATIC_SCREEN_GAP))) < 1e-7
assert abs(closed_live_clearance-2*abs(live_offset_y)) < 1e-7
assert abs(open_static_live_gap-STATIC_SCREEN_GAP) < 1e-7
assert abs(max(p.x for p in surface_points("bodyInner"))-hinge.x)<1e-7, "Fixed glass must stop at the hinge"
assert abs(min(p.x for p in surface_points("leafInner",transform=expanded_transform))-hinge.x)<1e-7, "Leaf glass must meet the same hinge"

# A Z-axis hinge fold reverses the inner screen normal while leaving the case
# and the local face UVs attached to their native body/leaf origins.
assert (folded_transform.to_3x3() @ Vector((0, 1, 0))).y < -.99
assert (folded_transform.to_3x3() @ Vector((0, -1, 0))).y > .99

fixed_surfaces = {
    "bodyStaticInner": surface_tree("bodyInner", static=True),
    "bodyLiveInner": surface_tree("bodyInner"),
}
moving_surface_names = [
    ("leafStaticInner", "leafInner", True),
    ("leafLiveInner", "leafInner", False),
    ("leafStaticCover", "cover", True),
    ("leafLiveCover", "cover", False),
]
intersections = []
for angle in range(0, 181):
    transform = Matrix.Translation(hinge) @ Matrix.Rotation(math.radians(angle), 4, "Z")
    moving_shell = tree(leaf_mesh, transform)
    moving_surfaces = {name: surface_tree(display, static, transform) for name, display, static in moving_surface_names}
    hits = []
    if fixed.overlap(moving_shell):
        hits.append("bodyShell:leafShell")
    for name, moving_surface in moving_surfaces.items():
        if fixed.overlap(moving_surface):
            hits.append(f"bodyShell:{name}")
    for fixed_name, fixed_surface in fixed_surfaces.items():
        if fixed_surface.overlap(moving_shell):
            hits.append(f"{fixed_name}:leafShell")
        for moving_name, moving_surface in moving_surfaces.items():
            if fixed_surface.overlap(moving_surface):
                hits.append(f"{fixed_name}:{moving_name}")
    if hits:
        intersections.append({"angle": angle, "pairs": hits})

report = {
    "anglesSampled": 181,
    "intersections": intersections,
    "openingSide": "positive-X",
    "closedLeafCenteredOnBody": True,
    "matchedPanelDimensions": True,
    "screenFacing": {"innerOpen": "+Y", "coverOpen": "-Y", "innerClosed": "-Y", "coverClosed": "+Y"},
    "atlasResolution": [2048, 1024],
    "liveAtlasRegions": atlas_regions,
    "staticScreenGapFromCaseMetres": STATIC_SCREEN_GAP,
    "openStaticToLiveScreenGapMetres": open_static_live_gap,
    "closedStaticGlassClearanceMetres": closed_static_clearance,
    "closedLiveOverlayClearanceMetres": closed_live_clearance,
    "foldOverlapPairsChecked": ["bodyShell:leafShell", "bodyStaticInner/LiveInner:leafShell/StaticInner/LiveInner/StaticCover/LiveCover"],
    "hingeEndSupportsOutsideActiveGlass": True,
    "hingeMetres": list(hinge),
    "previewOnly": True,
}
assert not intersections, intersections
(root / "evidence" / "iphone-duo-sweep.json").write_text(json.dumps(report, indent=2))
print("IPHONE_DUO_SWEEP", json.dumps(report))
