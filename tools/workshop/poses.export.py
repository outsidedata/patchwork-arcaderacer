# The pose lab's export: the poses set in the lab (`poses.ts`) written as one clip of an FBX, a frame a
# pose, as every other clip of the packs is an FBX of one clip. Run by the workshop's server
# (`POST /api/poses`), or by hand:
#
#   Blender -b --factory-startup --python tools/workshop/poses.export.py -- <poses.json> <out.fbx>
#
# <poses.json> is what the lab sends:
#   body    the rigged character the poses were set on, a path under the library (`PATCHWORK_LIBRARY`
#           from the environment, else from the repo's `.env`, else ~/patchwork-library):
#           `characters/<name>/<name>.fbx`
#   rest    `{ bones: { <bone>: [x, y, z, w] }, hips: [x, y, z] }`: each bone's turn in the lab's world at
#           rest, by its name without the `mixamorig…` prefix, and where the hips stand
#   poses   `[{ bones, hips }]`, the same of each pose, in order
# The lab's world is three's, the character's FBX loaded at its origin: y up, in the FBX's own units.
#
# The character is imported as anim's export imports a body, its meshes taken away, and each pose keyed
# on its own frame from 0, every bone's turn and the hips' place, linear between keys. A bone's turn is
# carried from the lab's world into Blender's as the turn it was given from its rest there: in Blender's
# world, the lab's turn of it from its rest, laid onto the bone's rest in Blender. The hips are moved by
# as much as the lab moved them, in Blender's metres. Every other bone keeps its rest length.
#
# The last pose is keyed again on the frame after it, so a clip of one pose lasts a frame, as every clip
# lasts more than none; the frames are 30 a second, as anim's export samples every clip. The FBX holds the
# armature alone, its one take named `__POSES`.
import bpy
import json
import math
import os
import re
import sys
from mathutils import Matrix, Quaternion, Vector

args = sys.argv[sys.argv.index('--') + 1:]
REQUEST, OUT = args[0], args[1]
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, '../..')
FPS = 30


def dotenv(path):
    """The `KEY=value` lines of a .env file, without blank lines, `#` comments or quotes round a value."""
    if not os.path.exists(path):
        return {}
    pairs = {}
    for line in open(path):
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        pairs[key.strip()] = value
    return pairs


ENV = {**dotenv(os.path.join(REPO, '.env')), **os.environ}
LIBRARY = os.path.expanduser(ENV.get('PATCHWORK_LIBRARY') or '~/patchwork-library')
bare = lambda n: re.sub(r'^mixamorig\d*:?', '', n)

spec = json.load(open(REQUEST))
if not spec.get('poses'):
    raise SystemExit('poses.export.py: no poses')

bpy.ops.wm.read_factory_settings(use_empty=True)
full = os.path.join(LIBRARY, spec['body'])
if not os.path.exists(full):
    raise SystemExit(f'poses.export.py: no body at {full}')
bpy.ops.import_scene.fbx(filepath=full)
scene = bpy.context.scene
scene.render.fps = FPS
scene.render.fps_base = 1
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in [o for o in bpy.data.objects if o is not arm]:
    bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
arm.animation_data_create()
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'
    pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
bpy.context.view_layer.update()

# The lab's world (three's, y up) into Blender's (z up): a turn of a quarter about x.
A = Quaternion((1, 0, 0), math.radians(90))
q3 = lambda v: Quaternion((v[3], v[0], v[1], v[2]))  # three's [x, y, z, w]
world = arm.matrix_world
turn_world = world.to_quaternion()
# The bones parents first, each with its rest turn and its head in Blender's world.
depth = lambda b: 0 if b.parent is None else 1 + depth(b.parent)
bones = sorted(arm.pose.bones, key=lambda pb: depth(pb.bone))
rest = {bare(pb.name): (turn_world @ pb.bone.matrix_local.to_quaternion()) for pb in bones}
hips = next(pb for pb in bones if pb.parent is None)
hips_rest = world @ hips.bone.head_local
lab_rest = spec['rest']
missing = [bare(pb.name) for pb in bones if bare(pb.name) not in lab_rest['bones']]
if missing:
    raise SystemExit(f'poses.export.py: the lab gives no rest for {", ".join(missing)}: was it set on {spec["body"]}?')
# The lab's units into Blender's metres, by the hips' height at rest in each.
k = hips_rest.z / lab_rest['hips'][1]

bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
act = bpy.data.actions.new('__POSES')
arm.animation_data.action = act
frames = spec['poses'] + [spec['poses'][-1]]
for f, pose in enumerate(frames):
    scene.frame_set(f)
    for pb in bones:
        b = bare(pb.name)
        if b not in pose['bones']:
            raise SystemExit(f'poses.export.py: pose {f} gives no turn of {b}')
        # The lab's turn of the bone from its rest, in Blender's world, laid onto its rest there.
        moved = A @ q3(pose['bones'][b]) @ q3(lab_rest['bones'][b]).inverted() @ A.inverted()
        want = turn_world.inverted() @ (moved @ rest[b])
        if pb is hips:
            d = [pose['hips'][i] - lab_rest['hips'][i] for i in range(3)]
            at = world.inverted() @ (hips_rest + (A @ Vector(d)) * k)
        else:
            at = pb.matrix.translation.copy()
        m = Matrix.Translation(at) @ want.to_matrix().to_4x4()
        basis = arm.convert_space(pose_bone=pb, matrix=m, from_space='POSE', to_space='LOCAL')
        pb.rotation_quaternion = basis.to_quaternion()
        pb.location = basis.to_translation() if pb is hips else Vector((0, 0, 0))
        bpy.context.view_layer.update()
        pb.keyframe_insert('rotation_quaternion', frame=f)
        if pb is hips:
            pb.keyframe_insert('location', frame=f)
scene.frame_start, scene.frame_end = 0, len(frames) - 1

bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.fbx(filepath=OUT, use_selection=True, object_types={'ARMATURE'}, add_leaf_bones=False,
                         bake_anim=True, bake_anim_use_all_bones=True, bake_anim_use_nla_strips=False,
                         bake_anim_use_all_actions=False, bake_anim_force_startend_keying=True,
                         bake_anim_step=1.0, bake_anim_simplify_factor=0.0)
print(f'POSES {OUT} poses={len(spec["poses"])} frames={len(frames)} bones={len(bones)}')
