"""Build native, per-slot DUI screens from the handset's original display meshes.

blender --background --factory-startup --python-exit-code 1 --python this.py -- --toolchain PATH
Then run convert_live_screens.ps1. The original handset binaries are not modified.
"""
from pathlib import Path
import argparse
import json
import math
import struct
import sys
import xml.etree.ElementTree as ET
import bpy

parser = argparse.ArgumentParser()
parser.add_argument('--toolchain', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'intermediates' / 'live-screens'
OUT.mkdir(parents=True, exist_ok=True)
sys.path[:0] = [str(Path(args.toolchain) / 'blender-addons'), str(Path(args.toolchain) / 'sollumz-python')]
import addon_utils
addon_utils.enable('Sollumz', default_set=True, persistent=False)
from Sollumz.sollumz_properties import SollumType, LODLevel
from Sollumz.ydr.shader_materials import create_shader
from Sollumz.tools.drawablehelper import convert_obj_to_model
from Sollumz.iecontext import ExportContext, ExportSettings, export_context_scope
from Sollumz.ydr.ydrexport import export_ydr
from szio.gta5 import AssetFormat, AssetVersion, AssetTarget, AssetTextureDictionary, EmbeddedTexture
from szio.types import DataSource

sys.path.insert(0,str(Path(__file__).resolve().parent))
from handset_geometry import glass, live_screen_uv, LIVE_SCREEN_OFFSET, STATIC_SCREEN_GAP
displays={'bodyInner':glass('body'),'leafInner':glass('leaf'),'cover':glass('leaf',True)}
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1

settings = ExportSettings(targets=(AssetTarget(AssetFormat.CWXML, AssetVersion.GEN8),))
yt = ET.Element('CMapTypes')
ET.SubElement(yt, 'extensions')
archetypes = ET.SubElement(yt, 'archetypes')
textures, report = {}, {'slots': 16, 'models': [], 'liveScreenOffsetMetres': LIVE_SCREEN_OFFSET, 'staticScreenGapMetres': STATIC_SCREEN_GAP,
    'source': 'handset_geometry.py matched rounded glass',
    'atlas': {'resolution': [2048, 1024], 'leafInner': [0, .25], 'bodyInner': [.25, .5],
              'cover': [.5, .75], 'unused': [.75, 1],
              'mapping': 'leaf U=(1-t)*0.25; body U=.25+(1-t)*0.25; cover U=.5+t*0.25'},
    'boundary': 'Offline geometry/export validation; connected FiveM clients must verify brightness, orientation, and replacement.'}
for slot in range(1,17):
    texname = f'peak_duo_live_{slot:02d}'
    dds = OUT / (texname + '.dds')
    # Small opaque black fallback with all mip levels. Runtime DUI replaces it.
    header = [124,0x2100F,64,64,256,0,7]+[0]*11+[32,0x41,0,32,0xff0000,0xff00,0xff,0xff000000,0x401008,0,0,0,0]
    dds.write_bytes(b'DDS '+struct.pack('<31I', *header)+b''.join(bytes((0,0,0,255))*(s*s) for s in [64,32,16,8,4,2,1]))
    image = bpy.data.images.load(str(dds))
    material = create_shader('emissive.sps')
    material.name = texname
    material.node_tree.nodes['DiffuseSampler'].image = image
    material.node_tree.nodes['DiffuseSampler'].texture_properties.embedded = False
    textures[texname] = EmbeddedTexture(texname,64,64,DataSource.create(dds,dds.name))
    for half in ['body','leaf']:
        name = f'peak_duo_screen_{half}_{slot:02d}'
        verts,faces,uvs = [],[],[]
        atlas_regions = {}
        for display_name, display in displays.items():
            if display['half'] != half: continue
            base = len(verts)
            verts.extend(display['vertices'])
            mapped = [live_screen_uv(display_name,u,v) for u,v in display['uvs']]
            region_u=[min(u for u,_ in mapped),max(u for u,_ in mapped)]
            expected={'bodyInner':[.25,.5],'leafInner':[0,.25],'cover':[.5,.75]}[display_name]
            assert max(abs(a-b) for a,b in zip(region_u,expected))<1e-7,(name,display_name,region_u,expected)
            atlas_regions[display_name]=region_u
            uvs.extend(mapped)
            faces.extend([[i+base for i in f] for f in display['faces']])
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts,[],faces)
        mesh.materials.append(material)
        uv = mesh.uv_layers.new(name='UVMap 0')
        for loop in mesh.loops: uv.data[loop.index].uv = uvs[loop.vertex_index]
        colors = mesh.color_attributes.new(name='Color 1',type='BYTE_COLOR',domain='CORNER')
        for color in colors.data: color.color = (1,1,1,1)
        obj = bpy.data.objects.new(name+'_mesh',mesh)
        bpy.context.scene.collection.objects.link(obj)
        root = bpy.data.objects.new(name,None)
        bpy.context.scene.collection.objects.link(root)
        root.sollum_type = SollumType.DRAWABLE
        root.drawable_properties.lod_dist_high = 30
        root.drawable_properties.lod_dist_med = 30
        root.drawable_properties.lod_dist_low = 30
        root.drawable_properties.lod_dist_vlow = 30
        convert_obj_to_model(obj)
        obj.parent = root
        for lod in [LODLevel.MEDIUM,LODLevel.LOW,LODLevel.VERYLOW]: obj.sz_lods.get_lod(lod).mesh = mesh
        with export_context_scope(ExportContext(name,settings)):
            bundle = export_ydr(root)
            assert bundle, name
            bundle.save(OUT,settings.targets)
        lo = [min(v[i] for v in verts) for i in range(3)]
        hi = [max(v[i] for v in verts) for i in range(3)]
        item = ET.SubElement(archetypes,'Item',type='CBaseArchetypeDef')
        for key,value in [('lodDist',30),('flags',32),('specialAttribute',0)]: ET.SubElement(item,key,value=str(value))
        for key,values in [('bbMin',lo),('bbMax',hi),('bsCentre',[(a+b)/2 for a,b in zip(lo,hi)])]:
            ET.SubElement(item,key,**dict(zip('xyz',map(str,values))))
        ET.SubElement(item,'bsRadius',value=str(math.dist(lo,hi)/2))
        ET.SubElement(item,'hdTextureDist',value='30')
        for key,value in [('name',name),('textureDictionary','peak_duo_live'),('clipDictionary',''),('drawableDictionary',''),('physicsDictionary',''),('assetType','ASSET_TYPE_DRAWABLE'),('assetName',name)]: ET.SubElement(item,key).text=value
        ET.SubElement(item,'extensions')
        atlas_u=[min(u for u, _ in uvs),max(u for u, _ in uvs)]
        report['models'].append(dict(name=name,triangles=len(faces),bounds=[lo,hi],texture=texname,
            atlasU=atlas_u,atlasRegions=atlas_regions))
        # Separate slots for a readable Blender source, without modifying geometry origins.
        root.location = ((slot-1)*.19,0,.14 if half=='leaf' else 0)
context = ExportContext('peak_duo_live',settings)
with export_context_scope(context):
    context.make_bundle(AssetTextureDictionary(textures=textures),extra_files=[t.data for t in textures.values()]).save(OUT,settings.targets)
ET.SubElement(yt,'name').text='peak_duo_live'
ET.SubElement(yt,'dependencies'); ET.SubElement(yt,'compositeEntityTypes')
ET.indent(yt)
ET.ElementTree(yt).write(OUT/'peak_duo_live.ytyp.xml',encoding='utf-8',xml_declaration=True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'source'/'peak-duo-live-screens.blend'))
(ROOT/'evidence'/'live-screens-authoring.json').write_text(json.dumps(report,indent=2))
print('LIVE_SCREEN_EXPORT',len(report['models']),'models')
