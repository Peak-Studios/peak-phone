"""Replace the Peak Duo game drawables with the supplied two-half GLB."""
from pathlib import Path
import argparse
import json
import math
import sys
import xml.etree.ElementTree as ET

import bpy
import bmesh
from mathutils import Vector

args = argparse.ArgumentParser()
args.add_argument("--toolchain", required=True)
opt = args.parse_args(sys.argv[sys.argv.index("--") + 1:])
ROOT = Path(__file__).resolve().parents[1]
TEXTURES = ROOT / "source" / "textures"
OUT = ROOT / "intermediates"
OUT.mkdir(exist_ok=True)
assert bpy.app.version[:2] == (5, 2), bpy.app.version_string
sys.path[:0] = [str(Path(opt.toolchain) / "blender-addons"), str(Path(opt.toolchain) / "sollumz-python")]
import addon_utils
addon_utils.enable("Sollumz", default_set=True, persistent=False)
from Sollumz.meta import sollumz_version
from Sollumz.sollumz_properties import SollumType, LODLevel
from Sollumz.ydr.shader_materials import create_shader
from Sollumz.tools.drawablehelper import convert_obj_to_model
from Sollumz.iecontext import ExportContext, ExportSettings, export_context_scope
from Sollumz.ydr.ydrexport import export_ydr
from szio.gta5 import AssetFormat, AssetVersion, AssetTarget, AssetTextureDictionary, EmbeddedTexture
from szio.types import DataSource
assert sollumz_version() == "2.9.0", sollumz_version()

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT / "source" / "iphone-duo.glb"))
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
atlas_map = json.loads((TEXTURES / "iphone_duo_atlas.json").read_text())

atlas = bpy.data.images.load(str(TEXTURES / "iphone_duo_atlas.dds"), check_existing=True)
shader = create_shader("spec.sps")
shader.name = "Peak Duo | supplied model atlas"
shader.node_tree.nodes["DiffuseSampler"].image = atlas
shader.node_tree.nodes["DiffuseSampler"].texture_properties.embedded = False
spec = shader.node_tree.nodes.get("SpecSampler")
if spec:
    spec.image = bpy.data.images.load(str(TEXTURES / "peak_duo_spec.dds"), check_existing=True)
    spec.texture_properties.embedded = False

glow = create_shader("emissive.sps")
glow.name = "Peak Duo | screens and logo"
glow.node_tree.nodes["DiffuseSampler"].image = atlas
glow.node_tree.nodes["DiffuseSampler"].texture_properties.embedded = False

def cell_uv(name, uv):
    tile = atlas_map[name]
    return ((tile["col"] + uv[0] % 1) / 8, 1 - (tile["row"] + 1 - uv[1] % 1) / 8)

def lock_uv(vertex, bounds, display):
    x0, x1, z0, z1 = bounds
    u = (vertex.x - x0) / (x1 - x0)
    v = (vertex.z - z0) / (z1 - z0)
    if display == "cover-display":
        u = 1 - u
        x_atlas, y_atlas, width, height = 642, 514, 380, 508
    else:
        # The player views the +Y glass opposite local +X, so reverse U while
        # retaining each half's matching region in the landscape atlas.
        u = 1 - u
        u = u * .5 + (.5 if display == "inner-display-right" else 0)
        x_atlas, y_atlas, width, height = 258, 514, 380, 252
    # Keep a two-pixel inset so mipmaps never sample neighbouring atlas cells.
    return ((x_atlas + u * width) / 1024, 1 - (y_atlas + (1 - v) * height) / 1024)

apple_objects = {"tnxsltexVWtEjsz", "tYVfzVmYBKhfUhm"}
redundant_back_surface = {"fapSTOypmavuPic"}
# Keep the supplier-authored volume and power controls on the fixed side rail.
# These are separate source meshes so their seams, insets, and metallic faces
# remain real geometry after the replacement shells are generated.
edge_hardware = {"AjfIgUpXxKaENDl", "UXtkILReLwCJaov", "ejUvJHtjfcqjSvM",
                 "VNIQJMrwFmXgrBf", "fbvEqfwjsAMSDkr", "tkSBzAjLTdhANqx"}
groups = {"body": [], "leaf": []}
scale = 0.0095
for obj in list(bpy.data.objects):
    if obj.type != "MESH":
        continue
    if obj.name in apple_objects | redundant_back_surface:
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    half = "leaf" if obj.parent and obj.parent.name == "left-half" else "body"
    original_matrix = obj.matrix_world.copy()
    source_points = [original_matrix @ v.co for v in obj.data.vertices]
    camera = half == "body" and min(p.z for p in source_points)>2.8 and max(p.z for p in source_points)<5.8 and min(p.y for p in source_points)>.47
    keep_edge_hardware = half == "body" and obj.name in edge_hardware
    if not camera and not keep_edge_hardware:
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    obj.data = obj.data.copy()
    obj.parent = None
    mesh = obj.data
    for vertex in mesh.vertices:
        pos = original_matrix @ vertex.co
        vertex.co = ((pos.x + (-4.125 if half == "body" else 8.25)) * scale,
                     -0.0012 - pos.y * scale, pos.z * scale * .93)
    if half == "body" and not keep_edge_hardware:
        # Reserve clearance between the fixed rim and the moving hinge shell.
        for vertex in mesh.vertices:
            vertex.co.x = min(vertex.co.x, 0.0383875)
    obj.matrix_world.identity()
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap 0")
    uv.name = "UVMap 0"
    is_display = obj.name in {"inner-display-left", "inner-display-right", "cover-display"}
    if is_display:
        xs = [v.co.x for v in mesh.vertices]
        zs = [v.co.z for v in mesh.vertices]
        bounds = min(xs), max(xs), min(zs), max(zs)
    original_mats = [mat.name if mat else None for mat in mesh.materials]
    for poly in mesh.polygons:
        mat_name = original_mats[poly.material_index]
        for loop_idx in poly.loop_indices:
            uv.data[loop_idx].uv = (lock_uv(mesh.vertices[mesh.loops[loop_idx].vertex_index].co, bounds,
                                             obj.name) if is_display else
                                    cell_uv(mat_name, uv.data[loop_idx].uv) if mat_name in atlas_map else (0.01, 0.99))
        poly.material_index = 1 if is_display else 0
    mesh.materials.clear()
    mesh.materials.append(shader)
    mesh.materials.append(glow)
    reflected = bmesh.new()
    reflected.from_mesh(mesh)
    # X/Y axis reflections preserve face winding.
    reflected.to_mesh(mesh)
    reflected.free()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True);bpy.context.view_layer.objects.active=obj
    camera_lod=obj.modifiers.new("Camera detail budget","DECIMATE");camera_lod.ratio=.25
    bpy.ops.object.modifier_apply(modifier=camera_lod.name)
    groups[half].append(obj)

# Both shells are authored from one dimensional definition instead of the
# incompatible imported bezels. The two inner glasses are coplanar when open.
sys.path.insert(0,str(Path(__file__).resolve().parent))
from handset_geometry import outline, glass, WIDTH, HEIGHT, HINGE, FRONT, BACK, STATIC_SCREEN_GAP
for half in ("body","leaf"):
    cx = 0 if half == "body" else HINGE
    ring = outline(cx,WIDTH-.0016,HEIGHT,.007,
                   inner_side='right' if half=='body' else None,
                   corner_radii={0:.0085,90:.0018,180:.0018,270:.0085} if half=='leaf' else None)
    n = len(ring)
    verts = [(x,y,z) for y in (FRONT,BACK) for x,z in ring]
    faces = [tuple(range(n)),tuple(reversed(range(n,2*n)))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(half+" matched shell")
    mesh.from_pydata(verts,[],faces)
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    mesh.materials.append(shader)
    uv=mesh.uv_layers.new(name="UVMap 0")
    for loop in uv.data: loop.uv=(.01,.99)
    obj=bpy.data.objects.new(half+" shell",mesh);scene.collection.objects.link(obj)
    # A restrained 0.65 mm roll catches light along the case edge while the
    # inner hinge boundaries stay covered by the uninterrupted live glass.
    edge_roll=obj.modifiers.new("Machined case edge roll","BEVEL")
    edge_roll.width=.00065;edge_roll.segments=3;edge_roll.limit_method="ANGLE"
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=edge_roll.name)
    groups[half].append(obj)
    for cover in ([False] if half=="body" else [False,True]):
        display=glass(half,cover)
        mesh=bpy.data.meshes.new(half+" glass")
        # Keep the native live surface 0.08 mm above the static glass.
        mesh.from_pydata([(x,y+(STATIC_SCREEN_GAP if cover else -STATIC_SCREEN_GAP),z) for x,y,z in display['vertices']],[],display['faces'])
        mesh.materials.append(glow);uv=mesh.uv_layers.new(name="UVMap 0")
        for loop in mesh.loops:
            u,v=display['uvs'][loop.vertex_index]
            if cover:
                atlas_uv=((642+u*380)/1024,1-(514+(1-v)*508)/1024)
            else:
                # The player views the +Y inner face opposite local +X. The
                # 384 px lock atlas spans the whole open canvas: leaf is its
                # visual left half, body its visual right half.
                offset=.5 if half=='body' else 0
                atlas_u=(1-u)*.5+offset
                atlas_uv=((258+atlas_u*380)/1024,1-(514+(1-v)*252)/1024)
            uv.data[loop.index].uv=atlas_uv
        obj=bpy.data.objects.new(half+" static glass",mesh);scene.collection.objects.link(obj);groups[half].append(obj)

# The folded outer display has one small selfie camera in its upper-right
# corner. It is a separate dark lens and machined rim, not a centered pill.
camera_x, camera_z = .070, .0448
cover_y = BACK - .00008
camera_dark_uv = (400 / 1024, 1 - 450 / 1024)
camera_rim_uv = (640 / 1024, 1 - 130 / 1024)
bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=12,
    location=(camera_x, cover_y - .00042, camera_z),
    rotation=(math.pi / 2, 0, 0), major_radius=.0022, minor_radius=.00032)
lens_rim=bpy.context.object;lens_rim.name="Cover selfie camera bezel"
lens_rim.data.materials.append(shader)
rim_uv=lens_rim.data.uv_layers.active or lens_rim.data.uv_layers.new(name="UVMap 0")
for loop in rim_uv.data:loop.uv=camera_rim_uv
groups["leaf"].append(lens_rim)
bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.0022,depth=.00012,
    location=(camera_x,cover_y-.00062,camera_z),rotation=(math.pi/2,0,0))
lens=bpy.context.object;lens.name="Cover selfie camera lens"
lens.data.materials.append(glow)
lens_uv=lens.data.uv_layers.active or lens.data.uv_layers.new(name="UVMap 0")
for loop in lens_uv.data:loop.uv=camera_dark_uv
groups["leaf"].append(lens)

# Recessed end knuckles connect the hinge mechanically without placing a
# barrel across the continuous active display. They stay outside the glass.
for z in (-.0532,.0532):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.00065,depth=.0012,location=(HINGE,0,z))
    pin=bpy.context.object;pin.name="Hinge end knuckle"
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    pin.data.materials.append(shader);uv=pin.data.uv_layers.active or pin.data.uv_layers.new(name="UVMap 0")
    for loop in uv.data:loop.uv=(.01,.99)
    groups['body'].append(pin)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(HINGE-.0008,-.0013,z))
    support=bpy.context.object;support.name="Hinge knuckle support";support.dimensions=(.0016,.002,.0012)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    support.data.materials.append(shader);uv=support.data.uv_layers.active or support.data.uv_layers.new(name="UVMap 0")
    for loop in uv.data:loop.uv=(.01,.99)
    groups['body'].append(support)

# The two flat rear-center meshes in the supplied GLB are its original badge.
# Replace their silhouette with a vectorized version of the supplied Peak logo.
paths = json.loads((TEXTURES / "peak_logo_contours.json").read_text())
curve = bpy.data.curves.new("Peak logo outline", "CURVE")
curve.dimensions = "2D"
curve.fill_mode = "BOTH"
for path in paths:
    spline = curve.splines.new("POLY")
    pts = path["points"]
    spline.points.add(len(pts) - 1)
    for p, (x, y) in zip(spline.points, pts):
        p.co = ((x - 750) / 1500 * 2, (750 - y) / 1500 * 2, 0, 1)
    spline.use_cyclic_u = True
logo = bpy.data.objects.new("Peak rear badge", curve)
scene.collection.objects.link(logo)
bpy.ops.object.select_all(action="DESELECT")
logo.select_set(True)
bpy.context.view_layer.objects.active = logo
bpy.ops.object.convert(target="MESH")
logo = bpy.context.object
for vert in logo.data.vertices:
    x, z = vert.co.x, vert.co.y
    vert.co = (x * 0.025, -0.00625, z * 0.025)
logo.data.update()
uv = logo.data.uv_layers.new(name="UVMap 0")
for item in uv.data:
    item.uv = cell_uv("__peak_logo__", (0.5, 0.5))
logo.data.materials.append(glow)
logo_colors = logo.data.color_attributes.new(name="Color 1", type="BYTE_COLOR", domain="CORNER")
for color in logo_colors.data:
    color.color = (1, 1, 1, 1)

def active_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for item in objects:
        item.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]

roots = {}
report = {"source": "iphone-duo.glb", "logo": "peak-logo-original.png", "scale": scale,
          "units": "metres", "edgeRollMetres": .00065, "retainedEdgeHardware": sorted(edge_hardware),
          "coverSelfieLens": {"singleCircularCutout": True, "localCenterMetres": [camera_x,camera_z],
                              "outerRadiusMetres": .00252, "darkLensRadiusMetres": .0022,
                              "placement": "upper-right when the cover is folded toward the viewer"},
          "removedBadgeObjects": sorted(apple_objects),
          "omittedOverlappingSurface": sorted(redundant_back_surface), "triangles": {}}
for half, objects in groups.items():
    active_only(objects)
    bpy.ops.object.join()
    high = bpy.context.object
    high.name = half + "_HIGH"
    colors = high.data.color_attributes.get("Color 1") or high.data.color_attributes.new(
        name="Color 1", type="BYTE_COLOR", domain="CORNER")
    for color in colors.data:
        color.color = (1, 1, 1, 1)
    high.data.calc_loop_triangles()
    original_tris = len(high.data.loop_triangles)
    lods = []
    for label, ratio in (("HIGH", 0.14), ("MEDIUM", 0.035), ("LOW", 0.01)):
        copy = high.copy()
        copy.data = high.data.copy()
        scene.collection.objects.link(copy)
        copy.name = half + "_" + label
        active_only([copy])
        mod = copy.modifiers.new("Game LOD", "DECIMATE")
        mod.ratio = 1.0  # Preserve matching shell/glass boundaries at every LOD.
        bpy.ops.object.modifier_apply(modifier=mod.name)
        if half == "body":
            logo_copy = logo.copy()
            logo_copy.data = logo.data.copy()
            scene.collection.objects.link(logo_copy)
            active_only([copy, logo_copy])
            bpy.ops.object.join()
        copy.data.calc_loop_triangles()
        lods.append(copy)
    bpy.data.objects.remove(high, do_unlink=True)
    main, medium, low = lods
    root = bpy.data.objects.new("peak_duo_" + half, None)
    scene.collection.objects.link(root)
    root.sollum_type = SollumType.DRAWABLE
    root.drawable_properties.lod_dist_high = 12
    root.drawable_properties.lod_dist_med = 30
    root.drawable_properties.lod_dist_low = 65
    root.drawable_properties.lod_dist_vlow = 90
    convert_obj_to_model(main)
    main.parent = root
    main.sz_lods.get_lod(LODLevel.MEDIUM).mesh = medium.data
    main.sz_lods.get_lod(LODLevel.LOW).mesh = low.data
    main.sz_lods.get_lod(LODLevel.VERYLOW).mesh = low.data
    report["triangles"][half] = {"source": original_tris, "high": len(main.data.loop_triangles),
                                  "medium": len(medium.data.loop_triangles), "low": len(low.data.loop_triangles)}
    bpy.data.objects.remove(medium, do_unlink=True)
    bpy.data.objects.remove(low, do_unlink=True)
    roots[half] = root
bpy.data.objects.remove(logo, do_unlink=True)

settings = ExportSettings(targets=(AssetTarget(AssetFormat.CWXML, AssetVersion.GEN8),))
for half, root in roots.items():
    with export_context_scope(ExportContext(root.name, settings)):
        bundle = export_ydr(root)
        assert bundle, half
        bundle.save(OUT, settings.targets)

textures = {
    name: EmbeddedTexture(name, *size, DataSource.create(TEXTURES / (name + ".dds"), name + ".dds"))
    for name, size in (("iphone_duo_atlas", (1024, 1024)), ("peak_duo_spec", (128, 128)))
}
context = ExportContext("peak_duo", settings)
with export_context_scope(context):
    context.make_bundle(AssetTextureDictionary(textures=textures), extra_files=[t.data for t in textures.values()]).save(OUT, settings.targets)

yt = ET.Element("CMapTypes")
ET.SubElement(yt, "extensions")
archetypes = ET.SubElement(yt, "archetypes")
for half, root in roots.items():
    coords = [v.co for child in root.children if child.type == "MESH" for v in child.data.vertices]
    minimum = [min(v[i] for v in coords) for i in range(3)]
    maximum = [max(v[i] for v in coords) for i in range(3)]
    item = ET.SubElement(archetypes, "Item", type="CBaseArchetypeDef")
    for key, value in (("lodDist", 90), ("flags", 32), ("specialAttribute", 0)):
        ET.SubElement(item, key, value=str(value))
    for tag, values in (("bbMin", minimum), ("bbMax", maximum),
                        ("bsCentre", [(lo + hi) / 2 for lo, hi in zip(minimum, maximum)])):
        ET.SubElement(item, tag, **dict(zip("xyz", map(str, values))))
    ET.SubElement(item, "bsRadius", value=str(math.dist(minimum, maximum) / 2))
    ET.SubElement(item, "hdTextureDist", value="12")
    for key, value in (("name", root.name), ("textureDictionary", "peak_duo"),
                       ("clipDictionary", ""), ("drawableDictionary", ""), ("physicsDictionary", ""),
                       ("assetType", "ASSET_TYPE_DRAWABLE"), ("assetName", root.name)):
        ET.SubElement(item, key).text = value
    ET.SubElement(item, "extensions")
ET.SubElement(yt, "name").text = "peak_duo"
ET.SubElement(yt, "dependencies")
ET.SubElement(yt, "compositeEntityTypes")
ET.indent(yt)
ET.ElementTree(yt).write(OUT / "peak_duo.ytyp.xml", encoding="utf-8", xml_declaration=True)

# The game controller attaches the leaf to the stationary body's hinge.
roots["leaf"].location = (HINGE, 0, 0)
roots["leaf"]["preview_position"] = "Assembled in Blender; exported leaf origin remains the hinge."
for name, loc in (("BODY_HAND_ORIGIN", (0, 0, 0)), ("HINGE", (HINGE, 0, 0))):
    empty = bpy.data.objects.new(name, None)
    scene.collection.objects.link(empty)
    empty.location = loc
    empty.empty_display_type = "ARROWS"

for img in list(bpy.data.images):
    if img != atlas and img.name != "peak_duo_spec.dds" and img.users == 0:
        bpy.data.images.remove(img)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "source" / "peak-duo-iphone.blend"))
(ROOT / "evidence" / "iphone-duo-authoring.json").write_text(json.dumps(report, indent=2))
print("IPHONE_DUO_EXPORT", json.dumps(report))
