# puppet3d's cues from clips: a puppet whose every bone is turned by cues worked out from clips. Run by
# hand:
#
#   Blender -b --factory-startup --python plugins/puppet3d/puppet3d.cues.py -- \
#       <body.fbx> <layout> <skeleton entry> <skin entry> <out.json> \
#       stride=<walk.fbx>,<sheet entry>,<walk.cues.json> clock=<idle.fbx>,<sheet entry>,<idle.cues.json>
#
# Every input is named on the command; nothing is picked by itself. `<layout>` is the layout's name, as
# its skeleton file names it; `<skeleton entry>` and `<skin entry>` the loader entries of the body's
# skeleton json and its glb. `stride=` is a clip of one whole stride, its first frame and its last the
# same pose, and its hips going ahead; `clock=` a clip played round and round on the clock. Each names
# after its clip the loader entry of the cue sheet written from it and the file that sheet is written to.
#
# The body is read by `body`, its rest skeleton by `skeleton`, in the skeleton json's frame. Each
# clip is read frame by frame as each bone's turn from its rest (`matrix_basis`, by name without the
# `mixamorig…:` prefix), laid on the body's bones, and each bone's turn in the world worked out on the
# body. Each frame, each bone's turn is turned into puppet3d's three angles: its own turn in its rest
# frame, its parent's turn taken off (puppet3d's `played`: the frame's columns are the bone's `across`,
# its up and its length), as `bend`, `swing` and `twist`, each unwrapped from frame to frame.
#
# It writes two cue sheets, and `<out.json>`, a definition of a body posed by two cues drivers on one
# layout, each playing one of them by its entry:
#   { senses: { clock: "clock", speed: "velocity", stride: "rowStride" }, stride: <metres>,
#     layouts: { body: { layout, on: "world", skeleton, skin, drivers: [walk, idle] } } }
# `stride` is how far the stride clip's hips go ahead from its first frame to its last. The `walk`
# sheet's cues are `{ by: "stride", keys }`, a key for each frame at its share of the clip, its driver
# weighed `{ by: "speed", keys: [[0, 1]] }`, 1 always, the layer under; the `idle` sheet's `{ by: "clock",
# keys, period }`, a key for each frame at its second, round every `period` seconds, its length, its
# driver laid over the walk by `{ by: "speed", keys: [[0, 1], [<walk speed>, 0]] }`, so the two crossfade
# with the speed; the walk speed being the stride clip's metres over its seconds. Every number written
# comes from the clips and the body.
import bpy
import json
import math
import re
import sys
import numpy as np
from mathutils import Matrix

from mathutils import Vector

bare = lambda n: re.sub(r'^mixamorig\d*:?', '', n)
gltf = lambda v: [round(v.x, 6), round(v.z, 6), round(-v.y, 6)]


def body(path):
    """The body's armature: the FBX imported, each bone renamed without its `mixamorig…:` prefix, and
    every object's place, turn and size applied, so it stands at the origin unturned, in metres."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if len(arms) != 1:
        raise SystemExit(f'puppet3d cues: {path} holds {len(arms)} armatures, and a body is one')
    arm = arms[0]
    for b in arm.data.bones:
        b.name = bare(b.name)
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()
    return arm


def skeleton(arm):
    """The rest skeleton as the sheet's skeleton entry has it, every parent before its children, in
    glTF's axes: each bone's head and tail, and its `across`, its own x axis at rest."""
    out = []
    def walk(b):
        out.append(b)
        for c in b.children:
            walk(c)
    for b in arm.data.bones:
        if b.parent is None:
            walk(b)
    return [{
        'name': b.name, 'parent': b.parent.name if b.parent else None,
        'head': gltf(b.head_local), 'tail': gltf(b.tail_local),
        'across': gltf(Vector(b.matrix_local.col[0][:3]).normalized()),
    } for b in out]

# Blender's (x, y, z) in glTF's axes: (x, z, -y).
C = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=float)


def sample(path):
    """A clip read frame by frame: each bone's turn from its rest by name, the hips' place in the world,
    their rest place, and the clip's frames a second."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    act = arm.animation_data.action
    sc = bpy.context.scene
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    root = next(pb for pb in arm.pose.bones if pb.parent is None)
    rest = arm.matrix_world @ root.bone.head_local
    frames, hips = [], []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        frames.append({bare(pb.name): pb.matrix_basis.to_quaternion() for pb in arm.pose.bones})
        hips.append((arm.matrix_world @ root.head).copy())
    fps = sc.render.fps / sc.render.fps_base
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    return frames, hips, rest, fps


def frame_of(b):
    """puppet3d's frame of a bone of the skeleton: its across, its up, its length, as columns."""
    h, t, a = (np.array(b[k], dtype=float) for k in ('head', 'tail', 'across'))
    f = (t - h) / np.linalg.norm(t - h)
    a = a - f * a.dot(f)
    a = a / np.linalg.norm(a)
    return np.column_stack([a, np.cross(f, a), f])


def angles(arm, bones, rests, pose):
    """Each bone's bend, swing and twist for one frame of a clip laid on the body."""
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = pose[pb.name] if pb.name in pose else (1, 0, 0, 0)
    bpy.context.view_layer.update()
    turns, out = {}, {}
    for b in bones:
        pb = arm.pose.bones[b['name']]
        posed = np.array(pb.matrix.to_3x3().normalized())
        rest = np.array(pb.bone.matrix_local.to_3x3().normalized())
        own = C @ posed @ rest.T @ C.T
        turns[b['name']] = own
        above = np.eye(3) if b['parent'] is None else turns[b['parent']]
        m = rests[b['name']]
        e = m.T @ above.T @ own @ m
        out[b['name']] = (math.asin(max(-1.0, min(1.0, e[1, 2]))), math.atan2(e[0, 2], e[2, 2]), math.atan2(e[1, 0], e[1, 1]))
    return out


def channels(arm, bones, rests, frames):
    """Every bone's three angles over every frame, each unwrapped from frame to frame."""
    rows = [angles(arm, bones, rests, pose) for pose in frames]
    return {b['name']: [np.unwrap([r[b['name']][k] for r in rows]).tolist() for k in range(3)] for b in bones}


num = lambda v: round(float(v), 5)

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    named = {k: v.split(',') for k, v in (a.split('=', 1) for a in args[5:])}
    if len(args) != 7 or set(named) != {'stride', 'clock'} or any(len(v) != 3 for v in named.values()):
        raise SystemExit('puppet3d cues: <body.fbx> <layout> <skeleton entry> <skin entry> <out.json> stride=<walk.fbx>,<sheet entry>,<walk.cues.json> clock=<idle.fbx>,<sheet entry>,<idle.cues.json>')
    src, layout, skeleton_entry, skin_entry, out = args[:5]
    (walk_fbx, walk_entry, walk_file), (idle_fbx, idle_entry, idle_file) = named['stride'], named['clock']
    arm = body(src)
    bones = skeleton(arm)
    rests = {b['name']: frame_of(b) for b in bones}
    root = bones[0]['name']

    walk, walk_hips, walk_rest, walk_fps = sample(walk_fbx)
    idle, idle_hips, idle_rest, idle_fps = sample(idle_fbx)
    walked, idled = channels(arm, bones, rests, walk), channels(arm, bones, rests, idle)

    # A Mixamo clip faces Blender's −y: ahead is −y.
    metres = -(walk_hips[-1].y - walk_hips[0].y)
    if metres <= 0:
        raise SystemExit(f'puppet3d cues: the stride clip {walk_fbx} goes {metres:.4f} m ahead, and a stride goes ahead')
    seconds = (len(walk) - 1) / walk_fps
    speed = metres / seconds
    length = len(idle) / idle_fps
    stride_at = [num(i / (len(walk) - 1)) for i in range(len(walk))]
    clock_at = [num(i / idle_fps) for i in range(len(idle))]
    walk_weight = [{'by': 'speed', 'keys': [[0, 1]]}]
    idle_weight = [{'by': 'speed', 'keys': [[0, 1], [num(speed), 0]]}]

    axes = ('bend', 'swing', 'twist')
    walk_cues = {b['name']: {axis: [{'by': 'stride', 'keys': [[a, num(v)] for a, v in zip(stride_at, walked[b['name']][k])]}] for k, axis in enumerate(axes)} for b in bones}
    idle_cues = {b['name']: {axis: [{'by': 'clock', 'keys': [[a, num(v)] for a, v in zip(clock_at, idled[b['name']][k])], 'period': num(length)}] for k, axis in enumerate(axes)} for b in bones}

    definition = {
        'senses': {'clock': 'clock', 'speed': 'velocity', 'stride': 'rowStride'},
        'stride': num(metres),
        'layouts': {'body': {
            'layout': layout, 'on': 'world', 'skeleton': skeleton_entry, 'skin': skin_entry,
            'drivers': [{'name': 'walk', 'cues': walk_entry, 'weight': walk_weight}, {'name': 'idle', 'cues': idle_entry, 'weight': idle_weight}],
        }},
    }
    json.dump(walk_cues, open(walk_file, 'w'), separators=(',', ':'))
    json.dump(idle_cues, open(idle_file, 'w'), separators=(',', ':'))
    json.dump(definition, open(out, 'w'), separators=(',', ':'))
    print(f'CUES {out} {walk_file} {idle_file} bones={len(bones)} stride={metres:.3f}m in {seconds:.3f}s ({speed:.3f} m/s) frames={len(walk)} clock={length:.3f}s frames={len(idle)}')
