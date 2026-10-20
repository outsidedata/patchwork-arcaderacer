# A prop hung on a bone of one body, refitted onto the same bone of another so it keeps its turn in the
# world and its offset from the bone, both bodies posed on frame 0 of a clip the way anim.export.py lays
# clips (each bone's turn from its rest, the hips' position too).
#   Blender -b --factory-startup --python refit_prop.py -- <clip.fbx> <bone> <old.fbx> <new.fbx> <ax,ay,az> <tx,ty,tz>
# `at` in metres and `turn` in degrees, a three.js 'XYZ' Euler, in the bone's scale-free frame, as
# anim's props are. Prints the new `at` and `turn`, how far the bone moved, and the turn between the
# two bodies' bones.
import bpy, sys, re, math, json
from mathutils import Vector, Euler

a = sys.argv[sys.argv.index('--') + 1:]
clip, bone, old, new = a[0], a[1], a[2], a[3]
at = Vector([float(v) for v in a[4].split(',')])
# three.js's 'XYZ' Euler is Rx·Ry·Rz, which is Blender's 'ZYX'.
turn = Euler([math.radians(float(v)) for v in a[5].split(',')], 'ZYX')
bare = lambda n: re.sub(r'^mixamorig\d*:?', '', n)


def imp(p):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=p)
    objs = [o for o in bpy.data.objects if o not in before]
    return next(o for o in objs if o.type == 'ARMATURE'), objs


bpy.ops.wm.read_factory_settings(use_empty=True)
arm, objs = imp(clip)
act = arm.animation_data.action
bpy.context.scene.frame_set(int(act.frame_range[0]))
pose = {bare(pb.name): (pb.matrix_basis.to_translation(), pb.matrix_basis.to_quaternion()) for pb in arm.pose.bones}
for o in objs:
    bpy.data.objects.remove(o, do_unlink=True)


def frame(p):
    """The bone's world frame, scale-free, on the clip's first frame."""
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    body, _ = imp(p)
    if body.animation_data:
        body.animation_data.action = None
    for pb in body.pose.bones:
        b = bare(pb.name)
        if b not in pose:
            continue
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = pose[b][1]
        pb.location = pose[b][0] if b == 'Hips' else Vector()
    bpy.context.view_layer.update()
    pb = next(pb for pb in body.pose.bones if bare(pb.name) == bone)
    loc, rot, _ = (body.matrix_world @ pb.matrix).decompose()
    return loc, rot


lo, ro = frame(old)
ln, rn = frame(new)
rel = rn.inverted() @ ro
print('REFIT ' + json.dumps({
    'at': [round(v, 3) for v in rel @ at],
    'turn': [round(math.degrees(v), 1) for v in (rel @ turn.to_quaternion()).to_euler('ZYX')],
    'bone_moved_m': [round(v, 3) for v in (ln - lo)],
    'rel_deg': round(math.degrees(rel.angle), 1),
}))
