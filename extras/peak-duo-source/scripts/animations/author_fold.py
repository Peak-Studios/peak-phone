"""Reauthor existing fold gestures against the new grip, in a separate dictionary."""
from pathlib import Path
import json,sys,math
from mathutils import Euler
import os
root=Path(os.environ['PEAK_ANIMATION_OUTPUT']);sex=sys.argv[-1]
fit=json.loads((root/f'evidence/grip-rotation-{sex}.json').read_text())['attachment']
source=Path(__file__).with_name('rig_reference.py').read_text()
source=source.replace("str(R/'source/peak-duo.blend')","str(W/'peak-duo-correction/source/peak-duo.blend')")
old="attachment=Matrix.Translation((-.015,-.030,.015))@Matrix.Rotation(math.pi,4,'Z')@Matrix.Rotation(math.radians(-20),4,'Y')"
new=f"attachment=rig.pose.bones['PH_R_Hand'].matrix.inverted()@rig.pose.bones['SKEL_R_Hand'].matrix@Matrix.Translation({fit['position']!r})@Euler(tuple(math.radians(v) for v in {fit['rotation']!r}),'ZXY').to_matrix().to_4x4()"
assert old in source;source=source.replace(old,new)
source=source.replace('peak_duo_hand_','peak_sim_fold_').replace("f'peak_duo_{sex}_'","f'peak_simfold_{sex}_'")
source=source.replace('hand-{sex}','fold-{sex}')
exec(compile(source,str(Path(__file__).with_name('rig_reference.py')),'exec'))

# The runtime holds the unfolded handset with this dictionary after the
# transition. The original export only contained fold/unfold, so a requested
# *_hold clip could never play. Bake the final grip pose as a one-second loop.
rig.animation_data_clear()
for bone in rig.pose.bones:
    bone.matrix_basis=canonical[76][bone.name]
bpy.context.view_layer.update()
hold_action=bpy.data.actions.new(f'peak_simfold_{sex}_hold')
hold_slot=hold_action.slots.new('OBJECT',rig.name)
hold_bag=anim_utils.action_ensure_channelbag_for_slot(hold_action,hold_slot)
for name in upper:
    bone=rig.pose.bones[name]
    for prop,size in (('rotation_quaternion',4),('location',3)):
        values=getattr(bone,prop)
        for component in range(size):
            curve=hold_bag.fcurves.new(f'pose.bones["{name}"].{prop}',index=component,group_name=name)
            curve.keyframe_points.add(2)
            curve.keyframe_points.foreach_set('co',(0,values[component],100,values[component]))
            for key in curve.keyframe_points:key.interpolation='LINEAR'
            curve.update()
hold_anim=create_anim_obj(SollumType.ANIMATION)
hold_anim.name=hold_action.name;hold_anim.parent=animations
hold_anim.animation_properties.target_id=rig.data
hold_anim.animation_properties.action=hold_action
hold_anim.animation_properties.hash=hold_action.name
hold_clip=create_anim_obj(SollumType.CLIP)
hold_clip.name=hold_action.name;hold_clip.parent=clips
hold_clip.clip_properties.hash=hold_action.name
hold_clip.clip_properties.name=hold_action.name
hold_clip.clip_properties.duration=1.0
hold_link=hold_clip.clip_properties.animations.add()
hold_link.animation=hold_anim;hold_link.start_frame=0;hold_link.end_frame=100
assert export_ycd(root,str(R/f'intermediates/peak_sim_fold_{sex}.ycd.xml'))
