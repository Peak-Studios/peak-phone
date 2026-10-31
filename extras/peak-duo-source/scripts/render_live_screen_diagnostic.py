"""Render actual slot-01 DUI meshes against a labeled atlas in entity poses.

Run from this directory with Blender 5.2 after
create_live_screen_diagnostic_atlases.py. The regular Blender assets and
production texture atlas are read-only inputs; only evidence files are written.
"""
from pathlib import Path
import argparse
import json
import hashlib
import math
import sys
import xml.etree.ElementTree as ET

import bpy
from mathutils import Matrix, Vector

parser = argparse.ArgumentParser()
parser.add_argument('--tag', default='current', help='filename suffix for the evidence set')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence'
SOURCE = ROOT / 'source'
ROUNDTRIP = EVIDENCE / 'live-screens-roundtrip'
STREAM = ROOT.parents[1] / 'stream'
HINGE = .0391875

with open(EVIDENCE / 'live-screens-binaries.json', encoding='utf-8-sig') as f:
    binary_records = json.load(f)
records = {item['file']: item for item in binary_records}
for name, record in records.items():
    assert hashlib.sha256((STREAM/name).read_bytes()).hexdigest() == record['sha256'], name
expected_names = {f'peak_duo_screen_{half}_{slot:02d}'
                  for slot in range(1, 17) for half in ('body', 'leaf')}
assert len(binary_records) == 34
assert {Path(name).stem for name in records if name.endswith('.ydr')} == expected_names, 'expected 32 decoded slot meshes'

bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'peak-duo-iphone.blend'))
scene = bpy.context.scene
body = bpy.data.objects['peak_duo_body']
leaf = bpy.data.objects['peak_duo_leaf']
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1

image = bpy.data.images.load(str(EVIDENCE / 'live-screen-test-atlas-landscape.png'), check_existing=True)
image.filepath = str(EVIDENCE / 'live-screen-test-atlas-landscape.png')
material = bpy.data.materials.new('Live display diagnostic atlas')
material.use_nodes = True
nodes = material.node_tree.nodes
nodes.clear()
output = nodes.new('ShaderNodeOutputMaterial')
texture = nodes.new('ShaderNodeTexImage')
texture.image = image
texture.interpolation = 'Closest'
emission = nodes.new('ShaderNodeEmission')
material.node_tree.links.new(texture.outputs['Color'], emission.inputs['Color'])
material.node_tree.links.new(emission.outputs['Emission'], output.inputs['Surface'])

def decoded_overlay(name):
    """Create a Blender preview mesh directly from CodeWalker-decoded High LOD."""
    xml_path = ROUNDTRIP / (name + '.ydr.xml')
    root = ET.parse(xml_path).getroot()
    geometries = root.findall('./DrawableModelsHigh/Item/Geometries/Item')
    assert geometries, xml_path
    vertices, texcoords, faces = [], [], []
    for geometry in geometries:
        rows = [[float(n) for n in row.split()]
                for row in geometry.findtext('VertexBuffer/Data').strip().splitlines()]
        base = len(vertices)
        vertices.extend((row[0],row[1],row[2]) for row in rows)
        # CodeWalker XML uses top-origin V while Blender uses bottom-origin V.
        texcoords.extend((row[-2],1.0-row[-1]) for row in rows)
        indices = [int(index) for index in geometry.findtext('IndexBuffer/Data').split()]
        assert len(indices)%3 == 0
        faces.extend([base+indices[i],base+indices[i+1],base+indices[i+2]]
                     for i in range(0,len(indices),3))
    mesh = bpy.data.meshes.new(name + '_decoded_high_mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    uv_layer = mesh.uv_layers.new(name='UVMap decoded')
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = texcoords[loop.vertex_index]
    obj = bpy.data.objects.new(name + '_decoded_high', mesh)
    scene.collection.objects.link(obj)
    obj.hide_render = False
    return obj

live_body = decoded_overlay('peak_duo_screen_body_01')
live_leaf = decoded_overlay('peak_duo_screen_leaf_01')

production_atlas = bpy.data.images.load(str(SOURCE / 'textures' / 'iphone_duo_atlas.png'), check_existing=True)
for mat in bpy.data.materials:
    if not mat.name.startswith('Peak Duo |') or not mat.use_nodes:
        continue
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = production_atlas
    if 'screens and logo' in mat.name:
        emission = nodes.new('ShaderNodeEmission')
        mat.node_tree.links.new(tex.outputs['Color'], emission.inputs['Color'])
        mat.node_tree.links.new(emission.outputs['Emission'], output.inputs['Surface'])
    else:
        principled = nodes.new('ShaderNodeBsdfPrincipled')
        mat.node_tree.links.new(tex.outputs['Color'], principled.inputs['Base Color'])
        mat.node_tree.links.new(principled.outputs['BSDF'], output.inputs['Surface'])
        principled.inputs['Metallic'].default_value = .35
        principled.inputs['Roughness'].default_value = .42

scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.045, .05, .062, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .8

def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

bpy.ops.object.camera_add(location=(0, .45, .2))
camera = bpy.context.object
camera.data.type = 'ORTHO'
scene.camera = camera
lights = []
for location, strength in [((.08, .15, .20), 16), ((-.14, .13, .08), 10), ((.07, -.15, .2), 9)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.data.energy = strength
    light.data.size = .24
    lights.append(light)

def render_pose(label, fold=0.0, portrait=False):
    orientation = Matrix.Rotation(math.radians(90) if portrait else 0.0, 4, 'Y')
    body.matrix_world = orientation
    leaf.matrix_world = orientation @ Matrix.Translation((HINGE, 0, 0)) @ Matrix.Rotation(fold, 4, 'Z')
    live_body.matrix_world = body.matrix_world.copy()
    live_leaf.matrix_world = leaf.matrix_world.copy()
    bpy.context.view_layer.update()
    target = orientation @ Vector((0 if fold else HINGE, 0, 0))
    camera.location = target + Vector((0, .45, 0))
    aim(camera, target)
    if fold:
        camera.data.ortho_scale = .126
        scene.render.resolution_x, scene.render.resolution_y = 900, 1200
    elif portrait:
        camera.data.ortho_scale = .205
        scene.render.resolution_x, scene.render.resolution_y = 900, 1200
    else:
        camera.data.ortho_scale = .18
        scene.render.resolution_x, scene.render.resolution_y = 1200, 900
    test_atlas = EVIDENCE / ('live-screen-test-atlas-portrait.png' if portrait else
                             'live-screen-test-atlas-landscape.png')
    image.filepath = str(test_atlas)
    image.reload()
    filename = f'live-screen-diagnostic-{label}-{args.tag}.png'
    scene.render.filepath = str(EVIDENCE / filename)
    bpy.ops.render.render(write_still=True)
    return filename

images = {
    'openLandscape': render_pose('open-landscape'),
    'openPortrait': render_pose('open-portrait', portrait=True),
    'foldedCover': render_pose('folded-cover', fold=math.pi),
}
report = {
    'evidenceStatus': 'Decoded shipped-overlay evidence. Slot-01 body and leaf meshes are reconstructed from CodeWalker-decoded native YDR High LOD XML whose stream hashes are recorded here; the matching diagnostic PNGs render those decoded meshes.',
    'source': 'CodeWalker-decoded native slot-01 body and leaf YDR High LOD meshes reconstructed from evidence/live-screens-roundtrip',
    'sourceBinaryHashes': {name: records[name]['sha256'] for name in
                           ('peak_duo_screen_body_01.ydr','peak_duo_screen_leaf_01.ydr')},
    'decodedLodRendered': 'High',
    'diagnosticVConversion': 'CodeWalker top-origin V inverted for Blender image sampling',
    'runtimeTransforms': {
        'body': 'entity orientation',
        'leaf': 'body orientation @ hinge translation @ local fold rotation',
        'portrait': 'body local +Y quarter-turn, matching client orient() target',
        'folded': 'leaf local Z rotation 180 degrees about the body hinge',
    },
    'atlas': {'pixels': [2048, 1024],
              'landscapeBandsInIncreasingU': ['LEFT', 'RIGHT', 'COVER', 'UNUSED'],
              'portraitBandsInIncreasingU': ['RIGHT', 'LEFT', 'COVER', 'UNUSED'],
              'slotModelCount': len(expected_names)},
    'poses': images,
    'note': 'Decoded overlay meshes are rendered over the Blender handset shell preview. Portrait atlas payload order accounts for the entity quarter-turn; FiveM CEF and physical-client validation remain necessary.'
}
(EVIDENCE / f'live-screen-diagnostic-{args.tag}.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('LIVE_SCREEN_DIAGNOSTIC', json.dumps({'tag': args.tag, 'models': len(expected_names), 'poses': images}, separators=(',', ':')))
