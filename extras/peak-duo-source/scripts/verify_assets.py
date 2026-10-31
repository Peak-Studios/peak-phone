"""Validate decoded binaries against authoring XML, textures, indices and bounds."""
from pathlib import Path
import xml.etree.ElementTree as E
import math,json,hashlib
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[1];rt=R/'evidence/roundtrip'
tx=E.parse(rt/'peak_duo.ytd.xml').getroot();textures={i.findtext('Name'):i for i in tx.findall('Item')}
assert set(textures)=={'iphone_duo_atlas','peak_duo_spec'}
for name,t in textures.items():
    assert int(t.find('MipLevels').get('value'))==1+int(math.log2(max(int(t.find('Width').get('value')),int(t.find('Height').get('value')))))
    # DDS decode may normalize header flags; compare pixel and mip bytes.
    original=(R/'source/textures'/(name+'.dds')).read_bytes()
    found=list(rt.rglob(name+'.dds'));assert found,name
    assert any(f.read_bytes()[128:]==original[128:] for f in found),name
inner=Image.open(R/'source/textures/peak_inner_lock_screen.png').convert('RGBA')
cover=Image.open(R/'source/textures/peak_lock_screen.png').convert('RGBA')
atlas=Image.open(R/'source/textures/iphone_duo_atlas.png').convert('RGBA')
inner_white=float(np.mean(np.all(np.asarray(inner)[:,:,:3]>=245,axis=2)))
cover_white=float(np.mean(np.all(np.asarray(cover)[:,:,:3]>=245,axis=2)))
assert inner.size==(384,256) and inner_white<0.001,('Inner fallback must be text-free for safe screen-plane rotation',inner.size,inner_white)
assert cover.size==(384,512) and cover_white>0.005,('Folded cover must retain its readable lock artwork',cover.size,cover_white)
assert np.array_equal(np.asarray(atlas.crop((256,512,640,768))),np.asarray(inner)), 'Static inner atlas tile differs from its orientation-neutral source'
report={'textures':list(textures),'missingTextures':[],'fallbackDisplays':{'inner':{'size':list(inner.size),'orientationSafe':True,'nearWhiteCoverage':inner_white},'cover':{'size':list(cover.size),'retainsLockArtwork':True,'nearWhiteCoverage':cover_white}},'models':{}}
for half in ['body','leaf']:
    name='peak_duo_'+half;doc=E.parse(rt/(name+'.ydr.xml')).getroot()
    original=E.parse(R/'intermediates'/(name+'.ydr.xml')).getroot()
    low=[float(doc.find('BoundingBoxMin').get(c)) for c in 'xyz'];high=[float(doc.find('BoundingBoxMax').get(c)) for c in 'xyz']
    shaders=doc.findall('./ShaderGroup/Shaders/Item')
    for item in doc.findall('.//Parameters/Item[@type="Texture"]'):assert item.findtext('Name') in textures,E.tostring(item)
    tri={};maxerror=0
    for lod in ['High','Medium','Low','VeryLow']:
        verts=0;indices=0
        geoms=doc.findall('./DrawableModels'+lod+'/Item/Geometries/Item');og=original.findall('./DrawableModels'+lod+'/Item/Geometries/Item')
        assert len(geoms)==len(og)>0
        for g,old in zip(geoms,og):
            assert 0<=int(g.find('ShaderIndex').get('value'))<len(shaders)
            rows=[list(map(float,l.split())) for l in g.findtext('./VertexBuffer/Data').strip().splitlines()]
            prior=[list(map(float,l.split())) for l in old.findtext('./VertexBuffer/Data').strip().splitlines()]
            assert len(rows)==len(prior)
            for v,p in zip(rows,prior):
                assert all(math.isfinite(n) for n in v)
                assert all(low[i]-1e-6<=v[i]<=high[i]+1e-6 for i in range(3))
                maxerror=max(maxerror,max(abs(v[i]-p[i]) for i in range(3)))
            idx=list(map(int,g.findtext('./IndexBuffer/Data').split()))
            assert len(idx)%3==0 and all(0<=i<len(rows) for i in idx)
            verts+=len(rows);indices+=len(idx)
        tri[lod]=indices//3
    assert maxerror<1e-6
    report['models'][name]={'triangles':tri,'maxRoundtripPositionErrorMetres':maxerror,'boundsContainAllLods':True}
archetypes=E.parse(rt/'peak_duo.ytyp.xml').findall('./archetypes/Item')
assert len(archetypes)==2
for a in archetypes:
    assert a.findtext('name')==a.findtext('assetName') and a.findtext('name') in report['models']
    assert a.findtext('textureDictionary')=='peak_duo'
    assert a.findtext('assetType')=='ASSET_TYPE_DRAWABLE'
    mn=[float(a.find('bbMin').get(c)) for c in 'xyz'];mx=[float(a.find('bbMax').get(c)) for c in 'xyz'];center=[float(a.find('bsCentre').get(c)) for c in 'xyz']
    radius=float(a.find('bsRadius').get('value'));assert math.dist(mn,center)<=radius+1e-7 and math.dist(mx,center)<=radius+1e-7
report['archetypes']=2
(R/'evidence/asset-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
