"""Author original fold/unfold clips against private local freemode fit meshes.
The local fitting .blend contains game references and is not a release asset.
"""
from pathlib import Path
import sys,json,math
import bpy,addon_utils
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
import os
R=Path(os.environ['PEAK_ANIMATION_OUTPUT']);W=Path(os.environ['PEAK_AUTHORING_WORKSPACE']);T=W/'peak-map-settings/artifacts/toolchain'
sys.path[:0]=[str(T/'blender-addons'),str(T/'sollumz-python')]
addon_utils.enable('Sollumz',default_set=True,persistent=False)
from szio import jenkhash
jenkhash.load_name_tables([],None)
from Sollumz.ycd.ycdimport import import_ycd,create_clip_dictionary_template,create_anim_obj
from Sollumz.ycd.ycdexport import export_ycd
from Sollumz.sollumz_properties import SollumType
from Sollumz.tools.animationhelper import action_fcurves
ref=W/'peak-map-settings/artifacts/authoring-local/reference'
sex=sys.argv[-1] if sys.argv[-1] in ('male','female') else 'male'
bpy.ops.wm.open_mainfile(filepath=str(Path(__file__).resolve().parents[2]/'source/peak-duo-iphone.blend'))
body=bpy.data.objects['peak_duo_body'];leaf=bpy.data.objects['peak_duo_leaf'];leaf.animation_data_clear()
before=set(bpy.data.objects)
bpy.ops.sollumz.import_assets(directory=str(ref/f'duo-{sex}-fit'),files=[{'name':'uppr_000_r.ydd.xml'}],use_custom_settings=True,dwd_import_external_skeleton='FROM_DIR')
rig=next(o for o in bpy.data.objects if o not in before and o.type=='ARMATURE');rig.name='fit_'+sex
skin=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
stock=import_ycd(str(ref/'duo-phone-hold/cellphone@.ycd.xml'))
clip=next(o for o in stock.children_recursive if o.sollum_type==SollumType.CLIP and o.clip_properties.name.split('/')[-1]=='cellphone_text_read_base.clip')
anim=clip.clip_properties.animations[0].animation;anim.animation_properties.target_id=rig.data
rig.animation_data_create();rig.animation_data.action=anim.animation_properties.action;rig.animation_data.action_slot=anim.animation_properties.action.slots[0]
for p in rig.pose.bones:
    p.rotation_mode='QUATERNION'
    for c in list(p.constraints):p.constraints.remove(c)
hold_start=clip.clip_properties.animations[0].start_frame
bpy.context.scene.frame_set(int(hold_start),subframe=hold_start%1);bpy.context.view_layer.update()
print('STOCK_HOLD',clip.clip_properties.name,'start frame',hold_start)
base={p.name:p.matrix_basis.copy() for p in rig.pose.bones}
rig.animation_data_clear()
rig.delta_location=(0,0,0);rig.delta_rotation_quaternion=Quaternion();rig.location=(0,0,0);rig.rotation_quaternion=Quaternion()
update_scene=bpy.context.view_layer.update()
# The stock cellphone clip leaves the left chain unkeyed. Its imported bind
# pose is not the relaxed arm-down pose used by the game's base locomotion.
shoulder=rig.pose.bones['SKEL_L_UpperArm']
hand=rig.pose.bones['SKEL_L_Hand']
delta=(hand.head-shoulder.head).rotation_difference(Vector((-.025,.045,-.532)))
shoulder.matrix=Matrix.Translation(shoulder.head)@(delta@shoulder.matrix.to_quaternion()).to_matrix().to_4x4()
bpy.context.view_layer.update()
base={p.name:p.matrix_basis.copy() for p in rig.pose.bones}
for o in list(stock.children_recursive)+[stock]:bpy.data.objects.remove(o,do_unlink=True)
# The existing configured attachment: PH_R_Hand (28422), Z rotation 180.
attachment=Matrix.Translation((-.015,-.030,.015))@Matrix.Rotation(math.pi,4,'Z')@Matrix.Rotation(math.radians(-20),4,'Y')
phone=rig.pose.bones['PH_R_Hand'].matrix @ attachment
body.matrix_world=phone
hinge=phone @ Matrix.Translation((.0391875,0,0))
scene=bpy.context.scene;scene.render.fps=100;scene.frame_start=0;scene.frame_end=76
root,clips,animations=create_clip_dictionary_template('peak_duo_hand_'+sex)
left=['SKEL_L_UpperArm','SKEL_L_Forearm','SKEL_L_Hand']
fingers=[p.name for p in rig.pose.bones if p.name.startswith('SKEL_L_Finger')]
# Constant reference hold channels stabilize the prop while our upper-body
# secondary task runs; pelvis/legs/root motion are not exported.
upper=[p.name for p in rig.pose.bones if p.name.startswith(('SKEL_L_','SKEL_R_','SKEL_Spine','SKEL_Neck','SKEL_Head','PH_R_Hand','PH_L_Hand','MH_L_','MH_R_')) and not any(x in p.name for x in ('Thigh','Calf','Foot','Toe','Knee'))]
def smooth(x):x=max(0,min(1,x));return x*x*x*(x*(6*x-15)+10)
def update():bpy.context.view_layer.update()
def reset():
    for p in rig.pose.bones:p.matrix_basis=base[p.name]
    update()
def align(name,child,target,blend):
    p=rig.pose.bones[name];origin=p.head.copy();direction=rig.pose.bones[child].head-origin
    localdir=p.matrix.to_quaternion().inverted()@direction
    prior=transport.get(name,p.matrix.to_quaternion())
    q=(prior@localdir).rotation_difference(target-origin)@prior
    reference=direction.rotation_difference(target-origin)@p.matrix.to_quaternion()
    q=reference
    transport[name]=q.copy()
    p.matrix=Matrix.Translation(origin)@q.to_matrix().to_4x4()
    update()
def arm(wrist,rotation,side='L',blend=1):
    chain=[f'SKEL_{side}_'+n for n in ('UpperArm','Forearm','Hand')]
    a,b,c=[rig.pose.bones[n] for n in chain];shoulder=a.head.copy()
    l1=(b.head-shoulder).length;l2=(c.head-b.head).length
    d=wrist-shoulder;dist=d.length;axis=d.normalized()
    if dist>l1+l2+1e-5:raise RuntimeError(f'{sex} frame {frame} side {side} unreachable wrist {dist:.4f} > {l1+l2:.4f}')
    along=(l1*l1-l2*l2+dist*dist)/(2*dist)
    # Choose the feasible elbow on the two-bone circle nearest a straight
    # wrist, rather than a fixed elbow pole that forces a ninety-degree bend.
    # Keep each elbow on its own side, in front of the torso. A wrist-derived
    # pole can select the inside solution and push the elbow through the chest.
    pole=Vector((-.25 if side=='L' else .25,.23,.10))-shoulder
    pole=(pole-axis*pole.dot(axis)).normalized()
    original=b.head-shoulder;original=(original-axis*original.dot(axis)).normalized()
    pole=Quaternion().slerp(original.rotation_difference(pole),blend)@original
    if side in pole_history and blend>.00001:
        prior=pole_history[side];prior=(prior-axis*prior.dot(axis)).normalized()
        delta=prior.angle(pole)
        if delta>math.radians(20):
            pole=Quaternion().slerp(prior.rotation_difference(pole),math.radians(20)/delta)@prior
    pole_history[side]=pole.copy()
    radius=math.sqrt(max(0,l1*l1-along*along))
    def outside(candidate):
        e=shoulder+axis*along+candidate*radius
        for step in range(11):
            point=e.lerp(wrist,step/10)
            value=((point.x+.015)/.19)**2+((point.y-.035)/.155)**2+((point.z-.23)/.24)**2
            if value<1.12:return False
        return True
    if blend>.00001 and not outside(pole):
        safe=None
        for degrees in range(2,181,2):
            for sign in (-1,1):
                candidate=Quaternion(axis,math.radians(sign*degrees))@pole
                if outside(candidate):safe=candidate;break
            if safe is not None:break
        if safe is None:raise RuntimeError(f'No torso-clear elbow at frame {frame} {side}')
        pole=safe
    elbow=shoulder+axis*along+pole*radius
    align(chain[0],chain[1],elbow,blend);align(chain[1],chain[2],wrist,blend)
    c.matrix=Matrix.Translation(wrist)@rotation.to_matrix().to_4x4();update()
def tree(o,side=None):
    ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=ev.to_mesh();m.calc_loop_triangles()
    groups={g.index for g in o.vertex_groups if side and f'_{side}_' in g.name}
    selected={v.index for v in o.data.vertices if any(g.group in groups and g.weight>.1 for g in v.groups)} if side else None
    tris=[tuple(t.vertices) for t in m.loop_triangles if selected is None or any(v in selected for v in t.vertices)]
    t=BVHTree.FromPolygons([o.matrix_world@v.co for v in m.vertices],tris,all_triangles=True)
    ev.to_mesh_clear();return t
bodymesh=next(o for o in body.children if o.type=='MESH');leafmesh=next(o for o in leaf.children if o.type=='MESH')
report={'sex':sex,'durationSeconds':.76,'reachSeconds':.16,'hingeSeconds':.44,'releaseSeconds':.16,'clips':{},'qualification':'local fitting candidate; live animation blending and clothing acceptance required'}
right_relative=rig.pose.bones['SKEL_R_Hand'].matrix.inverted()@phone
report['stockHold']={'clip':'pack:/cellphone_text_read_base.clip','startFrame':hold_start}
report['attachment']={'bone':57005,'position':list(right_relative.translation),'rotation':[math.degrees(v) for v in right_relative.to_euler('ZXY')]}
centerphone=Matrix.Translation((-.07,.38,.52))@Matrix.Rotation(math.pi,4,'Z')
report['screenFacingPlayerDot']=(phone.to_3x3()@Vector((0,1,0))).dot(rig.pose.bones['SKEL_Head'].head-phone.translation)
assert report['screenFacingPlayerDot']>0,'Inner display faces away from the player'
canonical={}
for opening in (True,False):
    transport={};pole_history={}
    rig.animation_data_clear();body.animation_data_clear();leaf.animation_data_clear();reset()
    action=bpy.data.actions.new(f'peak_duo_{sex}_'+('unfold' if opening else 'fold'))
    collisions=[];maxgap=0;wrist_angles=[];previous_quaternions={};baked=[];prop_frames=[]
    for frame in range(77):
        reset();t=frame/100;p=smooth((t-.16)/.44);angle=math.pi*(1-p if opening else p)
        weight=smooth(t/.16)*smooth((.76-t)/.16)
        desiredphone=Matrix.LocRotScale(phone.translation.lerp(centerphone.translation,weight),phone.to_quaternion().slerp(centerphone.to_quaternion(),weight),Vector((1,1,1)))
        right=desiredphone@right_relative.inverted()
        arm(right.translation,right.to_quaternion(),'R',weight)
        body.matrix_world=rig.pose.bones['PH_R_Hand'].matrix@attachment
        lm=body.matrix_world@Matrix.Translation((.0391875,0,0))@Matrix.Rotation(angle,4,'Z');leaf.matrix_world=lm
        # Support the lower outside corner. Fingers run UP the back, with the
        # thumb at the outside edge; folding never reverses finger direction.
        grip_local=Vector((.087 if sex=='male' else .083,-.062,-.135))
        wrist=(centerphone@Matrix.Translation((.0391875,0,0))@Matrix.Rotation(angle,4,'Z'))@grip_local
        localrot=Matrix(((0,1,0),(0,0,1),(1,0,0))).to_quaternion()
        # Orient toward the settled grip during approach/release. Interpolating
        # toward a moving target can switch quaternion hemispheres mid-reach.
        rotation=(centerphone@Matrix.Rotation(angle,4,'Z')).to_quaternion()@localrot
        start=rig.pose.bones[left[2]].head.copy();startrot=rig.pose.bones[left[2]].matrix.to_quaternion()
        reach=min(1,t/.16,(.76-t)/.16)
        waypoint=wrist-Vector((0,0,.13))
        approach=start.lerp(waypoint,smooth(reach/.6)).lerp(wrist,smooth((reach-.6)/.4))
        clearance=(.06+.04*angle/math.pi)*math.sin(math.pi*reach)*smooth(reach/.3)
        approach+=(centerphone@Matrix.Rotation(angle,4,'Z')).to_3x3()@Vector((0,-clearance,0))
        approach.x-=(.15 if sex=='male' else .23)*math.sin(math.pi*reach)**2
        if sex=='female':
            chest_clearance=math.sin(math.pi*max(0,min(1,(reach-.4)/.55)))**2
            approach.y+=.08*chest_clearance*angle/math.pi
        orient_weight=smooth(reach)
        arm(approach,startrot.slerp(rotation,orient_weight),blend=weight)
        # Preserve open finger topology for fitting; subsequent CCD curls are
        # authored in bone space, not runtime IK or stretched bone translations.
        for name in fingers:
            pb=rig.pose.bones[name]
            pb.rotation_quaternion=base[name].to_quaternion().slerp(Quaternion(),orient_weight)
        update()
        if opening:
            canonical[frame]={p.name:p.matrix_basis.copy() for p in rig.pose.bones}
        else:
            for p in rig.pose.bones:p.matrix_basis=canonical[76-frame][p.name]
            update()
            body.matrix_world=rig.pose.bones['PH_R_Hand'].matrix@attachment
            leaf.matrix_world=body.matrix_world@Matrix.Translation((.0391875,0,0))@Matrix.Rotation(angle,4,'Z')
            update()
        if weight>.99:
            fore=rig.pose.bones['SKEL_L_Hand'].head-rig.pose.bones['SKEL_L_Forearm'].head
            axis=rig.pose.bones['SKEL_L_Hand'].matrix.to_3x3()@Vector((1,0,0))
            wrist_angles.append(math.degrees(fore.angle(axis)))
        frame_data={}
        for name in upper:
            pb=rig.pose.bones[name]
            if name in previous_quaternions and pb.rotation_quaternion.dot(previous_quaternions[name])<0:
                pb.rotation_quaternion.negate()
            previous_quaternions[name]=pb.rotation_quaternion.copy()
            frame_data[name]=(pb.rotation_quaternion.copy(),pb.location.copy())
        baked.append(frame_data);prop_frames.append((body.matrix_world.copy(),leaf.matrix_world.copy()))
        # Skin/prop intersections are reported, never hidden by disabling physics.
        bt,lt=tree(bodymesh),tree(leafmesh)
        hits={side:sum(len(tree(o,side).overlap(bt))+len(tree(o,side).overlap(lt)) for o in skin) for side in ('L','R')}
        total=sum(len(tree(o).overlap(bt))+len(tree(o).overlap(lt)) for o in skin)
        if total:collisions.append({'frame':frame,'trianglePairs':hits,'allSkinTrianglePairs':total})
    # Write curves only after solving. An active partially-keyed action can
    # re-evaluate frame zero while the dependency graph solves a later pose.
    from bpy_extras import anim_utils
    slot=action.slots.new('OBJECT',rig.name)
    bag=anim_utils.action_ensure_channelbag_for_slot(action,slot)
    for name in upper:
        for prop,size,idx in [('rotation_quaternion',4,0),('location',3,1)]:
            for component in range(size):
                fc=bag.fcurves.new(f'pose.bones["{name}"].{prop}',index=component,group_name=name)
                fc.keyframe_points.add(77)
                fc.keyframe_points.foreach_set('co',[v for f in range(77) for v in (f,baked[f][name][idx][component])])
                for k in fc.keyframe_points:k.interpolation='LINEAR'
                fc.update()
    rig.animation_data_create();rig.animation_data.action=action;rig.animation_data.action_slot=slot
    for f,(bm,lm) in enumerate(prop_frames):
        body.matrix_world=bm;leaf.matrix_world=lm
        for obj in (body,leaf):
            obj.keyframe_insert('location',frame=f);obj.keyframe_insert('rotation_euler',frame=f)
    ao=create_anim_obj(SollumType.ANIMATION);ao.name=action.name;ao.parent=animations
    ao.animation_properties.target_id=rig.data;ao.animation_properties.action=action;ao.animation_properties.hash=action.name
    co=create_anim_obj(SollumType.CLIP);co.name=action.name;co.parent=clips;co.clip_properties.hash=action.name;co.clip_properties.name=action.name;co.clip_properties.duration=.76
    ca=co.clip_properties.animations.add();ca.animation=ao;ca.start_frame=0;ca.end_frame=76
    report['clips'][action.name]={'frames':77,'skinPropIntersections':collisions,'maxContactWristBendDegrees':max(wrist_angles)}
assert export_ycd(root,str(R/f'intermediates/peak_duo_hand_{sex}.ycd.xml'))
(R/f'evidence/hand-{sex}.json').write_text(json.dumps(report,indent=2))
