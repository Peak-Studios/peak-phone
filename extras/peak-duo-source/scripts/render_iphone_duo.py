"""Render an authoring preview of the replacement model and its rear logo."""
from pathlib import Path
import math
import bpy
from mathutils import Matrix, Vector

root = Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root / "source" / "peak-duo-iphone.blend"))
body = bpy.data.objects["peak_duo_body"]
leaf = bpy.data.objects["peak_duo_leaf"]
HINGE = 0.0391875
scene = bpy.context.scene
atlas = bpy.data.images.load(str(root / "source" / "textures" / "iphone_duo_atlas.png"), check_existing=True)
for mat in list(bpy.data.materials):
    if not mat.name.startswith("Peak Duo |"):
        continue
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    image = nodes.new("ShaderNodeTexImage")
    image.image = atlas
    if "screens and logo" in mat.name:
        emission = nodes.new("ShaderNodeEmission")
        mat.node_tree.links.new(image.outputs["Color"], emission.inputs["Color"])
        mat.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
        continue
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    mat.node_tree.links.new(image.outputs["Color"], principled.inputs["Base Color"])
    mat.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    principled.inputs["Metallic"].default_value = 0.35
    principled.inputs["Roughness"].default_value = 0.42

scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.world.color = (0.18, 0.18, 0.18)

def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

bpy.ops.object.camera_add(location=(0.24, -0.28, 0.18))
camera = bpy.context.object
aim(camera, (0.039, -0.002, 0))
camera.data.type = "ORTHO"
camera.data.ortho_scale = 0.26
scene.camera = camera
for location, strength in [((0.08, -0.16, 0.20), 12), ((-0.14, -0.10, 0.08), 8),
                           ((0.07, 0.15, 0.20), 9)]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = strength
    light.data.size = 0.24
    aim(light, (0.039, 0, 0))

def render_pose(filename, fold=0.0, portrait=False, side=-1, straight_front=False):
    orientation = Matrix.Rotation(math.radians(90) if portrait else 0.0, 4, "Y")
    body.matrix_world = orientation
    leaf.matrix_world = orientation @ Matrix.Translation((HINGE, 0, 0)) @ Matrix.Rotation(fold, 4, "Z")
    target = orientation @ Vector((0 if fold else HINGE, 0, 0))
    if straight_front:
        camera.location = target + Vector((0, .45, 0))
        camera.data.ortho_scale = .205 if portrait else (.126 if fold else .18)
        scene.render.resolution_x, scene.render.resolution_y = (900, 1200) if (portrait or fold) else (1200, 900)
    else:
        camera.location = target + Vector((0.16, 0.28 if side > 0 else -0.28, 0.18))
        camera.data.ortho_scale = .26
        scene.render.resolution_x, scene.render.resolution_y = 1200, 900
    aim(camera, target)
    scene.render.filepath = str(root / "evidence" / filename)
    bpy.ops.render.render(write_still=True)

render_pose("iphone-duo-front.png", side=1)
render_pose("iphone-duo-rear.png", side=-1)
render_pose("iphone-duo-folded-cover.png", fold=math.pi, side=1)
render_pose("iphone-duo-folded-camera.png", fold=math.pi, side=-1)
render_pose("iphone-duo-static-fallback-portrait-front.png", portrait=True, side=1)
render_pose("iphone-duo-portrait-back.png", portrait=True, side=-1)
render_pose("iphone-duo-open-front-ortho.png", straight_front=True, side=1)
render_pose("iphone-duo-folded-cover-front-ortho.png", fold=math.pi, straight_front=True, side=1)
render_pose("iphone-duo-static-fallback-portrait-front-ortho.png", portrait=True, straight_front=True, side=1)
