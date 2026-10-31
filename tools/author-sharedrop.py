"""Blender/Sollumz: bake 3.2s upper-body reaches against the existing phone grip.
Usage: blender --background --python tools/author-sharedrop.py -- male|female
Local game reference meshes are required and are never included in the output.
"""
from pathlib import Path
import os,sys,math,json,re
import bpy,addon_utils
from mathutils import Vector,Matrix,Quaternion,Euler
from bpy_extras import anim_utils
R=Path(__file__).resolve().parents[1]
# PEAK_TOOLCHAIN holds blender-addons/Sollumz and sollumz-python; PEAK_AUTHORING_REFERENCE holds local game reference exports.
T=Path(os.environ['PEAK_TOOLCHAIN'])
bpy.ops.wm.read_factory_settings(use_empty=True)
sys.path[:0]=[str(T/'blender-addons'),str(T/'sollumz-python')]
addon_utils.enable('Sollumz',default_set=True,persistent=False)
from szio import jenkhash
jenkhash.load_name_tables([],None)
from Sollumz.ycd.ycdimport import import_ycd,create_clip_dictionary_template,create_anim_obj
from Sollumz.ycd.ycdexport import export_ycd
from Sollumz.sollumz_properties import SollumType
sex=sys.argv[-1];assert sex in ('male','female')
ref=Path(os.environ['PEAK_AUTHORING_REFERENCE'])
bpy.ops.sollumz.import_assets(directory=str(ref/f'duo-{sex}-fit'),files=[{'name':'uppr_000_r.ydd.xml'}],use_custom_settings=True,dwd_import_external_skeleton='FROM_DIR')
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rig.name='ShareDrop_'+sex
stock=import_ycd(str(ref/'duo-phone-hold/cellphone@.ycd.xml'))
clip=next(o for o in stock.children_recursive if o.sollum_type==SollumType.CLIP and o.clip_properties.name.split('/')[-1]=='cellphone_text_read_base.clip')
anim=clip.clip_properties.animations[0].animation;anim.animation_properties.target_id=rig.data
rig.animation_data_create();rig.animation_data.action=anim.animation_properties.action;rig.animation_data.action_slot=anim.animation_properties.action.slots[0]
for p in rig.pose.bones:
 p.rotation_mode='QUATERNION'
 for c in list(p.constraints):p.constraints.remove(c)
f=clip.clip_properties.animations[0].start_frame
bpy.context.scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
base={p.name:p.matrix_basis.copy() for p in rig.pose.bones}
rig.animation_data_clear()
for o in list(stock.children_recursive)+[stock]:bpy.data.objects.remove(o,do_unlink=True)
rig.location=(0,0,0);rig.rotation_quaternion=Quaternion()
root,clips,animations=create_clip_dictionary_template('peak_sharedrop_'+sex)
scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=0;scene.frame_end=96
bpy.context.preferences.filepaths.save_version=0
upper=[p.name for p in rig.pose.bones if p.name.startswith(('SKEL_R_','SKEL_Spine','SKEL_Neck','SKEL_Head','PH_R_Hand','MH_R_')) and not any(x in p.name for x in ('Thigh','Calf','Foot','Toe','Knee'))]
def update():bpy.context.view_layer.update()
def smooth(t):t=max(0,min(1,t));return t*t*t*(t*(t*6-15)+10)
def point(name,child,target):
 p=rig.pose.bones[name];origin=p.head.copy();q=(rig.pose.bones[child].head-origin).rotation_difference(target-origin)@p.matrix.to_quaternion()
 p.matrix=Matrix.Translation(origin)@q.to_matrix().to_4x4();update()
report={'profile':sex,'duration':3.2,'clips':{},'qualification':'Blender baked and CodeWalker reloaded; two-client FiveM acceptance pending'}
config=(R/'shared/duo_prop.lua').read_text()
profile=re.search(sex+r'=\{Position=\{([^}]+)\},Rotation=\{([^}]+)\}',config)
position=tuple(float(v) for v in profile[1].split(','));angles=tuple(math.radians(float(v)) for v in profile[2].split(','))
attachment=Matrix.Translation(position)@Euler(angles,'ZXY').to_matrix().to_4x4()
for role in ('send','receive'):
 for p in rig.pose.bones:p.matrix_basis=base[p.name]
 update()
 hand=rig.pose.bones['SKEL_R_Hand'];initial=hand.head.copy();rotation=hand.matrix.to_quaternion()
 # Fit the top of each handset to the midline using the actual profile's
 # hand attachment, rather than assuming the wrist is the phone's origin.
 top_offset=rotation@(attachment@Vector((0,0,.054)))
 target=Vector((.012,.465,.42))-top_offset
 report['phoneTopOffset']=list(top_offset)
 report['contactPhoneTop']=[.012,.465,.42]
 report['idealPairGapMetres']=math.sqrt(.024**2+.02**2)
 frames=[];error=0
 for frame in range(97):
  for p in rig.pose.bones:p.matrix_basis=base[p.name]
  update()
  weight=smooth(frame/25) if frame<25 else 1 if frame<69 else 1-smooth((frame-69)/27)
  wrist=initial.lerp(target,weight)
  a,b,c=[rig.pose.bones['SKEL_R_'+n] for n in ('UpperArm','Forearm','Hand')]
  origin=a.head.copy();l1=(b.head-origin).length;l2=(c.head-b.head).length;d=wrist-origin;dist=d.length
  assert dist<l1+l2,('unreachable',sex,frame,dist,l1+l2)
  axis=d.normalized();along=(l1*l1-l2*l2+dist*dist)/(2*dist)
  pole=Vector((.35,.18,-.15));pole=(pole-axis*pole.dot(axis)).normalized()
  original=b.head-origin;original=(original-axis*original.dot(axis)).normalized()
  pole=Quaternion().slerp(original.rotation_difference(pole),weight)@original
  elbow=origin+axis*along+pole*math.sqrt(max(0,l1*l1-along*along))
  point(a.name,b.name,elbow);point(b.name,c.name,wrist)
  c.matrix=Matrix.Translation(wrist)@rotation.to_matrix().to_4x4();update()
  error=max(error,(c.head-wrist).length)
  values={}
  for name in upper:
   p=rig.pose.bones[name];q=p.rotation_quaternion.copy()
   if frames and q.dot(frames[-1][name][0])<0:q.negate()
   values[name]=(q,p.location.copy())
  frames.append(values)
 action=bpy.data.actions.new(f'peak_sharedrop_{sex}_{role}')
 slot=action.slots.new('OBJECT',rig.name);bag=anim_utils.action_ensure_channelbag_for_slot(action,slot)
 for name in upper:
  for prop,size,index in (('rotation_quaternion',4,0),('location',3,1)):
   for component in range(size):
    curve=bag.fcurves.new(f'pose.bones["{name}"].{prop}',index=component,group_name=name)
    curve.keyframe_points.add(97);curve.keyframe_points.foreach_set('co',[v for f in range(97) for v in (f,frames[f][name][index][component])])
    for k in curve.keyframe_points:k.interpolation='LINEAR'
    curve.update()
 ao=create_anim_obj(SollumType.ANIMATION);ao.name=action.name;ao.parent=animations
 ao.animation_properties.target_id=rig.data;ao.animation_properties.action=action;ao.animation_properties.hash=action.name
 co=create_anim_obj(SollumType.CLIP);co.name=action.name;co.parent=clips;co.clip_properties.hash=action.name;co.clip_properties.name=action.name;co.clip_properties.duration=3.2
 ca=co.clip_properties.animations.add();ca.animation=ao;ca.start_frame=0;ca.end_frame=96
 report['clips'][action.name]={'frames':97,'maxWristSolveError':error,'target':list(target),'rootMotion':False}
out=R/'extras/sharedrop-source';out.mkdir(parents=True,exist_ok=True)
assert export_ycd(root,str(out/f'peak_sharedrop_{sex}.ycd.xml'))
xml=out/f'peak_sharedrop_{sex}.ycd.xml'
xml.write_text('\n'.join(line.rstrip() for line in xml.read_text(encoding='utf-8').splitlines())+'\n',encoding='utf-8')
# Remove local game meshes before saving the reproducible animation source.
for obj in list(bpy.data.objects):
 if obj.type=='MESH':bpy.data.objects.remove(obj,do_unlink=True)
rig.animation_data_create();rig.animation_data.action=action;rig.animation_data.action_slot=slot
scene.frame_set(48)
bpy.ops.outliner.orphans_purge(do_recursive=True)
assert len(bpy.data.meshes)==0, 'Local game mesh data must not enter the source asset'
bpy.ops.wm.save_as_mainfile(filepath=str(out/f'peak_sharedrop_{sex}.blend'))
(out/f'{sex}-authoring.json').write_text(json.dumps(report,indent=2))
