"""Verify native shipped overlay geometry from CodeWalker-decoded RSC7 assets."""
from pathlib import Path
import hashlib
import json
import math
import sys
import argparse
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
RT = ROOT / 'evidence' / 'live-screens-roundtrip'
STREAM = ROOT.parents[1] / 'stream'
sys.path.insert(0, str(ROOT / 'scripts'))
from handset_geometry import GLASS_HEIGHT, glass

LODS = ['High','Medium','Low','VeryLow']

def verify_decoded_cover_topology(root, lod, cover, label):
    """Match decoded cover vertices and triangles to source despite index reorder."""
    expected_points = [(vertex[0],vertex[2]) for vertex in cover['vertices']]
    expected_triangles = {tuple(sorted(face)) for face in cover['faces']}
    point_ids = set()
    triangles = []
    geometries = root.findall(f'DrawableModels{lod}/Item/Geometries/Item')
    assert geometries, (label,lod,'missing geometry')
    for geom in geometries:
        verts = [[float(n) for n in row.split()] for row in geom.findtext('VertexBuffer/Data').strip().splitlines()]
        indices = [int(i) for i in geom.findtext('IndexBuffer/Data').split()]
        source_point = {}
        for index, vertex in enumerate(verts):
            x,y,z = vertex[:3]
            if y < -.003:
                point = (x,z)
                source_index = min(range(len(expected_points)), key=lambda i: math.dist(point,expected_points[i]))
                distance = math.dist(point,expected_points[source_index])
                assert distance <= 2e-5, (label,lod,'unexpected cover position',point,distance)
                source_point[index] = source_index
                point_ids.add(source_index)
        assert len(indices)%3 == 0
        for offset in range(0,len(indices),3):
            face = indices[offset:offset+3]
            if all(index in source_point for index in face):
                triangles.append(tuple(sorted(source_point[index] for index in face)))
    assert point_ids == set(range(len(expected_points))), (label,lod,'cover point set differs',point_ids)
    assert len(triangles) == len(expected_triangles), (label,lod,'cover triangle count differs',len(triangles),len(expected_triangles))
    assert set(triangles) == expected_triangles, (label,lod,'cover topology differs from handset_geometry.glass')
    return len(expected_points)-1

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--probe-cover-file', help='Check one decoded YDR XML file against current handset geometry, for stale-asset regression probes.')
args = parser.parse_args()

records = json.loads((ROOT/'evidence'/'live-screens-binaries.json').read_text(encoding='utf-8-sig'))
assert len(records) == 34
for record in records:
    binary = STREAM / record['file']
    assert binary.is_file(), record['file']
    assert hashlib.sha256(binary.read_bytes()).hexdigest() == record['sha256'], record['file']

txd = ET.parse(RT/'peak_duo_live.ytd.xml').getroot()
assert {item.findtext('Name') for item in txd} == {f'peak_duo_live_{i:02d}' for i in range(1,17)}
assert all(item.find('MipLevels').get('value') == '7' for item in txd)
archetypes = ET.parse(RT/'peak_duo_live.ytyp.xml').getroot().findall('archetypes/Item')
assert len(archetypes) == 32
assert all(item.findtext('textureDictionary') == 'peak_duo_live' for item in archetypes)
expected = {f'peak_duo_screen_{half}_{slot:02d}' for slot in range(1,17) for half in ['body','leaf']}
assert {item.findtext('name') for item in archetypes} == expected

cover = glass('leaf', True)
cover_xz = {(x, z) for x, _y, z in cover['vertices'][1:]}
cover_xmin = min(x for x, _z in cover_xz)
cover_xmax = max(x for x, _z in cover_xz)
cover_zmin = min(z for _x, z in cover_xz)
cover_zmax = max(z for _x, z in cover_xz)
assert cover_xmax > cover_xmin and cover_zmax > cover_zmin
if args.probe_cover_file:
    probe = ET.parse(args.probe_cover_file).getroot()
    checks = {lod: verify_decoded_cover_topology(probe,lod,cover,args.probe_cover_file) for lod in LODS}
    print(json.dumps({'decodedCoverMatchesHandsetGeometry':True,'lods':checks},indent=2))
    raise SystemExit(0)
report = {
    'models': 32,
    'textures': 16,
    'binaryHashesVerified': 34,
    'lodsChecked': 0,
    'trianglesChecked': 0,
    'coverBoundaryCheckedLods': 0,
    'normalsAndWinding': True,
    'atlasUVs': True,
    'independentSlotTextures': True,
    'collisionAbsent': True,
    'boundary': 'Decoded CodeWalker RSC7 roundtrip and stream hashes verified; FiveM CEF visual validation remains necessary.',
}
seams = {'body': [], 'leaf': []}

for name in sorted(expected):
    root = ET.parse(RT/(name+'.ydr.xml')).getroot()
    half = 'body' if '_body_' in name else 'leaf'
    slot = int(name[-2:])
    assert root.find('Bounds') is None
    shaders = root.findall('ShaderGroup/Shaders/Item')
    assert len(shaders) == 1 and shaders[0].findtext('FileName') == 'emissive.sps'
    assert shaders[0].findtext("Parameters/Item[@name='DiffuseSampler']/Name") == f'peak_duo_live_{slot:02d}'
    for lod in LODS:
        report['lodsChecked'] += 1
        geometries = root.findall(f'DrawableModels{lod}/Item/Geometries/Item')
        assert geometries
        for geom in geometries:
            verts = [[float(n) for n in row.split()] for row in geom.findtext('VertexBuffer/Data').strip().splitlines()]
            assert all(len(v)==12 and all(math.isfinite(n) for n in v) for v in verts)
            for v in verts:
                x,y,z,nx,ny,nz,*rest = v
                u,vcoord = rest[-2:]
                is_cover = y < -.003
                if is_cover:
                    assert half == 'leaf' and ny < -.99
                    expected_u = .5 + .25*(x-cover_xmin)/(cover_xmax-cover_xmin)
                else:
                    assert ny > .99
                    if abs(x-(.0391875 if half=='body' else 0))<1e-7:
                        assert abs(u-.25)<1e-7
                        seams[half].append((y,z,vcoord))
                    if half == 'body':
                        lo,hi = -.0372,.0391875
                        expected_u = .5-.25*(x-lo)/(hi-lo)
                    else:
                        lo,hi = 0,.0763875
                        expected_u = .25-.25*(x-lo)/(hi-lo)
                assert abs(u-expected_u)<.00002, (name,u,expected_u)
                assert abs(vcoord-(1-(z+GLASS_HEIGHT/2)/GLASS_HEIGHT))<.00002
            indices = [int(i) for i in geom.findtext('IndexBuffer/Data').split()]
            assert len(indices)%3 == 0
            for i in range(0,len(indices),3):
                a,b,c = [verts[j] for j in indices[i:i+3]]
                normal_y = (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])
                assert normal_y*a[4] > 0, (name,i,'winding')
                report['trianglesChecked'] += 1
        if half == 'leaf':
            boundary_count = verify_decoded_cover_topology(root,lod,cover,name)
            assert boundary_count == len(cover_xz)
            report['coverBoundaryCheckedLods'] += 1

assert seams['body'] and seams['leaf']
for axis in range(3):
    assert abs(min(p[axis] for p in seams['body'])-min(p[axis] for p in seams['leaf']))<1e-7
    assert abs(max(p[axis] for p in seams['body'])-max(p[axis] for p in seams['leaf']))<1e-7
assert report['lodsChecked'] == 128
assert report['coverBoundaryCheckedLods'] == 64
report['continuousHingeGeometryAndUVs'] = True
report['decodedCoverMatchesHandsetGeometry'] = True
report['coverBoundaryPointsPerLod'] = len(cover_xz)
report['coverTrianglesPerLod'] = len(cover['faces'])
report['coverBoundaryMetres'] = {'x': [cover_xmin,cover_xmax], 'z': [cover_zmin,cover_zmax]}
report['atlasResolution'] = [2048,1024]
report['poseRegions'] = {'inner':[0,.5],'cover':[.5,.75],'unused':[.75,1]}
(ROOT/'evidence'/'live-screens-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
