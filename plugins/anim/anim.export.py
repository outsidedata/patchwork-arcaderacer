# anim's export: a rig file's clips baked onto each body it names, one glb per body, and the rig's
# `table` measured. Run by the anim extension's route (`anim.route.ts`), or by hand:
#
#   Blender -b --factory-startup --python plugins/anim/anim.export.py -- \
#       <rig.json> <table.json> <body>=<out.glb> [<body>=<out.glb> ...]
#
# The rig file names its bodies, paths under the library, and the file of each clip, paths under
# the clip collection, `PATCHWORK_CLIPS` (else ~/troupe-collection). The library is `PATCHWORK_LIBRARY` from the environment, else from the repo's
# `.env` (`.env.example` beside it lists the settings), else ~/patchwork-library; `~` in it is the
# home folder. A rigged character is `characters/<name>/<name>.fbx` in it.
#   bodies  `{ <body>: "<fbx>" }`, the rigged characters. Each `<body>=<out.glb>` names one of them.
#   spread  `{ <body>: <degrees> }`: that body's upper arms swung out from its sides on every frame,
#           turned about the body's forward axis in each arm's rest frame, after the clip's own turn.
#   size    times: every body of the rig is baked this many times its own size, 1 when left out. Each
#           object the body's file holds at its top is scaled by it before anything is written or
#           measured, so the glb draws the body at that size and the table and `ends` are measured
#           on it: a gear's speed, a one-shot's travel, the hips' height and every segment's ends come
#           out times `size`. It is the rig's, not a body's, since the table is measured once for
#           every body of the rig.
#   clips   `<name>: "<fbx>"` or `{ file, rebase, ... }`. A clip with no `file` (a `mirror`) is built
#           by anim itself and is skipped here.
#   blades  `[<mesh>]`: names of the rig's `meshes`, each a rigid weapon its body holds, measured as
#           a segment of that name beside the limbs' (below).
#   rebase  `{ from: "<fbx>", onto: "<clip>" }`: the clip is moved from the pose it was authored
#           around to the pose another clip starts in. Each bone's turn on each frame is taken as a
#           turn away from its turn on the first frame of `from`, and that same turn is laid onto the
#           bone's turn on the first frame of `onto`; the hips' position likewise. A pack's fire and
#           reload were authored around a rifle held 22 cm further forward than the locomotion pack's
#           aim, and on the upper channel that difference would jump the rifle on every shot.
#
# A clip's sidecar: a JSON file beside its FBX, of the same name with `.json` for `.fbx`
# (`Stand To Crouch.json` beside `Stand To Crouch.fbx`), says what the clip itself gets wrong, and is
# laid onto the clip as it is baked; the FBX is never changed. A clip with no sidecar, or a sidecar
# with no `offset`, is baked as it is.
#   offset  `{ position, rotation }`, each rows sampled straight between them and held past either
#           end, one row standing for the whole clip: `position` `[[t, x, y, z], ...]`, metres in the
#           axes the table and `ends` are measured in (x the body's left, y up, z ahead), and
#           `rotation` `[[t, degrees], ...]`, a turn about the vertical, positive left; `t` seconds
#           into the clip. On each frame the clip's hips, its root bone, are turned about the vertical
#           through the clip's origin and then moved, so the whole body is: its feet set back on the
#           floor a clip sinks them through, or a clip that stands turned faced straight. The table
#           and `ends` are measured on the clip as it is baked, the offset in them.
#
# A clip's poses: a JSON file beside its FBX, of the same name with `.poses.json` for `.fbx`
# (`Flying.poses.json` beside `Flying.fbx`), `{ "poses": { "<frame>": "<pose>" } }`, names frames of the
# clip, each a pose: a frame of the clip held. Frames count from 0, as the clip is sampled (below). Every
# pose the rig's clips name is written to <table.poses.json> beside <table.json> as `{ <pose>: { clip,
# frame, at } }`, the rig's name of the clip, the frame and its time in seconds, which `merge-table.mjs`
# writes into the rig file's `poses`. Two poses of one name, or a frame the clip has not got, stop the
# bake. A mirrored clip is anim's own and names none.
#
# Every clip is sampled once, as each bone's position and turn from its rest (`matrix_basis`), and
# written onto each body as an action of its own name, one NLA track per clip, which the glTF
# exporter writes as one named animation. Only the hips keep their position keys: every other bone
# stands where its body's rest puts it, so a body of other proportions than the one the clips were
# pulled on keeps its own limbs. The bones are matched by name without the `mixamorig…:` prefix,
# which differs between packs.
#
# A body textured the specular/gloss way, as Adobe Fuse and Mixamo characters are, is turned into the
# metal/rough way glTF draws before it is written. Blender's FBX importer gives such a material
# Metallic 1 and feeds the gloss map straight into Roughness, so cloth and skin come out as polished
# metal with their shine inverted. A material whose Roughness is fed by an image named `gloss` is
# given: Metallic 0; Roughness from a copy of that image inverted (rough = 1 − gloss); no specular map,
# Specular IOR Level at its default 0.5; and its alpha from the image its Base Color reads (the
# importer reads it from a non-colour duplicate, `….001`, which glTF cannot pack), clipped at one half
# through a Round node, which the glTF exporter writes as `alphaMode: MASK`, or no alpha at all when
# that image is opaque. A material that is not so is left as it is.
#
# The table is measured on the first body named, once its clips are written, and written to
# <table.json> as `{ <clip>: { frames, dur, forward, left, yaw, rise, height, low, peak, travel } }`:
# forward is the body's own facing on the first frame (a Mixamo body faces −Y in Blender, +Z once
# exported), left is +X in that frame, yaw how far the facing turned by the last frame, positive
# left, rise the highest the hips got over their first frame, height the hips' height on frame 0,
# low how far they dip, peak the second the right hand moves fastest, and travel rows
# `[t, forward, left, yawDeg]` every tenth of a second and at the end. The route writes it into the
# rig file.
#
# Each body's bones are measured once its glb is written, frame by frame in every clip, and written to
# <table.ends.json> beside <table.json> as `{ <body>: { <clip>: { fps, <segment>: [[ax, ay, az, bx, by,
# bz], ...] } } }`, one row a frame from 0, which `merge-table.mjs` writes into the rig file's `ends`.
# A segment is two points: where its bone starts, and where the next bone down starts (the shoulder and
# the elbow for an upper arm, the elbow and the wrist for a forearm, the wrist and the middle fingertip
# for a hand; the hip and the knee for a thigh, the knee and the ankle for a shin, the ankle and the
# toe's tip for a foot; the skull's base and top for the head; the hips and the neck for the torso).
# Each is in the body's frame as anim draws it, glTF's axes (x the body's left, y up, z ahead), metres:
# a loop's hips are drawn at their rest across the ground plus their sway about the clip's steady
# progress (`anim.plugin.ts`, Pinning), so the steady progress, a straight line from where the clip
# starts the hips to where it ends them, is taken off every point, and the hips' rest put back. Every
# body is measured, not only the first: each keeps its own limb lengths.
# A blade (`blades`) is a segment too: its guard and its tip. Its mesh is the one object of the body
# whose name the rig's `meshes` pattern for it matches, every vertex of it weighted to one bone, which
# carries it rigidly. Its tip is the vertex furthest from that bone's head, its pommel's end the
# vertex furthest from the tip, and its guard the point of the line between them level with the
# vertex standing furthest off that line between the bone's head and the tip: the crossguard. Both
# are measured once in the bone's rest frame and carried by the bone on every frame.
#
# Each blade's guard and tip are measured again in the frame of the exported glb's joint that carries
# it, read off the glb's nodes before it is packed, and written to <table.grips.json> as `{ <body>:
# { <blade>: { bone, guard, tip } } }`, which `merge-table.mjs` writes into the rig file's `grips`. The
# server poses a body off the packed glb itself (`anim.sim.ts`, `posed`) and carries each blade on its
# joint by these. The bake stops if the glb's hips at rest stand more than a millimetre from Blender's.
#
# What each clip touches on each body. Once a body's bones are measured, its skin is measured on every
# frame of every clip as baked, its sidecar laid on (`anim.touches.py`, beside this), and anim's touch
# reader (`anim.touches.mjs`, run by the `node` on the PATH, or `NODE` from the environment or the
# repo's `.env`) reads off it what the clip touches, as the rig has the clip (a loop where its entry says
# `loop`) and lifting nothing, since the sidecar's lift is in the clip: where the hands grip, where the
# feet stand, the floors, the seat, every patch of skin held still and when (`plants`), by the cases of
# `anim.touches.json`. It is written to <table.touches.json> as `{ <body>: { <clip>: <reading> } }`,
# which `merge-table.mjs` writes into the rig file's `touches`. A mirrored clip is anim's own and has
# none.
#
# Each glb is packed by the native gltfpack (`GLTFPACK` from the environment or the repo's `.env`, else
# `gltfpack` on the PATH; `yarn health` checks it) before it is written to its <out.glb>: meshopt compression (`-cc`), every named node, bone and
# material kept (`-kn -km`), and translations at 20 bits (`-at 20`), since at its default 16 the hips
# of a run land up to 10 mm from the export's and at 20 within 0.6 mm, for 1.7 KB; rotations at its
# default 12 bits are within 0.1° of every bone of every clip. The loader decodes it with three's
# meshopt decoder. gltfpack keeps a skinned mesh's named node as an empty parent and puts the mesh on
# a new unnamed child, which carries the scale its quantized positions are read back by. Three's glTF
# loader names the mesh it draws after that child, and anim matches a rig's `meshes` against the
# names of the meshes it draws, so each name is moved from the parent onto its mesh's node: the parent
# is left unnamed, since a second node of the same name would make three call the mesh `<name>_1`.
import bpy
import importlib.util
import json
import math
import numpy as np
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from mathutils import Matrix, Quaternion, Vector

args = sys.argv[sys.argv.index('--') + 1:]
RIG, TABLE = args[0], args[1]
OUTS = dict(a.split('=', 1) for a in args[2:])
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, '../..')
# anim's skin measure (`anim.touches.py`), beside this.
_spec = importlib.util.spec_from_file_location('anim_touches', os.path.join(HERE, 'anim.touches.py'))
touches = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(touches)


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
C = os.path.expanduser(ENV.get('PATCHWORK_CLIPS') or '~/troupe-collection')
LIBRARY = os.path.expanduser(ENV.get('PATCHWORK_LIBRARY') or '~/patchwork-library')



def gltfpack():
    """`GLTFPACK`, else `gltfpack` on the PATH past the repo's node_modules (the npm build there is the
    node.js one), as `yarn health` and `yarn bake` find it."""
    if ENV.get('GLTFPACK'):
        return ENV['GLTFPACK']
    skip = os.path.realpath(os.path.join(REPO, 'node_modules'))
    path = os.pathsep.join(d for d in ENV.get('PATH', '').split(os.pathsep)
                           if d and not os.path.realpath(d).startswith(skip))
    found = shutil.which('gltfpack', path=path)
    if not found:
        raise SystemExit('anim.export.py: no gltfpack: set GLTFPACK or put the native gltfpack on the PATH (yarn health)')
    return found


GLTFPACK = gltfpack()
FPS = 30
SAMPLE_HZ = 10
FWD = Vector((0, -1, 0))
LEFT = Vector((1, 0, 0))

spec = json.load(open(RIG))
bare = lambda n: re.sub(r'^mixamorig\d*:?', '', n)


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def load(path, root=C):
    full = os.path.join(root, path)
    if not os.path.exists(full):
        raise SystemExit(f'anim export: no file at {full}')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=full)
    new = [o for o in bpy.data.objects if o not in before]
    return next(o for o in new if o.type == 'ARMATURE'), new


def drop(objs):
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a.users == 0:
            bpy.data.actions.remove(a)


def sample(path):
    """Every frame of a clip: bare bone name to (position, turn) from its rest."""
    arm, new = load(path)
    act = arm.animation_data.action
    sc = bpy.context.scene
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    frames = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        frames.append({bare(pb.name): (pb.matrix_basis.to_translation(), pb.matrix_basis.to_quaternion()) for pb in arm.pose.bones})
    drop(new)
    return frames


fresh()
seen = {}


def frames_of(path):
    if path not in seen:
        seen[path] = sample(path)
        print(f'SAMPLE {path} frames={len(seen[path])}')
    return seen[path]


def file_of(e):
    return e if isinstance(e, str) else e.get('file')


def rows_of(path, key, width, rows):
    """A sidecar's offset rows, checked: `[[t, ...width numbers], ...]`, `t` rising."""
    if not isinstance(rows, list) or not rows:
        raise SystemExit(f'anim export: {path}: offset.{key} is no list of rows')
    for i, row in enumerate(rows):
        if not isinstance(row, list) or len(row) != 1 + width or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in row):
            raise SystemExit(f'anim export: {path}: offset.{key} row {i} is not [t, {width} numbers]')
        if i and row[0] <= rows[i - 1][0]:
            raise SystemExit(f'anim export: {path}: offset.{key} row {i} is at {row[0]} s, not after the row before')
    return rows


def sidecar(path):
    """The offset of the clip's sidecar beside its FBX (see the header): `(position, rotation)` rows,
    either None where the sidecar gives none, or None for a clip with no sidecar or no offset."""
    full = os.path.join(C, os.path.splitext(path)[0] + '.json')
    if not os.path.exists(full):
        return None
    off = json.load(open(full)).get('offset')
    if off is None:
        return None
    pos, rot = off.get('position'), off.get('rotation')
    if pos is None and rot is None:
        raise SystemExit(f'anim export: {full}: offset gives neither position nor rotation')
    print(f'SIDECAR {full}')
    return (rows_of(full, 'position', 3, pos) if pos is not None else None,
            rows_of(full, 'rotation', 1, rot) if rot is not None else None)


def row_at(rows, t):
    """Rows sampled straight between them at t, held past either end: the values after `t`."""
    if t <= rows[0][0]:
        return rows[0][1:]
    for a, b in zip(rows, rows[1:]):
        if t <= b[0]:
            s = (t - a[0]) / (b[0] - a[0])
            return [x + (y - x) * s for x, y in zip(a[1:], b[1:])]
    return rows[-1][1:]


clips = {}
fixes = {}
for name, e in spec['clips'].items():
    f = file_of(e)
    if not f:
        continue
    fr = frames_of(f)
    rb = None if isinstance(e, str) else e.get('rebase')
    if rb:
        base = frames_of(rb['from'])[0]
        onto = frames_of(file_of(spec['clips'][rb['onto']]))[0]
        fr = [{b: (onto[b][0] + (loc - base[b][0]), onto[b][1] @ base[b][1].inverted() @ rot) for b, (loc, rot) in pose.items()}
              for pose in fr]
    clips[name] = fr
    fixes[name] = sidecar(f)


def poses_of(name, path, frames):
    """The poses the clip's `.poses.json` beside its FBX names (see the header), each `{ clip, frame, at }`."""
    full = os.path.join(C, os.path.splitext(path)[0] + '.poses.json')
    if not os.path.exists(full):
        return {}
    named = json.load(open(full)).get('poses')
    if not isinstance(named, dict):
        raise SystemExit(f'anim export: {full}: poses is no {{ "<frame>": "<pose>" }}')
    out = {}
    for f, pose in named.items():
        if not re.fullmatch(r'\d+', f) or int(f) >= frames:
            raise SystemExit(f'anim export: {full}: pose {pose} is at frame {f}, and the clip has frames 0 to {frames - 1}')
        if not isinstance(pose, str) or not pose:
            raise SystemExit(f'anim export: {full}: frame {f} names no pose')
        out[pose] = {'clip': name, 'frame': int(f), 'at': round(int(f) / FPS, 6)}
    print(f'POSES {full} poses={len(out)}')
    return out


posed = {}
for name, e in spec['clips'].items():
    f = file_of(e)
    if not f:
        continue
    for pose, at in poses_of(name, f, len(clips[name])).items():
        if pose in posed:
            raise SystemExit(f'anim export: two poses are named {pose}: frame {posed[pose]["frame"]} of {posed[pose]["clip"]} and frame {at["frame"]} of {name}')
        posed[pose] = at


def spreads(body, degrees):
    """Bare bone name to the turn laid before each frame's: each upper arm swung `degrees` away from
    the body's side about its forward axis, written in the arm's rest frame."""
    if not degrees:
        return {}
    to_arm = body.matrix_world.to_3x3().inverted()
    out = {}
    for b, side in (('LeftArm', 1), ('RightArm', -1)):
        pb = next((p for p in body.pose.bones if bare(p.name) == b), None)
        if pb is None:
            continue
        # The body faces FWD; a turn about +FWD carries the left arm (+X, in a Mixamo body's own
        # frame) up and away from the side, as seen on the farm's body, the right arm mirrored.
        axis = pb.bone.matrix_local.to_3x3().inverted() @ (to_arm @ (FWD * side))
        out[b] = Quaternion(axis.normalized(), math.radians(degrees))
    return out


def offset(body, fr, fix):
    """The clip's frames with its sidecar's offset laid onto the hips (see the header): the hips' pose
    in the armature, turned about the world's vertical through its origin and moved, in the world, and
    taken back into the hips' own rest frame."""
    pos, rot = fix
    hips = next(pb for pb in body.pose.bones if pb.parent is None)
    b = bare(hips.name)
    world = body.matrix_world.copy()
    rest = hips.bone.matrix_local.copy()
    out = []
    for f, pose in enumerate(fr):
        t = f / FPS
        x, y, z = row_at(pos, t) if pos else (0, 0, 0)
        turn = row_at(rot, t)[0] if rot else 0
        # glTF's (x, y, z) is Blender's (x, −z, y); a turn left about glTF's up is one about Blender's z.
        laid = Matrix.Translation(Vector((x, -z, y))) @ Matrix.Rotation(math.radians(turn), 4, 'Z')
        loc, q = pose[b]
        moved = rest.inverted() @ world.inverted() @ laid @ world @ rest @ Matrix.LocRotScale(loc, q, None)
        out.append({**pose, b: (moved.to_translation(), moved.to_quaternion())})
    return out


def write(body, name, fr, spread, fix):
    """The clip as an action on the body, its sidecar's offset laid on, and an NLA track that holds it."""
    if fix:
        fr = offset(body, fr, fix)
    act = bpy.data.actions.new(name)
    body.animation_data.action = act
    bones = {bare(pb.name): pb for pb in body.pose.bones}
    n = len(fr)
    for b, pb in bones.items():
        if b not in fr[0]:
            continue
        pb.rotation_mode = 'QUATERNION'
        qs, prev = [], None
        for pose in fr:
            q = pose[b][1].copy()
            if b in spread:
                q = spread[b] @ q
            if prev is not None:
                q.make_compatible(prev)
            qs.append(q)
            prev = q
        channels = [('rotation_quaternion', [[q[i] for q in qs] for i in range(4)])]
        if b == 'Hips':
            channels.append(('location', [[pose[b][0][i] for pose in fr] for i in range(3)]))
        for prop, rows in channels:
            path = f'pose.bones["{pb.name}"].{prop}'
            for i, vals in enumerate(rows):
                fc = act.fcurve_ensure_for_datablock(body, path, index=i, group_name=pb.name)
                fc.keyframe_points.add(n)
                fc.keyframe_points.foreach_set('co', [c for f in range(n) for c in (f, vals[f])])
                for k in fc.keyframe_points:
                    k.interpolation = 'LINEAR'
                fc.update()
    track = body.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    track.mute = True
    body.animation_data.action = None
    return act


def measure(rig, act):
    sc = bpy.context.scene
    rig.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    hips = next(b for b in rig.pose.bones if bare(b.name) == 'Hips')
    hand = next((b for b in rig.pose.bones if bare(b.name) == 'RightHand'), None)
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
        if hand is not None:
            h = (rig.matrix_world @ hand.matrix).translation.copy()
            if h_prev is not None and (h - h_prev).length * FPS > peak_v:
                peak_v, peak_f = (h - h_prev).length * FPS, f
            h_prev = h
        fwd = m.to_3x3() @ axis
        fwd.z = 0
        yaw = math.degrees(math.atan2(FWD.cross(fwd).z, FWD.dot(fwd))) if fwd.length > 1e-6 else 0.0
        pts.append((f - f0, p.dot(FWD), p.dot(LEFT), yaw))
    rig.animation_data.action = None
    n = f1 - f0
    step = max(1, round(FPS / SAMPLE_HZ))
    keep = [pts[i] for i in range(0, n + 1, step)]
    if keep[-1][0] != n:
        keep.append(pts[-1])
    num = lambda v, places=3: (lambda x: int(x) if x == int(x) else x)(round(v, places))
    return {
        'frames': n, 'dur': num(n / FPS),
        'forward': num(pts[-1][1]), 'left': num(pts[-1][2]), 'yaw': num(pts[-1][3], 1), 'rise': num(rise),
        'height': num(p0.z), 'low': num(low), 'peak': num((peak_f - f0) / FPS),
        'travel': [[num(fr / FPS), num(a), num(b), num(y, 1)] for fr, a, b, y in keep],
    }


SEGMENTS = {
    'head': ('Head', 'HeadTop_End'), 'torso': ('Hips', 'Neck'),
    'armL': ('LeftArm', 'LeftForeArm'), 'forearmL': ('LeftForeArm', 'LeftHand'), 'handL': ('LeftHand', 'LeftHandMiddle4'),
    'armR': ('RightArm', 'RightForeArm'), 'forearmR': ('RightForeArm', 'RightHand'), 'handR': ('RightHand', 'RightHandMiddle4'),
    'uplegL': ('LeftUpLeg', 'LeftLeg'), 'legL': ('LeftLeg', 'LeftFoot'), 'footL': ('LeftFoot', 'LeftToe_End'),
    'uplegR': ('RightUpLeg', 'RightLeg'), 'legR': ('RightLeg', 'RightFoot'), 'footR': ('RightFoot', 'RightToe_End'),
}


def blades(rig, objs):
    """Each blade the rig file names: its bone's name, and its guard and tip in that bone's rest frame
    (see the header)."""
    out = {}
    for name in spec.get('blades', []):
        pattern = spec['meshes'][name]
        found = [o for o in objs if o.type == 'MESH' and re.search(pattern, o.name)]
        if len(found) != 1:
            raise SystemExit(f'anim export: the blade {name} matches {len(found)} meshes by {pattern}, and is one')
        o = found[0]
        groups = {g.index: g.name for g in o.vertex_groups}
        held = {groups[g.group] for v in o.data.vertices for g in v.groups if g.weight > 0}
        if len(held) != 1:
            raise SystemExit(f'anim export: the blade {name} is weighted to {sorted(held)}, and is carried by one bone')
        bone = rig.data.bones[held.pop()]
        into = bone.matrix_local.inverted() @ rig.matrix_world.inverted() @ o.matrix_world
        pts = [into @ v.co for v in o.data.vertices]
        tip = max(pts, key=lambda p: p.length)
        pommel = max(pts, key=lambda p: (p - tip).length)
        axis = (tip - pommel).normalized()
        along = lambda p: (p - pommel).dot(axis)
        off = lambda p: (p - pommel - axis * along(p)).length
        grip, reach = along(Vector((0, 0, 0))), along(tip)
        guard = max((p for p in pts if grip <= along(p) <= reach), key=off)
        out[name] = (bare(bone.name), pommel + axis * along(guard), tip)
        metres = (rig.matrix_world.to_3x3() @ bone.matrix_local.to_3x3() @ (axis * (reach - along(guard)))).length
        print(f'BLADE {name} bone={bare(bone.name)} length={metres:.3f}m')
    return out


def ends(rig, acts, held):
    """Each segment's two ends on every frame of every clip, and each blade's, `held` (see the header)."""
    sc = bpy.context.scene
    bone = lambda name: next(b for b in rig.pose.bones if bare(b.name) == name)
    hips = next(b for b in rig.pose.bones if b.parent is None)
    # Blender's z-up to glTF's y-up: (x, y, z) -> (x, z, -y).
    gltf = lambda v: [v.x, v.z, -v.y]
    at = lambda b: gltf(rig.matrix_world @ b.head)
    # The hips' rest across the ground: the armature with no action, at rest.
    rig.animation_data.action = None
    for b in rig.pose.bones:
        b.location, b.rotation_quaternion, b.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
    bpy.context.view_layer.update()
    rest = at(hips)
    out = {}
    for name, act in acts.items():
        rig.animation_data.action = act
        first, last = (int(round(f)) for f in act.frame_range)
        sc.frame_set(first)
        start = at(hips)
        sc.frame_set(last)
        end = at(hips)
        rows = {s: [] for s in [*SEGMENTS, *held]}
        for f in range(first, last + 1):
            sc.frame_set(f)
            s = (f - first) / max(1, last - first)
            # Taken off every point across the ground: the steady progress, less the hips' rest.
            shift = [start[0] + (end[0] - start[0]) * s - rest[0], 0, start[2] + (end[2] - start[2]) * s - rest[2]]
            row = lambda pa, pb: [round(c, 4) for c in [pa[0] - shift[0], pa[1], pa[2] - shift[2], pb[0] - shift[0], pb[1], pb[2] - shift[2]]]
            for seg, (a, b) in SEGMENTS.items():
                rows[seg].append(row(at(bone(a)), at(bone(b))))
            for seg, (by, guard, tip) in held.items():
                m = rig.matrix_world @ bone(by).matrix
                rows[seg].append(row(gltf(m @ guard), gltf(m @ tip)))
        out[name] = {'fps': FPS, **rows}
    rig.animation_data.action = None
    return out


def trs(t, r, s):
    """A node's matrix from its translation, its rotation [x, y, z, w] and its scale."""
    x, y, z, w = r
    m = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]) * np.array(s)
    out = np.eye(4)
    out[:3, :3] = m
    out[:3, 3] = t
    return out


def grips(raw, rig, held):
    """Each blade's guard and tip in the frame of the glb's joint that carries it (see the header),
    read off the glb's own nodes before it is packed."""
    gltf, _ = split(raw)
    nodes = gltf['nodes']
    parent = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
    joints = {j for s in gltf.get('skins', []) for j in s['joints']}
    by = {bare(n.get('name', '')): i for i, n in enumerate(nodes) if i in joints}
    rest = lambda i: (nodes[i].get('translation', [0, 0, 0]), nodes[i].get('rotation', [0, 0, 0, 1]), nodes[i].get('scale', [1, 1, 1]))

    def world(i):
        m = np.eye(4)
        while i is not None:
            m = (np.array(nodes[i]['matrix']).reshape(4, 4).T if 'matrix' in nodes[i] else trs(*rest(i))) @ m
            i = parent.get(i)
        return m

    # Blender's z-up to glTF's y-up: (x, y, z) -> (x, z, -y).
    gltf_of = lambda v: np.array([v.x, v.z, -v.y, 1.0])
    # The glb's hips at rest stand where Blender's do, or the measure below would be in another frame.
    hips = next(j for j in joints if parent.get(j) not in joints)
    off = np.linalg.norm(world(hips)[:3, 3] - gltf_of(rig.matrix_world @ next(b for b in rig.data.bones if bare(b.name) == bare(nodes[hips]['name'])).head_local)[:3])
    if off > 1e-3:
        raise SystemExit(f'anim export: the glb\'s hips stand {off:.4f} m from Blender\'s at rest')
    out = {}
    for name, (bone, guard, tip) in held.items():
        if bone not in by:
            raise SystemExit(f'anim export: the glb has no joint {bone}, which carries the blade {name}')
        b = rig.data.bones[next(n for n in rig.data.bones.keys() if bare(n) == bone)]
        into = np.linalg.inv(world(by[bone]))
        at = lambda p: [round(float(c), 6) for c in (into @ gltf_of(rig.matrix_world @ b.matrix_local @ p))[:3]]
        out[name] = {'bone': bone, 'guard': at(guard), 'tip': at(tip)}
    print(f'GRIPS {",".join(out) or "none"}')
    return out


def pixels(img):
    px = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(-1, 4)


def image_into(tree, sock):
    """The image node feeding a socket directly, if one does."""
    if not sock.is_linked:
        return None
    n = sock.links[0].from_node
    return n if n.type == 'TEX_IMAGE' and n.image else None


def metal_rough(objs):
    """Every specular/gloss material on the body's meshes made metal/rough (see the header)."""
    mats = {s.material for o in objs if o.type == 'MESH' for s in o.material_slots if s.material}
    for m in mats:
        tree = m.node_tree
        bsdf = next((n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if tree else None
        gloss = bsdf and image_into(tree, bsdf.inputs['Roughness'])
        if not gloss or 'gloss' not in gloss.image.name.lower():
            continue
        bsdf.inputs['Metallic'].default_value = 0.0
        g = gloss.image
        rough = bpy.data.images.new(f'{g.name}_rough', g.size[0], g.size[1], alpha=False, is_data=True)
        px = pixels(g)
        px[:, :3] = 1.0 - px[:, :3]
        px[:, 3] = 1.0
        rough.pixels.foreach_set(px.ravel())
        rough.pack()
        gloss.image = rough
        spec = bsdf.inputs['Specular IOR Level']
        for l in list(spec.links):
            tree.links.remove(l)
        spec.default_value = 0.5
        alpha = bsdf.inputs['Alpha']
        for l in list(alpha.links):
            tree.links.remove(l)
        alpha.default_value = 1.0
        base = image_into(tree, bsdf.inputs['Base Color'])
        if base and pixels(base.image)[:, 3].min() < 1.0:
            clip = tree.nodes.new('ShaderNodeMath')
            clip.operation = 'ROUND'
            tree.links.new(base.outputs['Alpha'], clip.inputs[0])
            tree.links.new(clip.outputs[0], alpha)
        for n in [n for n in tree.nodes if n.type == 'TEX_IMAGE' and not any(s.is_linked for s in n.outputs)]:
            tree.nodes.remove(n)
        print(f'METAL_ROUGH {m.name} alpha={"clip" if alpha.is_linked else "opaque"}')


def split(path):
    """A glb's JSON and its binary chunk, header and all."""
    data = open(path, 'rb').read()
    length = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + length].decode('utf8')), data[20 + length:]


def glb(gltf, binary):
    """A glb of this JSON and that binary chunk."""
    text = json.dumps(gltf, separators=(',', ':')).encode('utf8')
    text += b' ' * (-len(text) % 4)
    return struct.pack('<III', 0x46546c67, 2, 20 + len(text) + len(binary)) + struct.pack('<II', len(text), 0x4e4f534a) + text + binary


def skinned_names(gltf):
    return sorted(n.get('name') or '' for n in gltf.get('nodes', []) if 'mesh' in n and 'skin' in n)


def pack(raw, out):
    """The export's glb packed by gltfpack, its skinned meshes named as the export named them (see the header)."""
    packed = raw + '.packed.glb'
    subprocess.run([GLTFPACK, '-cc', '-kn', '-km', '-at', '20', '-i', raw, '-o', packed], check=True)
    want = skinned_names(split(raw)[0])
    gltf, binary = split(packed)
    nodes = gltf['nodes']
    for i, node in enumerate(nodes):
        if 'mesh' not in node or 'skin' not in node or node.get('name'):
            continue
        parent = next((p for p in nodes if i in p.get('children', [])), None)
        if not parent or not parent.get('name'):
            raise SystemExit(f'anim export: {out}: the skinned mesh node {i} has no named parent to take its name from')
        node['name'] = parent.pop('name')
    got = skinned_names(gltf)
    if got != want:
        raise SystemExit(f'anim export: {out}: the packed skinned meshes are {got}, and the export\'s {want}')
    open(out, 'wb').write(glb(gltf, binary))
    print(f'PACK {out} raw={os.path.getsize(raw)} packed={os.path.getsize(out)} meshes={",".join(got)}')


work = tempfile.mkdtemp(prefix='anim-export-')
table = None
measured = {}
gripped = {}
skins = {}
for body_name, out in OUTS.items():
    fresh()
    body, keep = load(spec['bodies'][body_name], LIBRARY)
    # The FBX importer sets the scene's rate to the body file's own (24 for some), and the glTF export
    # times every key by the scene's rate, so the clips' frames, sampled at FPS, are timed at FPS again.
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.render.fps_base = 1
    body.name = 'rig'
    for o in keep:
        if o.parent is None:
            o.scale = o.scale * spec.get('size', 1)
    bpy.context.view_layer.update()
    body.animation_data_create()
    body.animation_data.action = None
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    spread = spreads(body, spec.get('spread', {}).get(body_name, 0))
    acts = {name: write(body, name, fr, spread, fixes[name]) for name, fr in clips.items()}
    if table is None:
        table = {name: measure(body, act) for name, act in acts.items()}
    metal_rough(keep)
    for img in bpy.data.images:
        if img.size[0] > 1024 or img.size[1] > 1024:
            img.scale(min(1024, img.size[0]), min(1024, img.size[1]))
    bpy.ops.object.select_all(action='DESELECT')
    for o in keep:
        o.select_set(True)
    raw = os.path.join(work, f'{body_name}.glb')
    bpy.ops.export_scene.gltf(filepath=raw, use_selection=True, export_animations=True,
                              export_animation_mode='NLA_TRACKS', export_anim_single_armature=True,
                              export_apply=True, export_optimize_animation_size=True,
                              export_image_format='JPEG', export_jpeg_quality=75)
    held = blades(body, keep)
    gripped[body_name] = grips(raw, body, held)
    pack(raw, out)
    print(f'MODEL {body_name} {out} clips={len(acts)} meshes={sum(o.type == "MESH" for o in keep)}')
    measured[body_name] = ends(body, acts, held)
    print(f'ENDS {body_name} clips={len(measured[body_name])}')
    skin = touches.skin_of(body, keep)
    skins[body_name] = {name: touches.measure(skin, act, file_of(spec['clips'][name])) for name, act in acts.items()}
    print(f'SKIN {body_name} clips={len(skins[body_name])}')

shutil.rmtree(work)
json.dump(table, open(TABLE, 'w'))
print(f'TABLE {TABLE} clips={len(table)}')
POSES = os.path.splitext(TABLE)[0] + '.poses.json'
json.dump(posed, open(POSES, 'w'))
print(f'POSES {POSES} poses={len(posed)}')
ENDS = os.path.splitext(TABLE)[0] + '.ends.json'
json.dump(measured, open(ENDS, 'w'))
print(f'ENDS {ENDS} bodies={len(measured)}')
GRIPS = os.path.splitext(TABLE)[0] + '.grips.json'
json.dump(gripped, open(GRIPS, 'w'))
print(f'GRIPS {GRIPS} bodies={len(gripped)}')
# What each clip touches on each body, read off its skin by anim's touch reader (see the header).
SKINS = os.path.splitext(TABLE)[0] + '.skin.json'
json.dump(skins, open(SKINS, 'w'), separators=(',', ':'))
TOUCHES = os.path.splitext(TABLE)[0] + '.touches.json'
node = ENV.get('NODE') or shutil.which('node', path=ENV.get('PATH'))
if not node:
    raise SystemExit('anim.export.py: no node on the PATH to read what the clips touch with (anim.touches.mjs)')
subprocess.run([node, os.path.join(HERE, 'anim.touches.mjs'), 'rig', RIG, SKINS, TOUCHES], check=True)
os.remove(SKINS)
print(f'TOUCHES {TOUCHES} bodies={len(skins)}')
