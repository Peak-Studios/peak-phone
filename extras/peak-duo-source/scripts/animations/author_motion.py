"""Author separate SIM clips; reference bootstrap is local-only, never distributed."""
from pathlib import Path
import sys,json,math
import bpy,addon_utils
from mathutils import Matrix,Vector,Quaternion,Euler
from mathutils.bvhtree import BVHTree
import os
R=Path(os.environ['PEAK_ANIMATION_OUTPUT']);W=Path(os.environ['PEAK_AUTHORING_WORKSPACE']);T=W/'peak-map-settings/artifacts/toolchain'
sys.path[:0]=[str(T/'blender-addons'),str(T/'sollumz-python')];addon_utils.enable('Sollumz',default_set=True,persistent=False)
from szio import jenkhash
jenkhash.load_name_tables([],None)
from Sollumz.ycd.ycdimport import create_clip_dictionary_template,create_anim_obj
from Sollumz.ycd.ycdexport import export_ycd
from Sollumz.sollumz_properties import SollumType
from bpy_extras import anim_utils
sex=sys.argv[-1];assert sex in ('male','female')
bpy.ops.wm.open_mainfile(filepath=str(W/f'peak-duo-correction/source/hand-{sex}-local.blend'))
scene=bpy.context.scene;scene.frame_set(76);bpy.context.view_layer.update()
rig=bpy.data.objects['fit_'+sex];skin=bpy.data.objects['SKEL_ROOT'];body=bpy.data.objects['peak_duo_body'];leaf=bpy.data.objects['peak_duo_leaf']
# Use the current public handset geometry for motion clearance checks.
with bpy.data.libraries.load(str(Path(__file__).resolve().parents[2]/'source/peak-duo-iphone.blend'),link=False) as (data_from,data_to):
 data_to.objects=['body_HIGH.001','leaf_HIGH.001']
for parent,imported in zip((body,leaf),data_to.objects):
 mesh=next(child for child in parent.children if child.type=='MESH')
 mesh.data=imported.data.copy()
 bpy.data.objects.remove(imported,do_unlink=True)
oldphone=body.matrix_world.copy();base={p.name:p.matrix_basis.copy() for p in rig.pose.bones}
for o in (rig,body,leaf):o.animation_data_clear()
# Remove old clip objects, retain only the fitted rig and phone geometry.
for o in list(bpy.data.objects):
 if o.sollum_type in (SollumType.CLIP_DICTIONARY,SollumType.CLIPS,SollumType.ANIMATIONS,SollumType.CLIP,SollumType.ANIMATION):bpy.data.objects.remove(o,do_unlink=True)
for p in rig.pose.bones:
 p.rotation_mode='QUATERNION'
 for c in list(p.constraints):p.constraints.remove(c)
source=Path(__file__).with_name('rig_reference.py').read_text()
solver=source[source.index('def smooth('):source.index('def tree(')]
# A continuous pole is preferable to discrete per-frame safe-pole searches.
# Mesh validation below must assess the resulting complete path.
solver=solver[:solver.index('    if blend>.00001 and not outside(pole):')]+solver[solver.index('    elbow=shoulder+axis*along+pole*radius'):]
solver=solver.replace("pole=Vector((-.25 if side=='L' else .25,.23,.10))-shoulder", "pole=wrist-rotation@Vector((l2,0,0))-shoulder")
exec(solver)
fit=json.loads((R/f'evidence/grip-rotation-{sex}.json').read_text())
phone=rig.pose.bones['SKEL_R_Hand'].matrix@Matrix.Translation(fit['attachment']['position'])@Euler(tuple(math.radians(v) for v in fit['attachment']['rotation']),'ZXY').to_matrix().to_4x4()
right_relative=rig.pose.bones['SKEL_R_Hand'].matrix.inverted()@phone
operating_attachment=right_relative.copy()
center=Matrix.Translation((0,.42,.50))@Matrix.Rotation(math.pi,4,'Z')
dock=Matrix.Translation((.024,0,-.048))
root,clips,animations=create_clip_dictionary_template('peak_sim_'+sex)
upper=[p.name for p in rig.pose.bones if p.name.startswith(('SKEL_L_','SKEL_R_','SKEL_Spine','SKEL_Neck','SKEL_Head','PH_R_Hand','PH_L_Hand','MH_L_','MH_R_')) and not any(x in p.name for x in ('Thigh','Calf','Foot','Toe','Knee'))]
scene.render.fps=60;scene.frame_start=0;scene.frame_end=180
report={'sex':sex,'duration':3.0,'attachment':fit['attachment'],'clips':{},'status':'candidate - requires mesh and game validation'}
# Pre-solve a thumb/index pinch in bone space. Other fingers retain a relaxed curl.
reset();lh=rig.pose.bones['SKEL_L_Hand'];local_hand=lh.matrix.copy()
index=rig.pose.bones['SKEL_L_Finger12'];thumb=rig.pose.bones['SKEL_L_Finger02']
# Imported terminal-bone tails are display lengths, not anatomical fingertip pads.
# Derive contact markers from the actual weighted reference skin instead.
evaluated=skin.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();markers={}
for pb in (index,thumb):
 group=skin.vertex_groups[pb.name].index
 points=[skin.matrix_world@mesh.vertices[v.index].co for v in skin.data.vertices if any(g.group==group and g.weight>.7 for g in v.groups)]
 assert points,pb.name
 centre=sum(points,Vector())/len(points);markers[pb.name]=pb.matrix.inverted()@centre
evaluated.to_mesh_clear()
def pad(pb):return pb.matrix@markers[pb.name]
pinch_center=pad(index).lerp(pad(thumb),.85)
pinch_axis=(pad(index)-pad(thumb)).normalized()
for digit,sign in ((1,1),(0,-1)):
 target=pinch_center+pinch_axis*.012*sign
 for iteration in range(32):
  for j in (2,1,0):
   pb=rig.pose.bones[f'SKEL_L_Finger{digit}{j}'];tip=pad(rig.pose.bones[f'SKEL_L_Finger{digit}2'])
   delta=(tip-pb.head).rotation_difference(target-pb.head)
   if delta.angle>.15:delta=Quaternion().slerp(delta,.15/delta.angle)
   pb.matrix=Matrix.Translation(pb.head)@(delta@pb.matrix.to_quaternion()).to_matrix().to_4x4();update()
pinch={p.name:p.rotation_quaternion.copy() for p in rig.pose.bones if p.name.startswith(('SKEL_L_Finger0','SKEL_L_Finger1'))}
print('PINCH_RESIDUAL',[(p.name,(pad(p)-pinch_center).length) for p in (index,thumb)],flush=True)
across=(rig.pose.bones['SKEL_L_Finger40'].head-rig.pose.bones['SKEL_L_Finger10'].head).normalized()
forward=(pinch_center-lh.head).normalized();normal=across.cross(forward).normalized()
if (pad(index)-rig.pose.bones['SKEL_L_Finger10'].head).dot(normal)<0:normal=-normal
curlaxis=across if across.cross(forward).dot(normal)>0 else -across
for digit in (2,3,4):
 target=rig.pose.bones[f'SKEL_L_Finger{digit}0'].head-forward*.020+normal*.020
 angles=[0.,0.,0.]
 for iteration in range(35):
  for j in (2,1,0):
   pb=rig.pose.bones[f'SKEL_L_Finger{digit}{j}'];tip=rig.pose.bones[f'SKEL_L_Finger{digit}2'].tail
   a=tip-pb.head;b=target-pb.head;a-=curlaxis*a.dot(curlaxis);b-=curlaxis*b.dot(curlaxis)
   delta=math.atan2(curlaxis.dot(a.cross(b)),a.dot(b));delta=max(-.15,min(.15,delta))
   new=max(0,min(math.radians((65,100,65)[j]),angles[j]+delta));delta=new-angles[j];angles[j]=new
   pb.matrix=Matrix.Translation(pb.head)@(Quaternion(curlaxis,delta)@pb.matrix.to_quaternion()).to_matrix().to_4x4();update()
 for j in range(3):
  name=f'SKEL_L_Finger{digit}{j}';pinch[name]=rig.pose.bones[name].rotation_quaternion.copy()
pinch_local=lh.matrix.inverted()@pinch_center
pinch_y=(lh.matrix.to_3x3().inverted()@pinch_axis).normalized()
pinch_z=(pinch_local-pinch_y*pinch_local.dot(pinch_y)).normalized()
pinch_x=pinch_y.cross(pinch_z).normalized()
pinch_frame=Matrix((pinch_x,pinch_y,pinch_z)).transposed()
for n,q in pinch.items():rig.pose.bones[n].rotation_quaternion=q
update();ev=skin.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles()
groups={g.index for g in skin.vertex_groups if g.name.startswith(('SKEL_L_Hand','SKEL_L_Finger'))}
ids={v.index for v in skin.data.vertices if any(g.group in groups and g.weight>.4 for g in v.groups)}
hand_points=[lh.matrix.inverted()@(skin.matrix_world@v.co) for v in me.vertices]
hand_tris=[tuple(t.vertices) for t in me.loop_triangles if all(i in ids for i in t.vertices)];ev.to_mesh_clear()
phone_trees=[]
for parent,matrices in ((body,[Matrix.Identity(4)]),(leaf,[Matrix.Translation((.0391875,0,0))@Matrix.Rotation(a,4,'Z') for a in (0,math.pi)])):
 obj=next(o for o in parent.children if o.type=='MESH');obj.data.calc_loop_triangles()
 for mx in matrices:phone_trees.append(BVHTree.FromPolygons([mx@v.co for v in obj.data.vertices],[tuple(t.vertices) for t in obj.data.loop_triangles],all_triangles=True))
ev=skin.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles()
groups={g.index for g in skin.vertex_groups if g.name.startswith(('SKEL_R_Hand','SKEL_R_Finger'))}
ids={v.index for v in skin.data.vertices if any(g.group in groups and g.weight>.4 for g in v.groups)}
right_hand_tree=BVHTree.FromPolygons([oldphone.inverted()@(skin.matrix_world@v.co) for v in me.vertices],[tuple(t.vertices) for t in me.loop_triangles if all(i in ids for i in t.vertices)],all_triangles=True);ev.to_mesh_clear()
contact_clearance=Vector((-.028,-.010,-.026))
def clear_hand(q,phone_matrix):
 relative=phone_matrix.to_quaternion().inverted()@q
 for travel in (0,.011,.022):
  offset=dock@Vector((0,0,-.01695-travel))-relative@pinch_local+phone_matrix.to_quaternion().inverted()@contact_clearance
  tree=BVHTree.FromPolygons([offset+relative@v for v in hand_points],hand_tris,all_triangles=True)
  if any(tree.overlap(t) for t in phone_trees) or tree.overlap(right_hand_tree):return False
 return True
pinch_basis=Matrix.Rotation(math.pi/2,3,'Z')
# This reproducible candidate clears phone geometry. Full arm/arm and tray
# contact gates are evaluated separately and must not be treated as passing.
report['dock']={'edge':'bottom','along':.024,'position':list(dock.translation),'rotation':[0,0,0]}
reset()
shoulder=rig.pose.bones['SKEL_L_UpperArm'].head.copy()
elbow=rig.pose.bones['SKEL_L_Forearm'].head.copy();wrist0=rig.pose.bones['SKEL_L_Hand'].head.copy()
l1=(elbow-shoulder).length;l2=(wrist0-elbow).length;choices=[]
def limb_cost(side,w,q):
 a=rig.pose.bones[f'SKEL_{side}_UpperArm'].head;b=rig.pose.bones[f'SKEL_{side}_Forearm'].head;c=rig.pose.bones[f'SKEL_{side}_Hand'].head
 u=(b-a).length;v=(c-b).length;d=w-a;n=d.length
 if not .01<n<u+v-.004:return 10000
 axis=d.normalized();along=(u*u-v*v+n*n)/(2*n);pole=w-q@Vector((v,0,0))-a;pole=(pole-axis*pole.dot(axis)).normalized()
 e=a+axis*along+pole*math.sqrt(max(0,u*u-along*along));bend=math.degrees((w-e).angle(q@Vector((1,0,0))))
 cost=bend
 if (side=='L' and e.x>-.09) or (side=='R' and e.x<.09):cost+=500
 for j in range(7):
  p=e.lerp(w,j/6);value=((p.x+.015)/.19)**2+((p.y-.035)/.155)**2+((p.z-.23)/.24)**2
  if value<1.2:cost+=500
 return cost
best_pose=None
for px in (-.06,.02,.10):
 for py in (.36,.44,.52):
  for pz in (.38,.46,.54):
   for yaw in (120,150,180,210,240):
    for pitch in (-30,0,30):
     candidate=Matrix.Translation((px,py,pz))@Matrix.Rotation(math.radians(yaw),4,'Z')@Matrix.Rotation(math.radians(pitch),4,'X')
     rw=candidate@operating_attachment.inverted();rc=limb_cost('R',rw.translation,rw.to_quaternion())
     if rc>80:continue
     for roll in range(-180,180,12):
      q=(candidate.to_3x3()@dock.to_3x3()@pinch_basis@Matrix.Rotation(math.radians(roll),3,'Y')@pinch_frame.inverted()).to_quaternion()
      w=candidate@dock@Vector((0,0,-.02795))-q@pinch_local;lc=limb_cost('L',w,q)
      score=max(rc,lc)+.05*(rc+lc)
      if score<80 and (best_pose is None or score<best_pose[0]) and clear_hand(q,candidate):best_pose=(score,candidate.copy(),rc,lc)
assert best_pose is not None,'No reachable bimanual phone presentation'
center=best_pose[1]
report['presentation']={'position':list(center.translation),'rotation':[math.degrees(v) for v in center.to_euler('ZXY')],'rightCost':best_pose[2],'leftCost':best_pose[3]}
for degrees in range(-180,181,3):
 q=(center.to_3x3()@dock.to_3x3()@pinch_basis@Matrix.Rotation(math.radians(degrees),3,'Y')@pinch_frame.inverted()).to_quaternion()
 contact=center@dock@Vector((0,0,-.02795));w=contact-q@pinch_local;d=w-shoulder;dist=d.length
 if not .01<dist<l1+l2-.002:continue
 axis=d.normalized();along=(l1*l1-l2*l2+dist*dist)/(2*dist);pole=w-q@Vector((l2,0,0))-shoulder;pole=(pole-axis*pole.dot(axis)).normalized()
 e=shoulder+axis*along+pole*math.sqrt(max(0,l1*l1-along*along))
 bend=math.degrees((w-e).angle(q@Vector((1,0,0))))
 penalty=0
 for j in range(11):
  v=e.lerp(w,j/10);value=((v.x+.015)/.19)**2+((v.y-.035)/.155)**2+((v.z-.23)/.24)**2
  if value<1.1:penalty+=100
 if clear_hand(q,center):choices.append((penalty+bend,degrees,bend))
assert choices,'No feasible pinch wrist orientation'
_,pinch_roll,pinch_bend=min(choices)
pinch_relative=pinch_frame@Matrix.Rotation(-math.radians(pinch_roll),3,'Y')@pinch_basis.inverted()
contact_rotation=(center.to_3x3()@dock.to_3x3()@pinch_relative.inverted()).to_quaternion()
report['pinchBoneTargetsGap']=.024
report['pinchRollDegrees']=pinch_roll;report['predictedContactWristDegrees']=pinch_bend
report['trayHandAttachment']={'bone':18905,'position':list(pinch_local+pinch_relative@Vector((0,0,.035))),'rotation':[math.degrees(v) for v in pinch_relative.to_euler('ZXY')]}
report['pinchLocal']=list(pinch_local)
report['attachmentFrames']=[]
reset()
for expanded in (False,True):
 for inserting in (True,False):
  transport={};pole_history={};baked=[];prop_frames=[];previous={};maxstep=0;contact_bends=[]
  name=f'peak_sim_{sex}_'+('insert' if inserting else 'remove')+('_open' if expanded else '_closed')
  for frame in range(181):
   reset();t=frame/60
   # Slow preparation, deliberate linear seat/extract stroke, relaxed release.
   reach=smooth(t/.8)*smooth((3-t)/.7)
   desired=Matrix.LocRotScale(phone.translation.lerp(center.translation,reach),phone.to_quaternion().slerp(center.to_quaternion(),reach),Vector((1,1,1)))
   grip=Matrix.LocRotScale(right_relative.translation.lerp(operating_attachment.translation,reach),right_relative.to_quaternion().slerp(operating_attachment.to_quaternion(),reach),Vector((1,1,1)))
   right=desired@grip.inverted();arm(right.translation,right.to_quaternion(),'R',reach)
   body.matrix_world=rig.pose.bones['SKEL_R_Hand'].matrix@grip
   if not expanded and inserting:report['attachmentFrames'].append({'position':list(grip.translation),'rotation':[math.degrees(v) for v in grip.to_euler('ZXY')]})
   leaf.matrix_world=body.matrix_world@Matrix.Translation((.0391875,0,0))@Matrix.Rotation(0 if expanded else math.pi,4,'Z')
   stroke=smooth((t-1.15)/.75);travel=.022*((1-stroke) if inserting else stroke)
   # The manipulator remains below the fixed half, outside both hinge states.
   contact=center@dock@Vector((0,0,-.01695-travel))
   rotation=contact_rotation
   # Wrist-to-index-pad offset measured in the local fitting skeleton.
   hand=rig.pose.bones['SKEL_L_Hand'];start=hand.head.copy();startrot=hand.matrix.to_quaternion()
   # Keep a small visual air gap between the working fingertips and the
   # supporting palm.  The GTA skin has thicker weighted finger volumes than
   # the fitted contact markers, so literal surface coincidence self-intersects.
   wrist=contact-rotation@pinch_local+contact_clearance
   target=start.lerp(wrist,reach);target.x-=.15*math.sin(math.pi*reach)**2
   target.y+=.07*math.sin(math.pi*reach)**2
   arm(target,startrot.slerp(rotation,reach),'L',reach)
   for n,q in pinch.items():rig.pose.bones[n].rotation_quaternion=base[n].to_quaternion().slerp(q,reach)
   # Modest pinch preparation; keep finger rotations continuous.
   update();data={}
   if reach>.999:
    fore=rig.pose.bones['SKEL_L_Hand'].head-rig.pose.bones['SKEL_L_Forearm'].head
    ax=rig.pose.bones['SKEL_L_Hand'].matrix.to_3x3()@Vector((1,0,0));contact_bends.append(math.degrees(fore.angle(ax)))
   for n in upper:
    p=rig.pose.bones[n];q=p.rotation_quaternion.copy()
    if n in previous:
     if q.dot(previous[n])<0:q.negate()
     if n.endswith(('UpperArm','Forearm','Hand')):maxstep=max(maxstep,math.degrees(q.rotation_difference(previous[n]).angle))
    previous[n]=q.copy();data[n]=(q,p.location.copy())
   baked.append(data);prop_frames.append((body.matrix_world.copy(),leaf.matrix_world.copy()))
  action=bpy.data.actions.new(name);slot=action.slots.new('OBJECT',rig.name);bag=anim_utils.action_ensure_channelbag_for_slot(action,slot)
  for n in upper:
   for prop,size,idx in [('rotation_quaternion',4,0),('location',3,1)]:
    for component in range(size):
     fc=bag.fcurves.new(f'pose.bones["{n}"].{prop}',index=component,group_name=n);fc.keyframe_points.add(181)
     fc.keyframe_points.foreach_set('co',[v for f in range(181) for v in (f,baked[f][n][idx][component])])
     for k in fc.keyframe_points:k.interpolation='LINEAR'
     fc.update()
  rig.animation_data_create();rig.animation_data.action=action;rig.animation_data.action_slot=slot
  for f,(bm,lm) in enumerate(prop_frames):
   for obj,matrix in ((body,bm),(leaf,lm)):
    obj.matrix_world=matrix;obj.keyframe_insert('location',frame=f);obj.keyframe_insert('rotation_euler',frame=f)
  ao=create_anim_obj(SollumType.ANIMATION);ao.name=name;ao.parent=animations;ao.animation_properties.target_id=rig.data;ao.animation_properties.action=action;ao.animation_properties.hash=name
  co=create_anim_obj(SollumType.CLIP);co.name=name;co.parent=clips;co.clip_properties.hash=name;co.clip_properties.name=name;co.clip_properties.duration=3
  ca=co.clip_properties.animations.add();ca.animation=ao;ca.start_frame=0;ca.end_frame=180
  report['clips'][name]={'frames':181,'maxBoneStepDegrees60Hz':maxstep,'solvedWristMax':max(contact_bends)}
  rig.animation_data_clear();body.animation_data_clear();leaf.animation_data_clear()
assert export_ycd(root,str(R/f'intermediates/peak_sim_{sex}.ycd.xml'))
rig.animation_data_create();rig.animation_data.action=action;rig.animation_data.action_slot=slot
bpy.ops.wm.save_as_mainfile(filepath=str(R/f'source/sim-{sex}-local.blend'))
(R/f'evidence/motion-{sex}.json').write_text(json.dumps(report,indent=2));print('SIM_MOTION',json.dumps(report))
