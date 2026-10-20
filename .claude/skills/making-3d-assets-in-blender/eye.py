# eye.py: look at a glb from inside it, from the eye the player sees it from: a cockpit, a cab, a
# room. Every line is computed off the exported glb.
#
#   Blender -b --python eye.py -- <model.glb> <outdir> --eye x,y,z [options]
#
#   --eye x,y,z        the eye, in the glb's frame (+y up): read it off the node or the file the game
#                      takes it from, never type it from memory
#   --forward x,y,z    the way the eye looks held level (default 0,0,1); yaw + turns to the left
#   --fov deg          the game camera's vertical field of view (default 60), as its renderer draws it
#   --aspect a         the view's width over its height (default 1.7778, 16:9)
#   --clear a,b        node-name prefixes the eye may see through: glass, a crack (default glass)
#   --line deg         the pitch above which only what is clear may stand: the line the world shows
#                      above, a glareshield's lip say (default -8)
#   --room m           the least distance the eye must have to any surface (default 0.15)
#   --screens prefix   node-name prefix of the surfaces something is drawn on (default screen.)
#   --down deg         how far down the second render looks: the least pitch the game allows (default 20)
#   --hide a,b         node-name prefixes left out of the renders, a state not seen in play (damage)
#
# It prints:
#   NODE ...      every mesh node, its triangles and materials, and TRIS in all
#   EYE           the least distance from the eye to any vertex: room for the head, PASS at ≥ --room
#   VIEW          of 64 × 64 rays across the level view, the share that meet anything not clear, and
#                 of the rays above --line, how many do: PASS at 0. Each blocked ray above the line is
#                 listed first as `VIEW blocked by <node> at yaw= pitch=`, so the fix is named
#   SCREEN <n>    each screen: the node the ray from the eye to its middle meets first, its four UV
#                 corners (3% in) seen with nothing in front (`corner u= v= behind <node>` names what
#                 hides one), its face turned to the eye (cosine ≥ 0.9), its size in degrees across
#                 and tall, where its middle stands (yaw, pitch), and whether that is in the level view
#   UV <n>        each screen's u running to the eye's right and v up, read off its corners: a picture
#                 drawn on it stands the right way round
#   COPLANAR      faces lying on faces (checks.py): PASS at 0
# and renders, under a sky and a sun, each screen showing a test card (an arrow up its left side and
# one right along its foot, a frame round its edge) so it is seen to stand right:
#   <outdir>/<name>-eye.png   from the eye: level; --down below level; 45° left; 45° right; up
#                             over the head; and behind (a 3 × 2 sheet, the first top left)
#   <outdir>/<name>-out.png   the model from outside: front three-quarter, side, above, behind

import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Euler, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from checks import B, G, tree, coplanar, sheet

argv = sys.argv[sys.argv.index('--') + 1:]
PATH, OUT = argv[0], argv[1]
NAME = os.path.splitext(os.path.basename(PATH))[0]
os.makedirs(OUT, exist_ok=True)


def opt(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


def vec(s):
    return Vector([float(x) for x in s.split(',')])


if '--eye' not in argv:
    raise SystemExit('eye.py: --eye x,y,z is required (the glb frame, +y up)')
EYE = vec(opt('--eye', ''))
FORWARD = vec(opt('--forward', '0,0,1')).normalized()
FOV = float(opt('--fov', '60'))
ASPECT = float(opt('--aspect', str(16 / 9)))
CLEAR = [s for s in opt('--clear', 'glass').split(',') if s]
LINE = float(opt('--line', '-8'))
ROOM = float(opt('--room', '0.15'))
SCREENS = opt('--screens', 'screen.')
DOWN = float(opt('--down', '20'))
HIDE = [s for s in opt('--hide', '').split(',') if s]
UP = Vector((0, 1, 0))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=PATH)
bpy.context.view_layer.update()
objs = [o for o in sc.objects if o.type == 'MESH']

tris = 0
print(f'MODEL {NAME}')
for o in sorted(objs, key=lambda o: o.name):
    o.data.calc_loop_triangles()
    n = len(o.data.loop_triangles)
    tris += n
    print(f'  NODE {o.name:<20} tris={n} mats={[m.name for m in o.data.materials if m]}')
print(f'  TRIS {tris}')

T = tree(objs)


def clear(name):
    return name is None or any(name.startswith(c) for c in CLEAR)


# The way the eye looks for a yaw (+ to the left) and a pitch (+ up), in degrees, and its right and up.
def look(yaw, pitch):
    level = Matrix.Rotation(math.radians(yaw), 3, UP) @ FORWARD
    f = (level * math.cos(math.radians(pitch)) + UP * math.sin(math.radians(pitch))).normalized()
    r = f.cross(UP).normalized()
    return f, r, r.cross(f)


def angles(d):
    """A direction's yaw (+ left of forward) and pitch, in degrees."""
    right = FORWARD.cross(UP).normalized()
    return math.degrees(math.atan2(-d.dot(right), d.dot(FORWARD))), math.degrees(math.asin(max(-1, min(1, d.normalized().dot(UP)))))


# ------------------------------------------------------------------------------------------ the eye

room = min((Vector(v) - EYE).length for v in T.verts)
print(f'EYE room={room:.3f} {"PASS" if room >= ROOM else "FAIL"}')

f, r, u = look(0, 0)
th = math.tan(math.radians(FOV / 2))
blocked = high = n_high = 0
hits = {}
N = 64
for i in range(N):
    for j in range(N):
        x, y = (i + 0.5) / N * 2 - 1, (j + 0.5) / N * 2 - 1
        d = (f + r * x * th * ASPECT + u * y * th).normalized()
        hit, _ = T.first(EYE, d)
        bad = not clear(hit)
        blocked += bad
        yaw, pitch = angles(d)
        if pitch > LINE:
            n_high += 1
            high += bad
            if bad:
                key = (hit, round(yaw), round(pitch, 1))
                hits[key] = hits.get(key, 0) + 1
for (name, yaw, pitch), n in sorted(hits.items()):
    print(f'  VIEW blocked by {name} at yaw={yaw}° pitch={pitch}°')
print(f'VIEW level covered={blocked / N / N:.3f}  above{LINE:+g}°={high}/{n_high} {"PASS" if high == 0 else "FAIL"}')

# ---------------------------------------------------------------------------------------- the screens

screens = sorted([o for o in objs if o.name.startswith(SCREENS)], key=lambda o: o.name)
for o in screens:
    me = o.data
    ws = [G(o.matrix_world @ v.co) for v in me.vertices]
    mid = sum(ws, Vector()) / len(ws)
    d = (mid - EYE).normalized()
    hit, _ = T.first(EYE, d)
    nrm = Vector()
    for t in me.loop_triangles:
        a, b, c = (ws[k] for k in t.vertices)
        nrm += (b - a).cross(c - a)
    nrm.normalize()
    facing = -nrm.dot(d)
    yp = [angles(w - EYE) for w in ws]
    across = max(y for y, _ in yp) - min(y for y, _ in yp)
    tall = max(p for _, p in yp) - min(p for _, p in yp)
    my, mp = angles(d)
    hfov = math.degrees(math.atan(th * ASPECT))
    inview = abs(my) <= hfov and abs(mp) <= FOV / 2
    if not me.uv_layers:
        print(f'SCREEN {o.name:<20} has no UVs FAIL')
        continue
    uvs = me.uv_layers[0].data
    # each vertex's UV, and the vertices at the UV square's corners and edges
    uv_of = {}
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv_of[me.loops[li].vertex_index] = tuple(uvs[li].uv)
    corner = {}
    for vi, (cu, cv) in uv_of.items():
        ru, rv = round(cu), round(cv)
        if abs(cu - ru) < 1e-6 and abs(cv - rv) < 1e-6:
            corner[(ru, rv)] = ws[vi]
    seen = [(k, T.first(EYE, ((c + (mid - c) * 0.03) - EYE).normalized())[0]) for k, c in sorted(corner.items())]
    for (cu, cv), h in seen:
        if h != o.name:
            print(f'  SCREEN {o.name} corner u={cu} v={cv} behind {h}')
    shown = sum(h == o.name for _, h in seen)
    ok = hit == o.name and facing >= 0.9 and shown == 4 and inview
    print(f'SCREEN {o.name:<20} first={hit} corners={shown}/4 facing={facing:.3f} across={across:.1f}° tall={tall:.1f}° at yaw={my:+.1f}° pitch={mp:+.1f}° inview={inview} {"PASS" if ok else "FAIL"}')
    edge = lambda test: [ws[vi] for vi, uv in uv_of.items() if test(uv)]
    mean = lambda ps: sum(ps, Vector()) / len(ps)
    u0, u1 = edge(lambda uv: uv[0] < 1e-6), edge(lambda uv: uv[0] > 1 - 1e-6)
    v0, v1 = edge(lambda uv: uv[1] < 1e-6), edge(lambda uv: uv[1] > 1 - 1e-6)
    if not (u0 and u1 and v0 and v1):
        print(f'UV {o.name:<20} does not span 0..1 FAIL')
        continue
    _, sr, su = look(my, mp)
    right = (mean(u1) - mean(u0)).dot(sr) > 0
    up = (mean(v1) - mean(v0)).dot(su) > 0
    print(f'UV {o.name:<20} u-right={right} v-up={up} {"PASS" if right and up else "FAIL"}')

coplanar(objs)

# ------------------------------------------------------------------------------------------ the stage

# A test card: a frame, an arrow up the left side and one right along the foot, lit on its own.
def card(name):
    w, h = 256, 160
    px = np.zeros((h, w, 4))
    px[..., :3] = (0.02, 0.06, 0.09)
    px[..., 3] = 1
    px[2:-2, 2:4, :3] = px[2:-2, -4:-2, :3] = px[2:4, 2:-2, :3] = px[-4:-2, 2:-2, :3] = (0.3, 0.85, 1.0)
    for k in range(10, h - 20):                       # the arrow up, on the left
        px[k, 18:22, :3] = (1, 1, 1)
    for k in range(12):
        px[h - 20 - k, 20 - k:22 + k, :3] = (1, 1, 1)
    for k in range(20, w - 30):                       # the arrow right, along the foot
        px[18:22, k, :3] = (1, 0.7, 0.3)
    for k in range(12):
        px[20 - k:22 + k, w - 30 + k, :3] = (1, 0.7, 0.3)
    im = bpy.data.images.new(f'card.{name}', w, h)
    im.pixels = px.ravel()
    m = bpy.data.materials.new(f'card.{name}')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = im
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.2
    outp = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(tex.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], outp.inputs['Surface'])
    return m


for o in screens:
    if o.data.materials:
        o.data.materials[0] = card(o.name)
    else:
        o.data.materials.append(card(o.name))
for o in objs:
    if any(o.name.startswith(h) for h in HIDE):
        o.hide_render = True

lo = np.array([min(v[i] for v in T.verts) for i in range(3)])
hi = np.array([max(v[i] for v in T.verts) for i in range(3)])
world = bpy.data.worlds.new('sky')
sc.world = world
try:
    if not world.use_nodes:
        world.use_nodes = True
except AttributeError:
    pass
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (0.5, 0.62, 0.8, 1)
bg.inputs['Strength'].default_value = 1.0
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3.0
sc.collection.objects.link(sun)
sun.rotation_euler = Euler((math.radians(40), math.radians(-20), math.radians(160)))
bpy.ops.mesh.primitive_plane_add(size=max(200, float(np.max(hi - lo)) * 10), location=B((0, float(lo[1]) - 2, 0)))
gm = bpy.data.materials.new('ground')
gm.use_nodes = True
next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.35, 0.25, 0.14, 1)
bpy.context.active_object.data.materials.append(gm)

try:
    sc.render.engine = 'BLENDER_EEVEE'
except TypeError:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.view_settings.view_transform = 'Khronos PBR Neutral'
sc.render.resolution_x = 960
sc.render.resolution_y = round(960 / ASPECT)
sc.render.image_settings.file_format = 'PNG'
try:
    sc.eevee.taa_render_samples = 32
except AttributeError:
    pass

cam_data = bpy.data.cameras.new('cam')
cam_data.clip_start = 0.01
cam_data.sensor_fit = 'VERTICAL'
cam = bpy.data.objects.new('cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam


def aim(at, target, fov=FOV):
    cam_data.angle_y = math.radians(fov)
    e, t = B(at), B(target)
    cam.location = e
    cam.rotation_euler = (t - e).to_track_quat('-Z', 'Y').to_euler()


def shot(path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


paths = []
for k, (yaw, pitch) in enumerate(((0, 0), (0, -DOWN), (45, -5), (-45, -5), (0, 70), (180, 0))):
    d, _, _ = look(yaw, pitch)
    aim(EYE, EYE + d)
    paths.append(shot(os.path.join(OUT, f'_{NAME}-eye{k}.png')))
sheet(paths, os.path.join(OUT, f'{NAME}-eye.png'), cols=3)

paths = []
mid = Vector(((lo + hi) / 2).tolist())
size = float(np.max(hi - lo))
right = FORWARD.cross(UP).normalized()
for k, at in enumerate((FORWARD * 1.4 + right * 1.0 + UP * 0.9, right * 2.0 + UP * 0.2, UP * 2.6 + FORWARD * 0.01, -FORWARD * 1.6 + right * 0.6 + UP * 1.0)):
    aim(mid + at.normalized() * size * 1.6, mid, 40)
    paths.append(shot(os.path.join(OUT, f'_{NAME}-out{k}.png')))
sheet(paths, os.path.join(OUT, f'{NAME}-out.png'))
