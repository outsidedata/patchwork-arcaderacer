# view.py: look at any glb without running the game.
#
#   Blender -b --python view.py -- <model.glb> <outdir> [--look x,y,z,r ...]
#
# It imports the glb as the game would load it (glTF's frame: +y up), prints each node (name, kind,
# parent, triangles, materials), the triangles in all, the bounding box, and the faces lying on faces
# (COPLANAR, checks.py: PASS at 0, each pair's place listed above it), and renders, in the model's
# own materials:
#   <name>-high.png    four turntable angles from three-quarter height, beside a 1.8 m figure;
#   <name>-eye.png     the same four from eye height;
#   <name>-plan.png    side, top, front and back, orthographic;
#   <name>-near-<k>.png  the model close, a section at a time: it is cut into three along its longest
#                      side, and each third is looked at from eight sides, above and below, near
#                      enough that a part a few centimetres across shows;
#   <name>-look-<k>.png  with each `--look x,y,z,r`, four views about that point (glb frame) from
#                      r metres.
# Then look at every sheet, at full size. What is wrong with a model (a part through the hull, a gap,
# a fin floating off its root) is found by looking, not by measuring.
# Renders are Eevee under Khronos PBR Neutral, a sun and a sky fill, 960 × 540 a frame.

import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from checks import B, G, coplanar, sheet

argv = sys.argv[sys.argv.index('--') + 1:]
PATH, OUT = argv[0], argv[1]
NAME = os.path.splitext(os.path.basename(PATH))[0]
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=PATH)
objs = [o for o in bpy.data.objects]
bpy.context.view_layer.update()


def mat(name, rgb, rough=0.6):
    m = bpy.data.materials.new(name)
    try:
        if not m.use_nodes:
            m.use_nodes = True
    except AttributeError:
        pass
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = rough
    return m


tris = 0
lo, hi = np.full(3, 1e9), np.full(3, -1e9)
print(f'MODEL {NAME}')
for o in sorted(objs, key=lambda o: o.name):
    par = o.parent.name if o.parent else '-'
    t = G(o.matrix_world.translation)
    extra = ''
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        n = len(o.data.loop_triangles)
        tris += n
        extra = f' tris={n} mats={[m.name for m in o.data.materials if m]}'
        for v in o.data.vertices:
            g = G(o.matrix_world @ v.co)
            lo, hi = np.minimum(lo, g[:]), np.maximum(hi, g[:])
    print(f'  NODE {o.type.lower():<6} {o.name:<20} parent={par:<14} at=[{t.x:.3f}, {t.y:.3f}, {t.z:.3f}]{extra}')
print(f'  TRIS {tris}')
print(f'BBOX {NAME} x [{lo[0]:.3f}, {hi[0]:.3f}] y [{lo[1]:.3f}, {hi[1]:.3f}] z [{lo[2]:.3f}, {hi[2]:.3f}]  size [{hi[0] - lo[0]:.3f}, {hi[1] - lo[1]:.3f}, {hi[2] - lo[2]:.3f}]')
coplanar([o for o in objs if o.type == 'MESH'])

# ------------------------------------------------------------------------------------- the stage

ground = lo[1]
bpy.ops.mesh.primitive_plane_add(size=max(60, float(np.max(hi - lo)) * 6))
gp = bpy.context.active_object
gp.location = B((0, ground - 0.002, 0))
gp.data.materials.append(mat('ground', (0.16, 0.18, 0.12), rough=0.95))
fig = mat('figure', (0.12, 0.22, 0.45), rough=0.7)
fz = hi[2] + 0.9
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.17, depth=1.5, location=B(((lo[0] + hi[0]) / 2, ground + 0.75, fz)))
figure = [bpy.context.active_object]
figure[0].data.materials.append(fig)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=B(((lo[0] + hi[0]) / 2, ground + 1.68, fz)))
figure.append(bpy.context.active_object)
figure[1].data.materials.append(fig)

world = bpy.data.worlds.new('sky')
sc.world = world
try:
    if not world.use_nodes:
        world.use_nodes = True
except AttributeError:
    pass
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (0.55, 0.65, 0.8, 1)
bg.inputs['Strength'].default_value = 0.9
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3.2
sun.data.angle = math.radians(2)
sc.collection.objects.link(sun)
sun.rotation_euler = Euler((math.radians(50), math.radians(10), math.radians(35)))
try:
    sc.render.engine = 'BLENDER_EEVEE'
except TypeError:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.view_settings.view_transform = 'Khronos PBR Neutral'
sc.render.resolution_x, sc.render.resolution_y = 960, 540
sc.render.image_settings.file_format = 'PNG'
try:
    sc.eevee.taa_render_samples = 32
    sc.eevee.use_shadows = True
except AttributeError:
    pass
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
center = Vector(((lo + hi) / 2).tolist())


def aim(eye, target):
    e, t = B(eye), B(target)
    cam.location = e
    cam.rotation_euler = (t - e).to_track_quat('-Z', 'Y').to_euler()


def shot(path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


cam.data.lens = 35
radius = Vector(((hi - lo) / 2).tolist()).length
vfov = 2 * math.atan(18 * 9 / 16 / 35)
dist = max(radius / math.sin(vfov / 2) * 0.8, 3.0)
yaws = [35, 125, 215, 305]
paths = []
for k, yaw in enumerate(yaws):
    a, el = math.radians(yaw), math.radians(28)
    aim(center + Vector((math.cos(a) * math.cos(el), math.sin(el), math.sin(a) * math.cos(el))) * dist, center)
    paths.append(shot(os.path.join(OUT, f'_{NAME}-high{k}.png')))
sheet(paths, os.path.join(OUT, f'{NAME}-high.png'))
paths = []
for k, yaw in enumerate(yaws):
    a = math.radians(yaw)
    aim(Vector((center.x + math.cos(a) * dist * 0.85, ground + 1.6, center.z + math.sin(a) * dist * 0.85)),
        Vector((center.x, max(ground + 0.9, center.y), center.z)))
    paths.append(shot(os.path.join(OUT, f'_{NAME}-eye{k}.png')))
sheet(paths, os.path.join(OUT, f'{NAME}-eye.png'))

cam.data.type = 'ORTHO'
ext = Vector((hi - lo).tolist())
paths = []
for k, (dirn, up) in enumerate((((0, 0, -1), 'y'), ((0, 1, 0), 'x'), ((1, 0, 0), 'y'), ((-1, 0, 0), 'y'))):
    eye = center + Vector(dirn) * 200
    cam.location = B(eye)
    cam.rotation_euler = (B(center) - B(eye)).to_track_quat('-Z', 'Y').to_euler() if up == 'y' else Euler((0, 0, 0))
    cam.data.ortho_scale = (max(ext.x, (ext.y + 0.3) * 16 / 9) if k == 0 else max(ext.x, ext.z * 16 / 9) if k == 1 else max(ext.z, (ext.y + 0.3) * 16 / 9)) * 1.12
    cam.data.clip_end = 500
    paths.append(shot(os.path.join(OUT, f'_{NAME}-plan{k}.png')))
sheet(paths, os.path.join(OUT, f'{NAME}-plan.png'))

# ------------------------------------------------------------------------------------ close looks

cam.data.type = 'PERSP'
cam.data.lens = 50
for o in figure:
    o.hide_render = True
gp.hide_render = True                    # from below, the ground would hide the underside


# Views about `at` from `d` away (glb frame): eight round it from above and four from below.
def around(at, d, label):
    paths = []
    for el in (35, -30):
        for yaw in ((0, 45, 90, 135, 180, 225, 270, 315) if el > 0 else (45, 135, 225, 315)):
            a, e = math.radians(yaw), math.radians(el)
            aim(at + Vector((math.cos(a) * math.cos(e), math.sin(e), math.sin(a) * math.cos(e))) * d, at)
            paths.append(shot(os.path.join(OUT, f'_{NAME}-{label}-{len(paths)}.png')))
    sheet(paths, os.path.join(OUT, f'{NAME}-{label}.png'), cols=4)


# the model in thirds along its longest side, each looked at from just outside the whole model
long = int(np.argmax(hi - lo))
side = float(np.max(np.delete(hi - lo, long)))
for k in range(3):
    at = center.copy()
    at[long] = lo[long] + (hi[long] - lo[long]) * (k + 0.5) / 3
    around(at, max(side, (hi[long] - lo[long]) / 3) * 1.25, f'near-{k}')

for k, i in enumerate(i for i, a in enumerate(argv) if a == '--look'):
    x, y, z, r = (float(s) for s in argv[i + 1].split(','))
    around(Vector((x, y, z)), r, f'look-{k}')
