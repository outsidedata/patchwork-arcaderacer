# anim's export: a rig file's clips baked onto each body it names, one glb per body, and the rig's
# `table` measured. Run by the anim extension's route (`anim.route.ts`), or by hand:
#
#   Blender -b --factory-startup --python plugins/anim/anim.export.py -- \
#       <rig.json> <table.json> <body>=<out.glb> [<body>=<out.glb> ...]
#
# The rig file names its bodies, paths under the library, and the file of each clip, paths under
# ~/troupe-collection. The library is `PATCHWORK_LIBRARY` from the environment, else from the repo's
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
#   rebase  `{ from: "<fbx>", onto: "<clip>" }`: the clip is moved from the pose it was authored
#           around to the pose another clip starts in. Each bone's turn on each frame is taken as a
#           turn away from its turn on the first frame of `from`, and that same turn is laid onto the
#           bone's turn on the first frame of `onto`; the hips' position likewise. A pack's fire and
#           reload were authored around a rifle held 22 cm further forward than the locomotion pack's
#           aim, and on the upper channel that difference would jump the rifle on every shot.
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
from mathutils import Quaternion, Vector

args = sys.argv[sys.argv.index('--') + 1:]
RIG, TABLE = args[0], args[1]
OUTS = dict(a.split('=', 1) for a in args[2:])
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..')


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
C = os.path.expanduser('~/troupe-collection')
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


clips = {}
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


def write(body, name, fr, spread):
    """The clip as an action on the body, and an NLA track that holds it."""
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


def ends(rig, acts):
    """Each segment's two ends on every frame of every clip (see the header)."""
    sc = bpy.context.scene
    bone = lambda name: next(b for b in rig.pose.bones if bare(b.name) == name)
    hips = next(b for b in rig.pose.bones if b.parent is None)
    # Blender's z-up to glTF's y-up: (x, y, z) -> (x, z, -y).
    at = lambda b: (lambda v: [v.x, v.z, -v.y])(rig.matrix_world @ b.head)
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
        rows = {s: [] for s in SEGMENTS}
        for f in range(first, last + 1):
            sc.frame_set(f)
            s = (f - first) / max(1, last - first)
            # Taken off every point across the ground: the steady progress, less the hips' rest.
            shift = [start[0] + (end[0] - start[0]) * s - rest[0], 0, start[2] + (end[2] - start[2]) * s - rest[2]]
            for seg, (a, b) in SEGMENTS.items():
                pa, pb = at(bone(a)), at(bone(b))
                rows[seg].append([round(c, 4) for c in [pa[0] - shift[0], pa[1], pa[2] - shift[2], pb[0] - shift[0], pb[1], pb[2] - shift[2]]])
        out[name] = {'fps': FPS, **rows}
    rig.animation_data.action = None
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
    acts = {name: write(body, name, fr, spread) for name, fr in clips.items()}
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
    pack(raw, out)
    print(f'MODEL {body_name} {out} clips={len(acts)} meshes={sum(o.type == "MESH" for o in keep)}')
    measured[body_name] = ends(body, acts)
    print(f'ENDS {body_name} clips={len(measured[body_name])}')

shutil.rmtree(work)
json.dump(table, open(TABLE, 'w'))
print(f'TABLE {TABLE} clips={len(table)}')
ENDS = os.path.splitext(TABLE)[0] + '.ends.json'
json.dump(measured, open(ENDS, 'w'))
print(f'ENDS {ENDS} bodies={len(measured)}')
