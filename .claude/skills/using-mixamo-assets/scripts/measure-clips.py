# Measures every clip of the packs named, each on its own Mixamo skeleton, as anim's bake measures a
# clip on a body (`plugins/anim/anim.export.py`), and writes them beside the collection's catalogue,
# keyed by the clip's file as the catalogue names it:
#
#   Blender -b --factory-startup --python measure-clips.py -- <out.json> <pack dir> [<pack dir> ...]
#
# A clip already in <out.json> is measured again and written over; every other clip in it is kept.
# Each clip's entry, metres and seconds, in the body's frame as glTF draws it (x the body's left, y up,
# z ahead), its hips' steady progress (a straight line from where the clip starts them to where it
# ends them) taken off every point and the hips' rest put back, as anim's `ends` are:
#   pack, name    the pack folder and the file's name without `.fbx`.
#   fps, frames, dur     30, the frames after the first, and the seconds.
#   forward, left, yaw, rise, height, low, peak, travel    the bake's table row: the hips' travel at
#                 the end, forward and left, the turn at the end in degrees (positive left), the most
#                 the hips rise and dip from their first frame, their height on it, the second the right
#                 hand moves fastest, and `[t, forward, left, yawDeg]` every tenth of a second and at the end.
#   segments      per limb segment (`head`, `torso`, `armL`, `forearmL`, `handL`, …R, `uplegL`, `legL`,
#                 `footL`, …R): `{ peak, speed, at, dir }`, the second its far end moves fastest, that
#                 speed in m/s, where the end is then, and the unit way it moves: what a blow lands with,
#                 when, how high and how far out.
#   ends          per segment, its two ends on every frame, [ax, ay, az, bx, by, bz], millimetres rounded.
import bpy
import json
import math
import os
import sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
OUT, PACKS = args[0], args[1:]
FPS = 30
SAMPLE_HZ = 10
FWD = Vector((0, -1, 0))
LEFT = Vector((1, 0, 0))
SEGMENTS = {
    'head': ('Head', 'HeadTop_End'), 'torso': ('Hips', 'Neck'),
    'armL': ('LeftArm', 'LeftForeArm'), 'forearmL': ('LeftForeArm', 'LeftHand'), 'handL': ('LeftHand', 'LeftHandMiddle4'),
    'armR': ('RightArm', 'RightForeArm'), 'forearmR': ('RightForeArm', 'RightHand'), 'handR': ('RightHand', 'RightHandMiddle4'),
    'uplegL': ('LeftUpLeg', 'LeftLeg'), 'legL': ('LeftLeg', 'LeftFoot'), 'footL': ('LeftFoot', 'LeftToe_End'),
    'uplegR': ('RightUpLeg', 'RightLeg'), 'legR': ('RightLeg', 'RightFoot'), 'footR': ('RightFoot', 'RightToe_End'),
}
bare = lambda n: n.split(':')[-1].replace('mixamorig', '')
num = lambda v, places=3: (lambda x: int(x) if x == int(x) else x)(round(v, places))


def measure(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.fbx(filepath=path)
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.render.fps_base = 1
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    act = rig.animation_data.action
    sc = bpy.context.scene
    f0, f1 = (int(round(f)) for f in act.frame_range)
    bones = {bare(b.name): b for b in rig.pose.bones}
    missing = [n for pair in SEGMENTS.values() for n in pair if n not in bones]
    if missing:
        raise SystemExit(f'measure-clips: {path} has no bone {missing[0]}')
    hips = bones['Hips']
    hand = bones['RightHand']
    gltf = lambda v: [v.x, v.z, -v.y]
    at = lambda b: gltf(rig.matrix_world @ b.head)

    # The table row, as anim's bake measures it.
    sc.frame_set(f0)
    m0 = rig.matrix_world @ hips.matrix
    p0 = m0.translation.copy()
    axis = m0.to_3x3().inverted() @ FWD
    pts, rise, low = [], 0.0, 0.0
    h_prev, peak_v, peak_f = None, 0.0, f0
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        m = rig.matrix_world @ hips.matrix
        p = m.translation - p0
        rise, low = max(rise, p.z), min(low, p.z)
        h = (rig.matrix_world @ hand.matrix).translation.copy()
        if h_prev is not None and (h - h_prev).length * FPS > peak_v:
            peak_v, peak_f = (h - h_prev).length * FPS, f
        h_prev = h
        fwd = m.to_3x3() @ axis
        fwd.z = 0
        yaw = math.degrees(math.atan2(FWD.cross(fwd).z, FWD.dot(fwd))) if fwd.length > 1e-6 else 0.0
        pts.append((f - f0, p.dot(FWD), p.dot(LEFT), yaw))
    n = f1 - f0
    step = max(1, round(FPS / SAMPLE_HZ))
    keep = [pts[i] for i in range(0, n + 1, step)]
    if keep[-1][0] != n:
        keep.append(pts[-1])

    # The ends of every segment on every frame, the hips' steady progress taken off and their rest put
    # back, as anim's `ends` are.
    sc.frame_set(f0)
    start = at(hips)
    sc.frame_set(f1)
    end = at(hips)
    for b in rig.pose.bones:
        b.matrix_basis.identity()
    rig.animation_data.action = None
    bpy.context.view_layer.update()
    rest = at(hips)
    rig.animation_data.action = act
    ends = {s: [] for s in SEGMENTS}
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        s = (f - f0) / max(1, n)
        shift = [start[0] + (end[0] - start[0]) * s - rest[0], 0, start[2] + (end[2] - start[2]) * s - rest[2]]
        for seg, (a, b) in SEGMENTS.items():
            pa, pb = at(bones[a]), at(bones[b])
            ends[seg].append([pa[0] - shift[0], pa[1], pa[2] - shift[2], pb[0] - shift[0], pb[1], pb[2] - shift[2]])

    # Each segment's far end at its fastest.
    segments = {}
    for seg, rows in ends.items():
        best, k = 0.0, 0
        for i in range(1, len(rows)):
            d = Vector(rows[i][3:]) - Vector(rows[i - 1][3:])
            if d.length * FPS > best:
                best, k = d.length * FPS, i
        move = (Vector(rows[k][3:]) - Vector(rows[k - 1][3:])) if k else Vector((0, 0, 0))
        way = move.normalized() if move.length > 0 else move
        segments[seg] = {'peak': num(k / FPS), 'speed': num(best), 'at': [num(c) for c in rows[k][3:]], 'dir': [num(c) for c in way]}

    return {
        'pack': os.path.basename(os.path.dirname(path)), 'name': os.path.splitext(os.path.basename(path))[0],
        'fps': FPS, 'frames': n, 'dur': num(n / FPS),
        'forward': num(pts[-1][1]), 'left': num(pts[-1][2]), 'yaw': num(pts[-1][3], 1), 'rise': num(rise),
        'height': num(p0.z), 'low': num(low), 'peak': num((peak_f - f0) / FPS),
        'travel': [[num(fr / FPS), num(a), num(b), num(y, 1)] for fr, a, b, y in keep],
        'segments': segments,
        'ends': {seg: [[round(c, 3) for c in row] for row in rows] for seg, rows in ends.items()},
    }


out = json.load(open(OUT)) if os.path.exists(OUT) else {}
count = 0
for pack in PACKS:
    for f in sorted(os.listdir(pack)):
        if not f.lower().endswith('.fbx'):
            continue
        path = os.path.join(pack, f)
        out[path] = measure(path)
        count += 1
        print(f'MEASURED {path} frames={out[path]["frames"]}')
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print(f'WROTE {OUT} clips={len(out)} measured={count}')
